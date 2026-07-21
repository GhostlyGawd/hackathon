import type { Locator, Page } from "playwright-core";
import type {
  DeterministicReplayAdapter,
  MaterializedReplayOperation,
  ReplayAdapterResult,
} from "./deterministic-replay.js";

interface ObservedResponse {
  readonly method: string;
  readonly origin: string;
  readonly path: string;
  readonly status: number;
}

function completed(): ReplayAdapterResult {
  return { status: "COMPLETED" };
}

function drifted(reasonCode: string): ReplayAdapterResult {
  return { status: "DRIFTED", reasonCode };
}

function locator(page: Page, value: string): Locator {
  return page.getByTestId(value);
}

async function waitUntil(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (await predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return false;
}

export function createPlaywrightReplayAdapter(
  page: Page,
  options: { readonly timeoutMs?: number } = {},
): DeterministicReplayAdapter {
  const timeoutMs = options.timeoutMs ?? 5_000;
  const responses: ObservedResponse[] = [];
  let responseCursor = 0;
  page.on("response", (response) => {
    const request = response.request();
    const responseUrl = new URL(response.url());
    responses.push({
      method: request.method(),
      origin: responseUrl.origin,
      path: responseUrl.pathname,
      status: response.status(),
    });
  });

  return {
    async execute(
      operation: MaterializedReplayOperation,
      context: { readonly baseUrl: string },
    ): Promise<ReplayAdapterResult> {
      try {
        switch (operation.kind) {
          case "NAVIGATE": {
            const baseUrl = new URL(context.baseUrl);
            const targetUrl = new URL(operation.path, baseUrl);
            if (targetUrl.origin !== baseUrl.origin) {
              return drifted("NAVIGATION_ORIGIN_MISMATCH");
            }
            const response = await page.goto(
              targetUrl.toString(),
              { waitUntil: "domcontentloaded", timeout: timeoutMs },
            );
            return response?.status() === operation.expectedStatus
              ? completed()
              : drifted("NAVIGATION_STATUS_MISMATCH");
          }
          case "ASSERT_VALUE": {
            const target = locator(page, operation.locator.value);
            await target.waitFor({ state: "visible", timeout: timeoutMs });
            return (await target.inputValue()) === operation.value
              ? completed()
              : drifted("BOUND_VALUE_MISMATCH");
          }
          case "FILL":
            await locator(page, operation.locator.value).fill(operation.value, {
              timeout: timeoutMs,
            });
            return completed();
          case "CLICK":
            await locator(page, operation.locator.value).click({
              timeout: timeoutMs,
            });
            return completed();
          case "CHECKPOINT": {
            if (operation.assertion.kind === "RESPONSE") {
              const assertion = operation.assertion;
              const expectedOrigin = new URL(context.baseUrl).origin;
              const matchingMethodPath = () =>
                responses.slice(responseCursor).filter(
                  (response) =>
                    response.origin === expectedOrigin &&
                    response.method === assertion.method &&
                    response.path === assertion.path,
                );
              const observed = await waitUntil(
                () => matchingMethodPath().length > 0,
                timeoutMs,
              );
              const matches = matchingMethodPath();
              responseCursor = responses.length;
              if (!observed) return drifted("CHECKPOINT_MISSING");
              return matches.some(
                (response) => response.status === assertion.status,
              )
                ? completed()
                : drifted("CHECKPOINT_STATUS_MISMATCH");
            }
            const assertion = operation.assertion;
            const target = locator(page, assertion.locator.value);
            const visible = await waitUntil(async () => {
              if (!(await target.isVisible())) return false;
              return (await target.textContent())?.includes(assertion.text) ?? false;
            }, timeoutMs);
            return visible ? completed() : drifted("CHECKPOINT_MISSING");
          }
          case "ASSERT_TEXT": {
            const target = locator(page, operation.locator.value);
            const visible = await waitUntil(async () => {
              if (!(await target.isVisible())) return false;
              return (await target.textContent())?.includes(operation.text) ?? false;
            }, timeoutMs);
            return visible ? completed() : drifted("EXPECTED_TEXT_MISSING");
          }
        }
      } catch {
        return drifted("TARGET_MISSING");
      }
    },
  };
}
