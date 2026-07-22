import assert from "node:assert/strict";
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { Then, When } from "@cucumber/cucumber";

When(
  "I activate a bounded finding and reach the stop control using only the keyboard",
  async function () {
    const finding = this.page.locator('[data-finding-state="NEEDS_REVIEW"]');
    await finding.scrollIntoViewIfNeeded();
    await finding.focus();
    assert.equal(
      await finding.evaluate((node) => node === node.ownerDocument.activeElement),
      true,
    );
    await this.page.keyboard.press("Enter");
    await this.page
      .getByTestId("finding-detail")
      .locator('code:text-is("NEEDS_REVIEW")')
      .waitFor();

    const stop = this.page.getByTestId("stop-active-run");
    await stop.scrollIntoViewIfNeeded();
    await stop.focus();
    await this.page.keyboard.press("Shift+Tab");
    await this.page.keyboard.press("Tab");
    assert.equal(
      await stop.evaluate((node) => node === node.ownerDocument.activeElement),
      true,
    );
  },
);

Then(
  "screen-reader text identifies every visible run, finding, and approval state",
  async function () {
    for (const run of await this.page.locator("[data-run-state]").all()) {
      const state = await run.getAttribute("data-run-state");
      assert.ok(state);
      assert.match((await run.ariaSnapshot()).toUpperCase(), new RegExp(state));
    }
    for (const finding of await this.page.locator("[data-finding-state]").all()) {
      const state = await finding.getAttribute("data-finding-state");
      assert.ok(state);
      assert.match(
        (await finding.ariaSnapshot()).toUpperCase(),
        new RegExp(state),
      );
    }
    const approval = this.page.locator("[data-approval-state]");
    const approvalState = await approval.getAttribute("data-approval-state");
    assert.ok(approvalState);
    assert.match(
      (await approval.ariaSnapshot()).toUpperCase(),
      new RegExp(approvalState),
    );
  },
);

Then("every visible product image has a contextual alternative", async function () {
  for (const image of await this.page.locator("img:visible").all()) {
    const alternative = (await image.getAttribute("alt"))?.trim();
    assert.ok(alternative, "Every visible product image needs non-empty alt text");
  }
});

Then("I capture the QLT-01 accessible review evidence", async function () {
  if (process.env.PACTWIRE_CAPTURE_CURATED_EVIDENCE !== "1") return;
  if (
    process.env.PACTWIRE_EVIDENCE_TASK &&
    process.env.PACTWIRE_EVIDENCE_TASK !== "QLT-01"
  ) {
    return;
  }
  const artifactRoot = path.join(
    process.cwd(),
    "artifacts",
    "verification",
    "QLT-01",
    "screenshots",
  );
  const curatedRoot = path.join(process.cwd(), "docs", "evidence", "QLT-01");
  await mkdir(artifactRoot, { recursive: true });
  await mkdir(curatedRoot, { recursive: true });

  const targets = [
    ["accessible-finding-review", this.page.getByTestId("finding-evaluation-panel")],
    ["accessible-authority-console", this.page.locator("#authority")],
  ];
  for (const [name, target] of targets) {
    await target.scrollIntoViewIfNeeded();
    for (const [suffix, viewport] of [
      ["desktop", { width: 1440, height: 1100 }],
      ["narrow", { width: 390, height: 844 }],
    ]) {
      await this.page.setViewportSize(viewport);
      await target.scrollIntoViewIfNeeded();
      const artifactPath = path.join(artifactRoot, `${name}-${suffix}.png`);
      await target.screenshot({ animations: "disabled", path: artifactPath });
      await copyFile(artifactPath, path.join(curatedRoot, `${name}-${suffix}.png`));
    }
  }
  await this.page.setViewportSize({ width: 1440, height: 1100 });
});
