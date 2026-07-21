import assert from "node:assert/strict";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Then, When } from "@cucumber/cucumber";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const softwareId = "56565656-5656-4565-8565-565656565656";
const approvalEndpoint =
  `/api/workspaces/${workspaceId}/software/${softwareId}/approval`;

function shouldCaptureCurated() {
  if (process.env.PACTWIRE_CAPTURE_CURATED_EVIDENCE !== "1") return false;
  const task = process.env.PACTWIRE_EVIDENCE_TASK;
  return !task || task === "DET-05";
}

async function approvalPanel(world) {
  const panel = world.page.getByTestId("approval-authority-panel");
  await panel.waitFor();
  await panel.scrollIntoViewIfNeeded();
  await panel.getByTestId("approval-current-state").waitFor();
  return panel;
}

async function writeSnapshot(world, name) {
  const snapshot = await world.page.evaluate(async (endpoint) => {
    const response = await fetch(endpoint);
    return {
      status: response.status,
      cacheControl: response.headers.get("cache-control"),
      body: await response.json(),
    };
  }, approvalEndpoint);
  assert.equal(snapshot.status, 200);
  const artifactRoot = path.join(
    process.cwd(),
    "artifacts",
    "verification",
    "DET-05",
  );
  await mkdir(artifactRoot, { recursive: true });
  const artifactPath = path.join(artifactRoot, `${name}-snapshot.json`);
  await writeFile(artifactPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  if (shouldCaptureCurated()) {
    const curatedRoot = path.join(process.cwd(), "docs", "evidence", "DET-05");
    await mkdir(curatedRoot, { recursive: true });
    await copyFile(artifactPath, path.join(curatedRoot, `${name}-snapshot.json`));
  }
}

async function capturePanel(world, name) {
  const panel = await approvalPanel(world);
  const artifactRoot = path.join(
    process.cwd(),
    "artifacts",
    "verification",
    "DET-05",
    "screenshots",
  );
  const curatedRoot = path.join(process.cwd(), "docs", "evidence", "DET-05");
  await mkdir(artifactRoot, { recursive: true });
  if (shouldCaptureCurated()) await mkdir(curatedRoot, { recursive: true });
  const capture = async (suffix) => {
    const artifactPath = path.join(artifactRoot, `${name}-${suffix}.png`);
    await panel.screenshot({ animations: "disabled", path: artifactPath });
    if (shouldCaptureCurated()) {
      await copyFile(artifactPath, path.join(curatedRoot, `${name}-${suffix}.png`));
    }
  };
  await capture("desktop");
  await world.page.setViewportSize({ width: 390, height: 844 });
  await capture("narrow");
  await world.page.setViewportSize({ width: 1440, height: 1100 });
  await writeSnapshot(world, name);
}

Then("the approval authority shows {string}", async function (state) {
  const panel = await approvalPanel(this);
  await panel
    .getByTestId("approval-current-state")
    .getByText(state, { exact: true })
    .waitFor();
  assert.equal(await panel.getAttribute("data-approval-state"), state);
  if (
    state === "APPROVED" &&
    (await panel.getByTestId("approval-signed-decision").count()) === 0
  ) {
    await capturePanel(this, "approved-before");
  }
});

Then("the approval authority still shows {string}", async function (state) {
  const panel = await approvalPanel(this);
  await panel
    .getByTestId("approval-current-state")
    .getByText(state, { exact: true })
    .waitFor();
  assert.equal(await panel.getAttribute("data-approval-state"), state);
});

When("I apply the stored witnessed conflict to approval", async function () {
  const panel = await approvalPanel(this);
  await panel.getByTestId("apply-approval-conflict").click();
  await panel.getByTestId("approval-feedback").waitFor();
});

When("I apply the stored repaired rerun to approval", async function () {
  const panel = await approvalPanel(this);
  await panel.getByTestId("apply-approval-repair").click();
  await panel
    .getByTestId("approval-feedback")
    .getByText(/remains on hold/iu)
    .waitFor();
});

When("I apply the stored frozen visibility retry to approval", async function () {
  const panel = await approvalPanel(this);
  await panel.getByTestId("apply-approval-visibility").click();
  await panel.getByTestId("approval-feedback").waitFor();
});

Then(
  "one witnessed-conflict receipt contributes to the hold",
  async function () {
    const contributions = (await approvalPanel(this))
      .getByTestId("approval-hold-contributions")
      .locator('[data-hold-reason="WITNESSED_CONFLICT"]');
    assert.equal(await contributions.count(), 1);
    await contributions.getByText("Witnessed conflict", { exact: true }).waitFor();
  },
);

Then(
  "one required-visibility-loss receipt contributes to the hold",
  async function () {
    const contributions = (await approvalPanel(this))
      .getByTestId("approval-hold-contributions")
      .locator('[data-hold-reason="REQUIRED_VISIBILITY_LOSS"]');
    assert.equal(await contributions.count(), 1);
    await contributions
      .getByText("Required checkpoint: completion-visible", { exact: true })
      .waitFor();
  },
);

Then("the panel says automation cannot restore approval", async function () {
  await (await approvalPanel(this))
    .getByText("Automation cannot restore approval.", { exact: true })
    .waitFor();
});

Then("approval restoration is read-only", async function () {
  await (await approvalPanel(this))
    .getByTestId("approval-restoration-readonly")
    .waitFor();
});

When("I restore approval with a signed named-scope reason", async function () {
  const panel = await approvalPanel(this);
  await panel
    .getByTestId("approval-rationale")
    .fill(
      "I reviewed the named fictional rerun and accept only its recorded scope.",
    );
  await panel.getByTestId("approval-named-scope").check();
  await panel.getByTestId("restore-approval").click();
  await panel
    .getByTestId("approval-feedback")
    .getByText(/signed human decision restored/iu)
    .waitFor();
});

Then("the append-only history names the human restoration", async function () {
  const panel = await approvalPanel(this);
  const history = panel.getByTestId("approval-history");
  await history.getByText("HOLD → APPROVED", { exact: true }).waitFor();
  await history.getByText(/human fictional-officer-a/iu).waitFor();
  const decision = panel.getByTestId("approval-signed-decision");
  await decision.getByText(/signed by fictional-officer-a/iu).waitFor();
});

Then(/^I capture the "([^"]+)" DET-05 evidence$/, async function (name) {
  await capturePanel(this, name);
});
