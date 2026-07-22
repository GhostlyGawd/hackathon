import AxeBuilder from "@axe-core/playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

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

  async function writeReport(name: string, value: unknown): Promise<void> {
    if (process.env.PACTWIRE_WRITE_QUALITY_REPORTS !== "1") return;
    const reportRoot = path.join(
      process.cwd(),
      "artifacts",
      "verification",
      "QLT-01",
      "reports",
    );
    await mkdir(reportRoot, { recursive: true });
    await writeFile(
      path.join(reportRoot, name),
      `${JSON.stringify(value, null, 2)}\n`,
      "utf8",
    );
  }

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
    await writeReport("accessibility-automated.json", {
      schemaVersion: "1.0.0",
      taskId: "QLT-01",
      capturedAt: new Date().toISOString(),
      sourceCommitSha: process.env.PACTWIRE_EVIDENCE_SOURCE_COMMIT ?? null,
      target: QUALITY_PROFILE.accessibility.standard,
      automatedTags: QUALITY_PROFILE.accessibility.automatedTags,
      browser: { engine: "Chromium", version: session.browser.version() },
      results: {
        violations: results.violations.length,
        incomplete: results.incomplete.length,
        passes: results.passes.length,
        inapplicable: results.inapplicable.length,
      },
    });
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

    const runs = await session.page.locator("[data-run-state]").all();
    for (const run of runs) {
      const state = await run.getAttribute("data-run-state");
      expect((await run.innerText()).toUpperCase()).toContain(state);
    }
    const findings = await session.page.locator("[data-finding-state]").all();
    for (const finding of findings) {
      const state = await finding.getAttribute("data-finding-state");
      expect((await finding.innerText()).toUpperCase()).toContain(state);
    }
    const approval = session.page.locator("[data-approval-state]");
    expect((await approval.innerText()).toUpperCase()).toContain(
      await approval.getAttribute("data-approval-state"),
    );
    const images = await session.page.locator("img").all();
    for (const image of images) {
      expect((await image.getAttribute("alt"))?.trim().length).toBeGreaterThan(0);
    }
    await writeReport("accessibility-semantics.json", {
      schemaVersion: "1.0.0",
      taskId: "QLT-01",
      capturedAt: new Date().toISOString(),
      sourceCommitSha: process.env.PACTWIRE_EVIDENCE_SOURCE_COMMIT ?? null,
      inspection:
        "Automated keyboard focus and DOM accessibility-tree assertions; no external screen-reader session was claimed.",
      checks: {
        keyboardActivation: "PASS",
        textStatusMeaning: "PASS",
        contextualImageAlternatives: "PASS",
      },
      observedCounts: {
        runStates: runs.length,
        findingStates: findings.length,
        approvalStates: 1,
        images: images.length,
      },
    });
  });
});
