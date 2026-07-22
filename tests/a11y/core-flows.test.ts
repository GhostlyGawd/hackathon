import AxeBuilder from "@axe-core/playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { QUALITY_PROFILE } from "../../packages/core/src/quality-observability.js";
import {
  startQualityBrowserSession,
  type QualityBrowserSession,
} from "../helpers/quality-browser.js";

describe("WCAG 2.2 AA core flows", () => {
  let session: QualityBrowserSession;

  beforeAll(async () => {
    session = await startQualityBrowserSession("officer");
  }, 30_000);

  afterAll(async () => {
    await session.close();
  });

  it("has no automated WCAG A/AA violations across setup, review, run, finding, receipt, and hold surfaces", async () => {
    const results = await new AxeBuilder({ page: session.page })
      .withTags([...QUALITY_PROFILE.accessibility.automatedTags])
      .analyze();

    expect(
      results.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        nodes: violation.nodes.map((node) => node.target),
      })),
    ).toEqual([]);
  }, 30_000);

  it("keeps primary controls keyboard reachable and status meaning available as text", async () => {
    const sessionSelect = session.page.getByTestId("session-select");
    await sessionSelect.focus();
    await session.page.keyboard.press("Tab");
    expect(
      await session.page
        .getByTestId("start-session")
        .evaluate((element) => element === document.activeElement),
    ).toBe(true);

    const findingCard = session.page.locator('[data-finding-state="NEEDS_REVIEW"]');
    await findingCard.focus();
    await session.page.keyboard.press("Enter");
    await session.page
      .getByTestId("finding-detail")
      .locator('code:text-is("NEEDS_REVIEW")')
      .waitFor();

    const stopButton = session.page.getByTestId("stop-active-run");
    await stopButton.focus();
    expect(
      await stopButton.evaluate((element) => element === document.activeElement),
    ).toBe(true);

    for (const run of await session.page.locator("[data-run-state]").all()) {
      const state = await run.getAttribute("data-run-state");
      expect((await run.innerText()).toUpperCase()).toContain(state);
    }
    for (const finding of await session.page.locator("[data-finding-state]").all()) {
      const state = await finding.getAttribute("data-finding-state");
      expect((await finding.innerText()).toUpperCase()).toContain(state);
    }
    const approval = session.page.locator("[data-approval-state]");
    expect((await approval.innerText()).toUpperCase()).toContain(
      await approval.getAttribute("data-approval-state"),
    );
    for (const image of await session.page.locator("img").all()) {
      expect((await image.getAttribute("alt"))?.trim().length).toBeGreaterThan(0);
    }
  });
});
