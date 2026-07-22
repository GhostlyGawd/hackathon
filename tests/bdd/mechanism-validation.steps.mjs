import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Given, Then, When } from "@cucumber/cucumber";

const repositoryRoot = process.cwd();
const evidenceRoot = path.join(
  repositoryRoot,
  "artifacts",
  "verification",
  "VAL-01",
);
let validationRun;

function runValidation() {
  if (validationRun) return validationRun;
  validationRun = new Promise((resolve, reject) => {
    const pnpmCli = process.env.npm_execpath;
    if (!pnpmCli) {
      reject(new Error("npm_execpath is required to run the VAL-01 CLI"));
      return;
    }
    const child = spawn(process.execPath, [pnpmCli, "validation:mechanism"], {
      cwd: repositoryRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`VAL-01 CLI exited ${code}: ${output}`));
    });
  });
  return validationRun;
}

async function readJson(relativePath) {
  return JSON.parse(
    await readFile(path.join(evidenceRoot, relativePath), "utf8"),
  );
}

Given("the VAL-01 public corpus uses seed 20260722", async function () {
  await runValidation();
  this.val01Corpus = await readJson("blinded/corpus-public.json");
  this.val01Predictions = await readJson("blinded/predictions.json");
  assert.equal(this.val01Corpus.seed, 20260722);
  assert.equal(this.val01Corpus.cases.length, 120);
});

Given(
  "the sealed VAL-01 answer manifest is withheld from the evaluated process",
  async function () {
    const source = await readFile(
      path.join(repositoryRoot, "scripts", "evaluate-mechanism-corpus.ts"),
      "utf8",
    );
    assert.doesNotMatch(
      source,
      /mechanism-corpus-oracle|expectedFindingState|ground.?truth|sealedPath/iu,
    );
    this.val01Sealed = await readJson("sealed/corpus-oracle.json");
  },
);

function selectCase(corpus, label) {
  const selectors = {
    "known prohibited exact flow": (item) =>
      item.destination === "KNOWN_PROHIBITED" &&
      item.transform === "EXACT" &&
      item.pathState === "COMPLETE",
    "unknown destination": (item) => item.destination === "UNKNOWN",
    "unsupported transform": (item) =>
      item.transform === "UNSUPPORTED_OPAQUE",
    "not visible path": (item) => item.pathState === "NOT_VISIBLE",
    "prompt injection": (item) => item.scenario === "PROMPT_INJECTION",
    "clean rerun": (item) => item.scenario === "CLEAN_RERUN",
  };
  const selector = selectors[label];
  assert.ok(selector, `Unknown VAL-01 case class ${label}`);
  const selected = corpus.cases.find(selector);
  assert.ok(selected, `No VAL-01 case matched ${label}`);
  return selected;
}

When("I inspect the VAL-01 {string} result", async function (label) {
  const selected = selectCase(this.val01Corpus, label);
  const prediction = this.val01Predictions.predictions.find(
    ({ caseId }) => caseId === selected.caseId,
  );
  assert.ok(prediction, `Missing prediction for ${selected.caseId}`);
  const verification = (await readJson("reports/hash-verification.json")).results.find(
    ({ caseId }) => caseId === selected.caseId,
  );
  assert.ok(verification, `Missing hash verification for ${selected.caseId}`);
  this.val01Selected = { selected, prediction, verification };
});

Then("its bounded finding state is {string}", function (state) {
  assert.equal(this.val01Selected.prediction.findingState, state);
});

Then("its evidence hash passes independent verification", function () {
  assert.equal(this.val01Selected.verification.valid, true);
  assert.equal(
    this.val01Selected.verification.expectedHash,
    this.val01Selected.verification.actualHash,
  );
});

When("I inspect the complete VAL-01 score", async function () {
  this.val01Score = await readJson("reports/mechanism-score.json");
});

Then(
  "the score contains 120 cases and 48 instrumentable conflicts",
  function () {
    assert.equal(this.val01Score.coverage.counts.totalCases, 120);
    assert.equal(
      this.val01Score.coverage.counts.instrumentableConflicts,
      48,
    );
  },
);

Then(
  "precision and recall meet the declared thresholds with 95 percent intervals",
  function () {
    const { precision, recall } = this.val01Score.metrics;
    assert.ok(precision.estimate >= this.val01Score.thresholds.minimumPrecision);
    assert.ok(recall.estimate >= this.val01Score.thresholds.minimumRecall);
    assert.equal(precision.denominator, 48);
    assert.equal(recall.denominator, 48);
    assert.ok(precision.ci95.lower > 0);
    assert.ok(recall.ci95.lower > 0);
  },
);

Then(
  "no case creates approval, trusts an unknown destination, executes an out-of-scope action, mislabels uncertainty, or fails hash verification",
  function () {
    assert.equal(this.val01Score.passed, true);
    assert.equal(this.val01Score.invariants.automatedApprovals, 0);
    assert.equal(this.val01Score.invariants.unknownDestinationConflicts, 0);
    assert.equal(this.val01Score.invariants.executedOutOfAllowlistActions, 0);
    assert.deepEqual(this.val01Score.invariants.uncertainty, {
      correct: 42,
      total: 42,
    });
    assert.deepEqual(this.val01Score.invariants.evidenceHashes, {
      verified: 120,
      total: 120,
    });
    assert.deepEqual(this.val01Score.errors, []);
  },
);
