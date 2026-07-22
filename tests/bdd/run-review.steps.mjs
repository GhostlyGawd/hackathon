import assert from "node:assert/strict";
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Then, When } from "@cucumber/cucumber";

const workspaceId = "11111111-1111-4111-8111-111111111111";

function shouldCaptureCurated() {
  if (process.env.PACTWIRE_CAPTURE_CURATED_EVIDENCE !== "1") return false;
  const task = process.env.PACTWIRE_EVIDENCE_TASK;
  return !task || task === "UX-03";
}

function artifactRoot(...parts) {
  return path.join(
    process.cwd(),
    "artifacts",
    "verification",
    "UX-03",
    ...parts,
  );
}

function curatedRoot(...parts) {
  return path.join(process.cwd(), "docs", "evidence", "UX-03", ...parts);
}

async function captureTarget(world, target, name) {
  const screenshotRoot = artifactRoot("screenshots");
  await mkdir(screenshotRoot, { recursive: true });
  if (shouldCaptureCurated()) await mkdir(curatedRoot(), { recursive: true });
  const capture = async (suffix) => {
    const output = path.join(screenshotRoot, `${name}-${suffix}.png`);
    await target.screenshot({ animations: "disabled", path: output });
    if (shouldCaptureCurated()) {
      await copyFile(output, curatedRoot(`${name}-${suffix}.png`));
    }
  };
  await capture("desktop");
  await world.page.setViewportSize({ width: 390, height: 844 });
  await target.scrollIntoViewIfNeeded();
  await capture("narrow");
  await world.page.setViewportSize({ width: 1440, height: 1100 });
}

async function runPanel(world) {
  const panel = world.page.getByTestId("run-history-panel");
  await panel.waitFor();
  await panel.scrollIntoViewIfNeeded();
  return panel;
}

When("I open the live run review", async function () {
  const panel = await runPanel(this);
  await panel.getByTestId("live-run-review").waitFor();
});

Then(
  "the named journey, fictional role, allowed scope, and latest isolated frame are visible",
  async function () {
    const live = (await runPanel(this)).getByTestId("live-run-review");
    await live
      .getByText("Student submits fictional assignment", { exact: true })
      .waitFor();
    await live.getByText(/fictional student · isolated controlled browser/iu).waitFor();
    const scope = live.getByTestId("live-run-scope");
    await scope
      .getByText("https://classroom.pactwire.test", { exact: true })
      .waitFor();
    await scope.getByText("NAVIGATE · CLICK · TYPE", { exact: true }).waitFor();
    const preview = live.getByTestId("isolated-browser-preview");
    await preview.getByText("Latest isolated frame", { exact: true }).waitFor();
    const image = preview.locator("img");
    await image.waitFor();
    assert.equal(
      await image.evaluate(async (candidate) => {
        if (!(candidate instanceof HTMLImageElement)) return false;
        try {
          await candidate.decode();
        } catch {
          return false;
        }
        return candidate.complete && candidate.naturalWidth > 0;
      }),
      true,
      "The latest controlled-fixture frame must load as a real image",
    );
  },
);

Then(
  "the model action summary is separate from the deterministic recorder event",
  async function () {
    const live = (await runPanel(this)).getByTestId("live-run-review");
    const model = live.getByTestId("model-action-summary");
    const recorder = live.getByTestId("recorder-event");
    assert.equal(await model.getAttribute("data-testid"), "model-action-summary");
    assert.equal(await recorder.getAttribute("data-testid"), "recorder-event");
    await model
      .getByText("Submit the fictional student's saved response.", { exact: true })
      .waitFor();
    await model.getByText(/No chain-of-thought is shown/iu).waitFor();
    await recorder
      .getByText(
        "Observed POST /api/submissions to classroom.pactwire.test.",
        { exact: true },
      )
      .waitFor();
    assert.doesNotMatch(await model.innerText(), /Observed POST/iu);
    assert.doesNotMatch(await recorder.innerText(), /hidden reasoning/iu);
  },
);

Then(
  "completed and pending checkpoints and the canary match are visible",
  async function () {
    const live = (await runPanel(this)).getByTestId("live-run-review");
    const checkpoints = live.getByTestId("live-checkpoints");
    assert.equal(
      await checkpoints.locator('[data-checkpoint-status="VERIFIED"]').count(),
      1,
    );
    assert.equal(
      await checkpoints.locator('[data-checkpoint-status="PENDING"]').count(),
      1,
    );
    const canary = live.getByTestId("live-canary-match");
    await canary
      .getByText("email · classroom.pactwire.test", { exact: true })
      .waitFor();
    await canary.getByText(/Exact generated value is redacted/iu).waitFor();
  },
);

Then("the stop control is prominent and keyboard reachable", async function () {
  const button = (await runPanel(this)).getByTestId("stop-active-run");
  await button.scrollIntoViewIfNeeded();
  await button.focus();
  await this.page.keyboard.press("Shift+Tab");
  await this.page.keyboard.press("Tab");
  assert.equal(
    await button.evaluate((node) => node === node.ownerDocument.activeElement),
    true,
  );
  await button.getByText("Stop run and finalize evidence", { exact: true }).waitFor();
});

When("I stop the active controlled run", async function () {
  const panel = await runPanel(this);
  const live = panel.getByTestId("live-run-review");
  await captureTarget(this, live, "live-run-before-stop");
  await panel.getByTestId("stop-active-run").click();
  await panel.getByTestId("run-stop-feedback").waitFor();
  await panel.locator('[data-run-state="CANCELED"]').waitFor();
});

Then("the run becomes {string} with a terminal manifest", async function (state) {
  const panel = await runPanel(this);
  const card = panel.locator(`[data-run-state="${state}"]`);
  await card.waitFor();
  await card.getByTestId("manifest-summary").waitFor();
  const result = await this.page.evaluate(async (activeWorkspaceId) => {
    const response = await fetch(`/api/workspaces/${activeWorkspaceId}/runs`);
    const body = await response.json();
    return body.runs.find((entry) => entry.run.state === "CANCELED");
  }, workspaceId);
  assert.equal(result.run.state, state);
  assert.equal(result.manifest.terminalStatus, state);
});

Then(
  "the manifest preserves the observed checkpoint and marks the unfinished checkpoint {string}",
  async function (missingStatus) {
    const card = (await runPanel(this)).locator('[data-run-state="CANCELED"]');
    await card.getByText("submission-request", { exact: true }).waitFor();
    await card.getByText("VERIFIED", { exact: true }).waitFor();
    await card.getByText("completion-visible", { exact: true }).waitFor();
    await card.getByText(missingStatus, { exact: true }).waitFor();
    await card
      .getByText(/authorized operator stopped the run before this checkpoint/iu)
      .waitFor();
  },
);

Then(
  "the receipt answers the eight review questions in order",
  async function () {
    const receipt = this.page.getByTestId("evidence-receipt-detail");
    await receipt.waitFor();
    const titles = await receipt.locator(".receipt-step h4").allTextContents();
    assert.deepEqual(titles, [
      "What Pactwire recorded",
      "Fictional data field",
      "Recorded action",
      "Where it was sent or collected",
      "Confirmed agreement rule",
      "What was and was not tested",
      "Effect on approval status",
      "What a person decides next",
    ]);
  },
);

Then(
  "its tested scope, valid evidence, and next human action make the review ready",
  async function () {
    const gate = this.page.getByTestId("receipt-review-gate");
    await gate.waitFor();
    assert.equal(await gate.getAttribute("data-review-ready"), "true");
    assert.equal(await gate.getAttribute("data-review-action"), "READ_ONLY_REVIEW");
    await gate.getByText("Evidence ready for bounded review", { exact: true }).waitFor();
    await gate.getByText(/Next: A human reviewer must review/iu).waitFor();
    await this.page
      .getByTestId("receipt-verification")
      .getByText("VALID", { exact: true })
      .waitFor();
  },
);

Then(
  "the reviewer can inspect and export evidence but cannot change approval",
  async function () {
    await this.page.getByTestId("download-receipt").waitFor();
    await this.page.getByTestId("stop-run-readonly").waitFor();
    const approval = this.page.getByTestId("approval-authority-panel");
    await approval.waitFor();
    assert.equal(await approval.getByTestId("approval-hold-decision-form").count(), 0);
    assert.equal(await approval.getByTestId("approval-restoration-form").count(), 0);
  },
);

When("I record a signed decision to keep the hold", async function () {
  const panel = this.page.getByTestId("approval-authority-panel");
  await panel.getByTestId("approval-hold-decision-form").waitFor();
  await panel
    .getByTestId("approval-hold-reason")
    .fill(
      "Keep the hold while the fictional vendor reviews the exact receipt and named test scope.",
    );
  await panel.getByTestId("approval-hold-scope").check();
  await panel.getByTestId("record-hold-decision").click();
  await panel
    .getByTestId("approval-feedback")
    .getByText(/kept the software on hold/iu)
    .waitFor();
});

Then(
  "the append-only history preserves the signed keep-hold reason",
  async function () {
    const decision = this.page
      .getByTestId("approval-authority-panel")
      .getByTestId("approval-signed-decision");
    await decision.getByText("KEEP HOLD", { exact: true }).waitFor();
    await decision
      .getByText(
        "Keep the hold while the fictional vendor reviews the exact receipt and named test scope.",
        { exact: true },
      )
      .waitFor();
    await decision.getByText(/Signed by fictional-officer-a/iu).waitFor();
  },
);

Then(/^I capture the UX-03 "([^"]+)" transition evidence$/, async function (name) {
  await captureTarget(this, await runPanel(this), name);
});

Then(/^I capture the UX-03 "([^"]+)" evidence$/, async function (name) {
  const targets = {
    "finding-state-matrix": this.page.getByTestId("finding-evaluation-panel"),
    "decision-ready-conflict": this.page.getByTestId("evidence-receipt-detail"),
    "approval-before-hold": this.page.getByTestId("approval-authority-panel"),
    "approval-after-hold": this.page.getByTestId("approval-authority-panel"),
    "signed-keep-hold": this.page.getByTestId("approval-authority-panel"),
    "recovery-state-matrix": await runPanel(this),
  };
  const target = targets[name];
  assert.ok(target, `No UX-03 capture target exists for ${name}`);
  await target.scrollIntoViewIfNeeded();
  await captureTarget(this, target, name);
});
