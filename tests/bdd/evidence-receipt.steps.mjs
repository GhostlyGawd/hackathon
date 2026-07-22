import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { Then, When } from "@cucumber/cucumber";

const execute = promisify(execFile);
const workspaceId = "11111111-1111-4111-8111-111111111111";

function artifactRoot() {
  return path.join(process.cwd(), "artifacts", "verification", "DET-04");
}

function shouldCaptureCurated() {
  if (process.env.PACTWIRE_CAPTURE_CURATED_EVIDENCE !== "1") return false;
  const task = process.env.PACTWIRE_EVIDENCE_TASK;
  return !task || task === "DET-04";
}

async function fetchConflictReceipt(world) {
  const result = await world.page.evaluate(async (activeWorkspaceId) => {
    const findingsResponse = await fetch(
      `/api/workspaces/${activeWorkspaceId}/findings`,
    );
    const findings = await findingsResponse.json();
    const conflict = findings.findings.find(
      (entry) => entry.finding.state === "WITNESSED_CONFLICT",
    );
    if (!conflict) return { status: 404, body: "" };
    const receiptsResponse = await fetch(
      `/api/workspaces/${activeWorkspaceId}/receipts?findingId=${conflict.finding.id}`,
    );
    const receipts = await receiptsResponse.json();
    const receipt = receipts.receipts.at(-1);
    if (!receipt) return { status: 404, body: "" };
    const exportResponse = await fetch(
      `/api/workspaces/${activeWorkspaceId}/receipts/${receipt.receipt.id}/export`,
    );
    return {
      status: exportResponse.status,
      body: await exportResponse.text(),
      receiptId: receipt.receipt.id,
    };
  }, workspaceId);
  assert.equal(result.status, 200);
  assert.ok(result.body.length > 0);
  world.det04ReceiptId = result.receiptId;
  world.det04OriginalBundle = result.body;
  return result.body;
}

async function runVerifier(serialized, fileStem) {
  const root = artifactRoot();
  const bundleRoot = path.join(root, "bundles");
  const reportRoot = path.join(root, "reports");
  await mkdir(bundleRoot, { recursive: true });
  await mkdir(reportRoot, { recursive: true });
  const bundlePath = path.join(bundleRoot, `${fileStem}.json`);
  const reportPath = path.join(reportRoot, `${fileStem}-verifier.json`);
  await writeFile(bundlePath, serialized, "utf8");
  let exitCode = 0;
  let stdout;
  try {
    const result = await execute(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/verify-evidence-receipt.ts",
        bundlePath,
        "--output",
        reportPath,
      ],
      { cwd: process.cwd() },
    );
    stdout = result.stdout;
  } catch (error) {
    exitCode = typeof error.code === "number" ? error.code : 1;
    stdout = error.stdout ?? "";
  }
  const report = JSON.parse(stdout);
  return { exitCode, report, bundlePath, reportPath };
}

Then(
  "the receipt directly names what was recorded, the fictional field, action, and destination",
  async function () {
    const receipt = this.page.getByTestId("evidence-receipt-detail");
    await receipt.waitFor();
    await receipt.getByText("What Pactwire recorded", { exact: true }).waitFor();
    await receipt.getByText("Fictional data field", { exact: true }).waitFor();
    await receipt.getByText("Recorded action", { exact: true }).waitFor();
    await receipt
      .getByText("Where it was sent or collected", { exact: true })
      .waitFor();
    const text = await receipt.innerText();
    assert.match(text, /email/u);
    assert.match(text, /send/u);
    assert.match(text, /Fixture Analytics \(Fictional\)/u);
    assert.match(text, /fixture-analytics\.pactwire\.test/u);
  },
);

Then(
  "the receipt names the human-confirmed agreement rule and exact named test limits",
  async function () {
    const receipt = this.page.getByTestId("evidence-receipt-detail");
    await receipt.getByText("Confirmed agreement rule", { exact: true }).waitFor();
    await receipt
      .getByText("What was and was not tested", { exact: true })
      .waitFor();
    const text = await receipt.innerText();
    assert.match(text, /Student email must not be sent/u);
    assert.match(text, /Confirmed by fictional-officer-a/u);
    assert.match(text, /Student submits fictional assignment/u);
    assert.match(text, /student · 2 visible · 0 not tested · 0 not visible/u);
  },
);

Then(
  "the receipt says no approval state was changed and names the next human decision",
  async function () {
    const receipt = this.page.getByTestId("evidence-receipt-detail");
    const story = receipt.getByTestId("receipt-story");
    await receipt
      .getByText("No approval state was changed by this receipt.", { exact: true })
      .waitFor();
    await story
      .getByText(/A human reviewer must review the recorded conflict/u)
      .waitFor();
    await story
      .getByText("A model cannot approve, restore, or make this decision.", {
        exact: true,
      })
      .waitFor();
  },
);

When("I download and independently verify the receipt bundle", async function () {
  const serialized = await fetchConflictReceipt(this);
  this.det04ValidVerification = await runVerifier(
    serialized,
    "witnessed-conflict-receipt",
  );
});

Then("every included receipt artifact and hash verifies", async function () {
  const result = this.det04ValidVerification;
  assert.equal(result.exitCode, 0);
  assert.equal(result.report.status, "VALID");
  assert.equal(result.report.issues.length, 0);
  const bundle = JSON.parse(this.det04OriginalBundle);
  assert.equal(result.report.verifiedArtifactCount, bundle.artifacts.length);
  assert.equal(result.report.verifiedHashCount, bundle.artifacts.length + 2);
  const badge = this.page.getByTestId("receipt-verification");
  await badge.getByText("VALID", { exact: true }).waitFor();
});

Then(/^I capture the DET-04 "([^"]+)" evidence$/, async function (name) {
  const screenshotRoot = path.join(artifactRoot(), "screenshots");
  await mkdir(screenshotRoot, { recursive: true });
  const curatedRoot = path.join(process.cwd(), "docs", "evidence", "DET-04");
  if (shouldCaptureCurated()) await mkdir(curatedRoot, { recursive: true });
  const receipt = this.page.getByTestId("evidence-receipt-detail");
  await receipt.scrollIntoViewIfNeeded();
  const capture = async (suffix) => {
    const screenshotPath = path.join(screenshotRoot, `${name}-${suffix}.png`);
    await receipt.screenshot({ animations: "disabled", path: screenshotPath });
    if (shouldCaptureCurated()) {
      await copyFile(
        screenshotPath,
        path.join(curatedRoot, `${name}-${suffix}.png`),
      );
    }
  };
  await capture("desktop");
  await this.page.setViewportSize({ width: 390, height: 844 });
  await capture("narrow");
  await this.page.setViewportSize({ width: 1440, height: 1100 });
});

When("I export the witnessed-conflict evidence receipt", async function () {
  const serialized = await fetchConflictReceipt(this);
  this.det04ValidVerification = await runVerifier(
    serialized,
    "stored-original-receipt",
  );
});

When("I change one byte in an exported receipt artifact", async function () {
  const bundle = JSON.parse(this.det04OriginalBundle);
  const artifact = bundle.artifacts[0];
  assert.ok(artifact);
  const bytes = Buffer.from(artifact.contentBase64, "base64");
  bytes[0] = (bytes[0] ?? 0) ^ 1;
  artifact.contentBase64 = bytes.toString("base64");
  this.det04CorruptVerification = await runVerifier(
    `${JSON.stringify(bundle)}\n`,
    "corrupted-artifact-receipt",
  );
});

Then("independent receipt verification reports {string}", function (status) {
  assert.equal(this.det04CorruptVerification.report.status, status);
  assert.equal(this.det04CorruptVerification.exitCode, 2);
});

Then("the verifier names {string}", function (code) {
  assert.ok(
    this.det04CorruptVerification.report.issues.some(
      (issue) => issue.code === code,
    ),
  );
});

Then("the original stored receipt still verifies as {string}", async function (status) {
  const fresh = await fetchConflictReceipt(this);
  assert.equal(fresh, this.det04OriginalBundle);
  const result = await runVerifier(fresh, "stored-original-after-corruption");
  assert.equal(result.report.status, status);
  assert.equal(result.exitCode, 0);
});

Then("I record the DET-04 valid and corrupted verifier reports", async function () {
  assert.equal(this.det04ValidVerification.report.status, "VALID");
  assert.equal(this.det04CorruptVerification.report.status, "INVALID");
  const requestedTask = process.env.PACTWIRE_EVIDENCE_TASK;
  const captureDet04 = shouldCaptureCurated();
  const captureSec01 =
    process.env.PACTWIRE_CAPTURE_CURATED_EVIDENCE === "1" &&
    requestedTask === "SEC-01";
  if (!captureDet04 && !captureSec01) return;
  const curatedRoot = path.join(
    process.cwd(),
    "docs",
    "evidence",
    captureSec01 ? "SEC-01" : "DET-04",
  );
  await mkdir(curatedRoot, { recursive: true });
  const prefix = captureSec01 ? "tamper-" : "";
  await Promise.all([
    copyFile(
      this.det04ValidVerification.bundlePath,
      path.join(curatedRoot, `${prefix}sanitized-receipt-bundle.json`),
    ),
    copyFile(
      this.det04ValidVerification.reportPath,
      path.join(curatedRoot, `${prefix}verifier-valid.json`),
    ),
    copyFile(
      this.det04CorruptVerification.reportPath,
      path.join(curatedRoot, `${prefix}verifier-corrupted.json`),
    ),
  ]);
});
