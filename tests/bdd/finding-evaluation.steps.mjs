import assert from "node:assert/strict";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Then, When } from "@cucumber/cucumber";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const boundedStates = Object.freeze([
  "WITNESSED_CONFLICT",
  "NO_CONFLICT_OBSERVED_IN_NAMED_TESTS",
  "NOT_REOBSERVED_IN_NAMED_TESTS",
  "NOT_TESTED",
  "NOT_VISIBLE",
  "NEEDS_REVIEW",
]);

function shouldCaptureCurated() {
  if (process.env.PACTWIRE_CAPTURE_CURATED_EVIDENCE !== "1") return false;
  const task = process.env.PACTWIRE_EVIDENCE_TASK;
  return !task || task === "DET-03";
}

function findingForState(world, state) {
  const evaluation = world.det03Body?.findings.find(
    ({ finding }) => finding.state === state,
  );
  assert.ok(evaluation, `DET-03 response did not contain ${state}`);
  return evaluation;
}

function cardForState(world, state) {
  return world.page.locator(`[data-finding-state="${state}"]`);
}

When("I open the bounded finding matrix", async function () {
  const panel = this.page.getByTestId("finding-evaluation-panel");
  await panel.waitFor();
  await panel.scrollIntoViewIfNeeded();
  await panel.getByTestId("finding-state-matrix").waitFor();
  const result = await this.page.evaluate(async (requestUrl) => {
    const response = await fetch(requestUrl);
    return { status: response.status, body: await response.json() };
  }, `/api/workspaces/${workspaceId}/findings`);
  assert.equal(result.status, 200);
  assert.equal(result.body.evaluatorVersion, "pactwire-bounded-finding-v1");
  assert.ok(Array.isArray(result.body.findings));
  assert.ok(Array.isArray(result.body.decisionTable));
  this.det03Body = result.body;
});

When("I select the {string} finding", async function (state) {
  assert.ok(boundedStates.includes(state), `Unknown bounded state ${state}`);
  const card = cardForState(this, state);
  await card.click();
  await this.page
    .getByTestId("finding-detail")
    .locator(`code:text-is("${state}")`)
    .waitFor();
  assert.equal(
    await this.page.getByTestId("finding-detail").getAttribute("data-selected-state"),
    state,
  );
});

Then("all six bounded finding states are available", async function () {
  const cards = this.page.locator("[data-finding-state]");
  assert.equal(await cards.count(), 6);
  const visibleStates = await cards.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-finding-state")),
  );
  assert.deepEqual([...visibleStates].sort(), [...boundedStates].sort());
  assert.deepEqual(
    this.det03Body.findings.map(({ finding }) => finding.state).sort(),
    [...boundedStates].sort(),
  );
});

Then("the complete clean finding says {string}", async function (label) {
  const clean = findingForState(
    this,
    "NO_CONFLICT_OBSERVED_IN_NAMED_TESTS",
  );
  assert.equal(clean.display.label, label);
  await cardForState(this, clean.finding.state)
    .getByText(label, { exact: true })
    .waitFor();
});

Then("the clean finding says other behavior was not assessed", async function () {
  const clean = findingForState(
    this,
    "NO_CONFLICT_OBSERVED_IN_NAMED_TESTS",
  );
  assert.match(clean.display.meaning, /Other behavior was not assessed/u);
  await cardForState(this, clean.finding.state)
    .getByText(/Other behavior was not assessed/u)
    .waitFor();
});

Then(
  "model explanation is visibly separated from deterministic evidence",
  async function () {
    await cardForState(this, "WITNESSED_CONFLICT").click();
    const basis = this.page.getByTestId("deterministic-basis");
    const explanation = this.page.getByTestId("model-explanation");
    await basis.getByText("This evidence controls the selected state.").waitFor();
    await explanation
      .getByText("Excluded from the deterministic decision.")
      .waitFor();
    assert.equal(await basis.getByTestId("model-explanation").count(), 0);
    const conflict = findingForState(this, "WITNESSED_CONFLICT");
    assert.equal(conflict.deterministicBasis.modelNarrativeExcluded, true);
    assert.equal(conflict.modelExplanation.excludedFromDecision, true);
  },
);

Then("the selected finding says {string}", async function (label) {
  const detail = this.page.getByTestId("finding-detail");
  await detail.getByRole("heading", { name: label, exact: true }).waitFor();
  const state = await detail.getAttribute("data-selected-state");
  assert.equal(findingForState(this, state).display.label, label);
});

Then(
  "its deterministic basis names the matched observation and prohibited destination version",
  async function () {
    const conflict = findingForState(this, "WITNESSED_CONFLICT");
    assert.ok(conflict.deterministicBasis.matchedObservationIds.length > 0);
    assert.ok(
      conflict.deterministicBasis.prohibitedDestinationVersionIds.length > 0,
    );
    const basis = this.page.getByTestId("deterministic-basis");
    await basis.getByText("Matched observations", { exact: true }).waitFor();
    await basis
      .getByText("Prohibited destination versions", { exact: true })
      .waitFor();
    assert.equal(await basis.getByText("None", { exact: true }).count(), 0);
  },
);

Then("its model explanation is labeled {string}", async function (label) {
  const explanation = this.page.getByTestId("model-explanation");
  await explanation.getByRole("heading", { name: label, exact: true }).waitFor();
  const conflict = findingForState(this, "WITNESSED_CONFLICT");
  assert.equal(conflict.modelExplanation.label, label);
  assert.equal(conflict.modelExplanation.excludedFromDecision, true);
});

Then("the selected finding names its prior finding", async function () {
  const repaired = findingForState(
    this,
    "NOT_REOBSERVED_IN_NAMED_TESTS",
  );
  assert.ok(repaired.finding.priorFindingId);
  const prior = this.page.getByTestId("finding-prior");
  await prior.getByText("Prior finding", { exact: true }).waitFor();
  assert.match(await prior.innerText(), /71717171.*0002/u);
});

Then(
  "no bounded finding label says pass, safe, compliant, or approved",
  function () {
    const findingCopy = this.det03Body.findings
      .flatMap(({ display }) => [display.label, display.meaning])
      .join(" ");
    assert.doesNotMatch(
      findingCopy,
      /\b(pass|safe|compliant|approved)\b/iu,
    );
  },
);

Then(
  "the selected finding names the path without visible evidence",
  async function () {
    const invisible = findingForState(this, "NOT_VISIBLE");
    assert.deepEqual(invisible.scope.notVisiblePaths, [
      "Student sees the fictional submission complete",
    ]);
    await this.page
      .getByTestId("finding-not-visible-paths")
      .getByText("Student sees the fictional submission complete", {
        exact: true,
      })
      .waitFor();
  },
);

Then("the untested state separately says {string}", async function (label) {
  const untested = findingForState(this, "NOT_TESTED");
  assert.equal(untested.display.label, label);
  await cardForState(this, "NOT_TESTED")
    .getByText(label, { exact: true })
    .waitFor();
});

Then(
  "its reason codes include {string} and {string}",
  async function (first, second) {
    const selectedState = await this.page
      .getByTestId("finding-detail")
      .getAttribute("data-selected-state");
    const selected = findingForState(this, selectedState);
    assert.ok(selected.reasonCodes.includes(first));
    assert.ok(selected.reasonCodes.includes(second));
    const reasons = this.page.getByTestId("finding-reason-codes");
    await reasons.getByText(first, { exact: true }).waitFor();
    await reasons.getByText(second, { exact: true }).waitFor();
  },
);

Then("the ambiguous finding is not shown as a recorded conflict", async function () {
  const ambiguity = findingForState(this, "NEEDS_REVIEW");
  assert.notEqual(ambiguity.finding.state, "WITNESSED_CONFLICT");
  assert.equal(ambiguity.deterministicBasis.prohibitedDestinationVersionIds.length, 0);
  const detail = this.page.getByTestId("finding-detail");
  assert.equal(
    await detail.getByText("Recorded conflict in this named test", {
      exact: true,
    }).count(),
    0,
  );
});

Then(/^I capture the DET-03 "([^"]+)" evidence$/, async function (name) {
  const artifactRoot = path.join(
    process.cwd(),
    "artifacts",
    "verification",
    "DET-03",
  );
  const screenshotRoot = path.join(artifactRoot, "screenshots");
  await mkdir(screenshotRoot, { recursive: true });
  const curatedRoot = path.join(process.cwd(), "docs", "evidence", "DET-03");
  if (shouldCaptureCurated()) await mkdir(curatedRoot, { recursive: true });
  const capture = async (suffix) => {
    const artifactPath = path.join(screenshotRoot, `${name}-${suffix}.png`);
    await this.page.getByTestId("finding-evaluation-panel").screenshot({
      animations: "disabled",
      path: artifactPath,
    });
    if (shouldCaptureCurated()) {
      await copyFile(artifactPath, path.join(curatedRoot, `${name}-${suffix}.png`));
    }
  };

  await capture("desktop");
  await this.page.setViewportSize({ width: 390, height: 844 });
  await capture("narrow");
  await this.page.setViewportSize({ width: 1440, height: 1100 });

  const decisionTable = {
    schemaVersion: "1.0.0",
    evaluatorVersion: this.det03Body.evaluatorVersion,
    source: "authenticated DET-03 fixture API",
    decisionTable: this.det03Body.decisionTable,
    findingStates: this.det03Body.findings.map(({ finding, display, reasonCodes }) => ({
      findingId: finding.id,
      state: finding.state,
      label: display.label,
      reasonCodes,
    })),
  };
  const artifactPath = path.join(artifactRoot, "decision-table.json");
  await writeFile(
    artifactPath,
    `${JSON.stringify(decisionTable, null, 2)}\n`,
    "utf8",
  );
  if (shouldCaptureCurated()) {
    await copyFile(artifactPath, path.join(curatedRoot, "decision-table.json"));
  }
});
