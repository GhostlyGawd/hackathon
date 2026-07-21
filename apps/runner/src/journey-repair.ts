import {
  authorizationActionSchema,
  deterministicReplayDraftSchema,
  deterministicReplayVersionSchema,
  type AuthorizationAction,
  type DeterministicReplayDraft,
  type DeterministicReplayVersion,
} from "@pactwire/core";
import type { Page } from "playwright-core";
import { z } from "zod";
import {
  PlaywrightComputerUseAdapter,
  computerUseRunConfigSchema,
  type ComputerAction,
  type ComputerTargetDescriptor,
  type ComputerUseBrowserAdapter,
  type ComputerUseRunConfig,
} from "./computer-use.js";

const relativePath = z
  .string()
  .startsWith("/")
  .max(2_000)
  .refine((value) => {
    const base = "https://authorized.pactwire.invalid";
    return new URL(value, base).origin === base;
  });

export const journeyRepairDiscoveryObservationSchema = z
  .object({
    sequence: z.number().int().positive(),
    actionType: z.enum(["click", "double_click"]),
    controlId: z.string().min(1).max(500).nullable(),
    authorizationAction: authorizationActionSchema.nullable(),
    origin: z.string().url(),
    hrefPath: relativePath.nullable(),
    beforePath: relativePath,
    afterPath: relativePath,
  })
  .strict();
export type JourneyRepairDiscoveryObservation = z.infer<
  typeof journeyRepairDiscoveryObservationSchema
>;

function pagePath(page: Page): string {
  try {
    const current = new URL(page.url());
    return `${current.pathname}${current.search}`;
  } catch {
    return "/";
  }
}

function hrefPath(
  href: string | null,
  expectedOrigin: string,
): string | null {
  if (!href) return null;
  try {
    const parsed = new URL(href);
    return parsed.origin === expectedOrigin
      ? `${parsed.pathname}${parsed.search}`
      : null;
  } catch {
    return null;
  }
}

function immutableClone<T>(value: T): T {
  const clone = structuredClone(value);
  const freeze = (candidate: unknown): void => {
    if (
      typeof candidate !== "object" ||
      candidate === null ||
      Object.isFrozen(candidate)
    ) {
      return;
    }
    for (const nested of Object.values(candidate)) freeze(nested);
    Object.freeze(candidate);
  };
  freeze(clone);
  return clone;
}

interface PendingTarget {
  readonly action: ComputerAction;
  readonly target: ComputerTargetDescriptor | null;
  readonly beforePath: string;
}

export class JourneyRepairDiscoveryBrowserAdapter
  implements ComputerUseBrowserAdapter
{
  readonly #config: ComputerUseRunConfig;
  readonly #delegate: PlaywrightComputerUseAdapter;
  readonly #observations: JourneyRepairDiscoveryObservation[] = [];
  readonly #page: Page;
  #pending: PendingTarget | undefined;

  constructor(input: {
    readonly page: Page;
    readonly config: ComputerUseRunConfig;
    readonly completionCheck: () => boolean | Promise<boolean>;
    readonly readPolicyViolations?: () => readonly unknown[];
  }) {
    this.#page = input.page;
    this.#config = computerUseRunConfigSchema.parse(input.config);
    this.#delegate = new PlaywrightComputerUseAdapter({
      page: input.page,
      completionCheck: input.completionCheck,
      ...(input.readPolicyViolations
        ? { readPolicyViolations: input.readPolicyViolations }
        : {}),
    });
  }

  get browser(): ComputerUseBrowserAdapter {
    return this;
  }

  readObservations(): readonly JourneyRepairDiscoveryObservation[] {
    return immutableClone(this.#observations);
  }

  open(url: string): Promise<void> {
    return this.#delegate.open(url);
  }

  currentOrigin(): Promise<string> {
    return this.#delegate.currentOrigin();
  }

  async describeTarget(
    action: ComputerAction,
  ): Promise<ComputerTargetDescriptor | null> {
    const target = await this.#delegate.describeTarget(action);
    this.#pending = { action, target, beforePath: pagePath(this.#page) };
    return target;
  }

  async execute(action: ComputerAction): Promise<void> {
    const pending = this.#pending;
    this.#pending = undefined;
    await this.#delegate.execute(action);
    if (
      !pending ||
      pending.action !== action ||
      !pending.target ||
      (action.type !== "click" && action.type !== "double_click")
    ) {
      return;
    }
    const rule = this.#config.trustedControls.find(({ dataTestId }) =>
      pending.target?.dataTestIds.includes(dataTestId),
    );
    const observation = journeyRepairDiscoveryObservationSchema.parse({
      sequence: this.#observations.length + 1,
      actionType: action.type,
      controlId: rule?.dataTestId ?? null,
      authorizationAction: rule?.authorizationAction ?? null,
      origin: pending.target.origin,
      hrefPath: hrefPath(pending.target.href, pending.target.origin),
      beforePath: pending.beforePath,
      afterPath: pagePath(this.#page),
    });
    this.#observations.push(immutableClone(observation));
  }

  captureScreenshot(): Promise<string> {
    return this.#delegate.captureScreenshot();
  }

  completionObserved(): Promise<boolean> {
    return this.#delegate.completionObserved();
  }

  policyViolationCount(): number {
    return this.#delegate.policyViolationCount();
  }
}

export function createJourneyRepairDiscoveryBrowserAdapter(input: {
  readonly page: Page;
  readonly config: ComputerUseRunConfig;
  readonly completionCheck: () => boolean | Promise<boolean>;
  readonly readPolicyViolations?: () => readonly unknown[];
}): JourneyRepairDiscoveryBrowserAdapter {
  return new JourneyRepairDiscoveryBrowserAdapter(input);
}

function onlyOperationForAction(
  source: DeterministicReplayVersion,
  kind: "NAVIGATE" | "CLICK",
  action: AuthorizationAction,
) {
  const matches = source.operations.filter(
    (operation) =>
      operation.kind === kind && operation.authorizedAction === action,
  );
  return matches.length === 1 ? matches[0] : undefined;
}

export function deriveJourneyRepairCandidate(
  sourceCandidate: unknown,
  observationCandidates: readonly unknown[],
): DeterministicReplayDraft | null {
  const source = deterministicReplayVersionSchema.parse(sourceCandidate);
  const observations = z
    .array(journeyRepairDiscoveryObservationSchema)
    .max(500)
    .parse(observationCandidates);
  const replacements = new Map<
    string,
    { readonly field: "path" | "locator"; readonly value: string }
  >();

  for (const observation of observations) {
    if (!observation.controlId || !observation.authorizationAction) continue;
    if (observation.authorizationAction === "NAVIGATE") {
      if (
        !observation.hrefPath ||
        observation.beforePath === observation.afterPath ||
        observation.hrefPath !== observation.afterPath
      ) {
        continue;
      }
      const operation = onlyOperationForAction(source, "NAVIGATE", "NAVIGATE");
      if (!operation) return null;
      const prior = replacements.get(operation.operationId);
      if (prior && (prior.field !== "path" || prior.value !== observation.hrefPath)) {
        return null;
      }
      replacements.set(operation.operationId, {
        field: "path",
        value: observation.hrefPath,
      });
      continue;
    }

    const operation = onlyOperationForAction(
      source,
      "CLICK",
      observation.authorizationAction,
    );
    if (!operation) return null;
    const prior = replacements.get(operation.operationId);
    if (
      prior &&
      (prior.field !== "locator" || prior.value !== observation.controlId)
    ) {
      return null;
    }
    replacements.set(operation.operationId, {
      field: "locator",
      value: observation.controlId,
    });
  }

  if (replacements.size === 0) return null;
  const operations = source.operations.map((operation) => {
    const replacement = replacements.get(operation.operationId);
    if (!replacement) return operation;
    if (operation.kind === "NAVIGATE" && replacement.field === "path") {
      return { ...operation, path: replacement.value };
    }
    if (operation.kind === "CLICK" && replacement.field === "locator") {
      return {
        ...operation,
        locator: { kind: "TEST_ID" as const, value: replacement.value },
      };
    }
    return operation;
  });
  return immutableClone(
    deterministicReplayDraftSchema.parse({
      bindings: source.bindings,
      operations,
    }),
  );
}
