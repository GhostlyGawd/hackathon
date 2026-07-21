import assert from "node:assert/strict";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Then, When } from "@cucumber/cucumber";

const workspaceId = "11111111-1111-4111-8111-111111111111";

function shouldCaptureCurated() {
  if (process.env.PACTWIRE_CAPTURE_CURATED_EVIDENCE !== "1") return false;
  const task = process.env.PACTWIRE_EVIDENCE_TASK;
  return !task || task === "RUN-05";
}

function entry(world, kind) {
  const match = world.run05Runs.find(({ run }) => {
    if (kind === "retry") {
      return Boolean(run.retryOfRunId) && run.state === "COMPLETED";
    }
    if (kind === "crashed") return Boolean(run.integrityFailure);
    return !run.retryOfRunId && !run.integrityFailure && run.state === kind;
  });
  assert.ok(match, `RUN-05 history did not contain ${kind}`);
  return match;
}

function canonicalFrozenConfiguration(historyEntry) {
  return {
    snapshot: historyEntry.run.snapshot,
    modelIdentifier: historyEntry.scope.modelIdentifier,
    requiredCheckpointIds: historyEntry.scope.requiredCheckpointIds,
  };
}

async function writeManifestComparison(world) {
  const complete = entry(world, "COMPLETED");
  const partial = entry(world, "PARTIAL");
  const failed = entry(world, "FAILED");
  const crashed = entry(world, "crashed");
  const retry = entry(world, "retry");
  const comparison = {
    schemaVersion: "1.0.0",
    fixture: "controlled-fictional-run-history",
    sourceRunIdsAreFictional: true,
    runs: [complete, partial, failed, crashed, retry].map(
      ({ run, scope, manifest }) => ({
        runId: run.id,
        state: run.state,
        retryOfRunId: run.retryOfRunId ?? null,
        snapshotHash: run.snapshot.snapshotHash,
        executionScopeHash: scope.scopeHash,
        manifestHash: manifest?.manifestHash ?? null,
        observations: manifest?.observationHashes.length ?? 0,
        checkpointCoverage:
          manifest?.checkpointCoverage.map(
            ({ checkpointId, status, reason }) => ({
              checkpointId,
              status,
              ...(reason ? { reason } : {}),
            }),
          ) ?? [],
        integrityFailure: run.integrityFailure ?? null,
      }),
    ),
    retryConfigurationMatchesSource:
      JSON.stringify(canonicalFrozenConfiguration(retry)) ===
      JSON.stringify(canonicalFrozenConfiguration(crashed)),
  };
  const artifactRoot = path.join(
    process.cwd(),
    "artifacts",
    "verification",
    "RUN-05",
  );
  await mkdir(artifactRoot, { recursive: true });
  const artifactPath = path.join(artifactRoot, "manifest-comparison.json");
  await writeFile(artifactPath, `${JSON.stringify(comparison, null, 2)}\n`, "utf8");
  if (shouldCaptureCurated()) {
    const curatedRoot = path.join(process.cwd(), "docs", "evidence", "RUN-05");
    await mkdir(curatedRoot, { recursive: true });
    await copyFile(artifactPath, path.join(curatedRoot, "manifest-comparison.json"));
  }
}

When("I open the immutable run history", async function () {
  const panel = this.page.getByTestId("run-history-panel");
  await panel.waitFor();
  await panel.scrollIntoViewIfNeeded();
  await panel.getByTestId("run-history-card").first().waitFor();
  const { status, body } = await this.page.evaluate(async (requestUrl) => {
    const response = await fetch(requestUrl);
    return { status: response.status, body: await response.json() };
  }, `/api/workspaces/${workspaceId}/runs`);
  assert.equal(status, 200);
  assert.ok(Array.isArray(body.runs));
  assert.ok(
    body.runs.every(
      ({ lease }) =>
        !lease || (!("leaseToken" in lease) && !("tokenHash" in lease)),
    ),
    "Run-history responses must not expose worker lease credentials or hashes",
  );
  this.run05Runs = body.runs;
});

Then(
  "the completed run has a manifest with every required checkpoint",
  async function () {
    const card = this.page.locator('[data-run-kind="completed"]');
    await card.getByText("Completed run", { exact: true }).waitFor();
    await card
      .getByText("2 of 2 required checkpoints recorded", { exact: true })
      .waitFor();
    assert.equal(entry(this, "COMPLETED").manifest.missingCoverage.length, 0);
  },
);

Then(
  "the partial run preserves captured evidence and names missing coverage",
  async function () {
    const card = this.page.locator('[data-run-kind="partial"]');
    await card
      .getByText("1 of 2 required checkpoints recorded", { exact: true })
      .waitFor();
    await card.getByText("NOT VISIBLE", { exact: true }).waitFor();
    const partial = entry(this, "PARTIAL");
    assert.equal(partial.manifest.observationHashes.length, 1);
    assert.equal(partial.manifest.missingCoverage.length, 1);
  },
);

Then(
  "the failed run names every checkpoint it could not complete",
  async function () {
    const card = this.page.locator('[data-run-kind="failed"]');
    await card
      .getByText("0 of 2 required checkpoints recorded", { exact: true })
      .waitFor();
    assert.equal(
      await card.getByText("NOT TESTED", { exact: true }).count(),
      2,
    );
    assert.equal(entry(this, "FAILED").manifest.missingCoverage.length, 2);
  },
);

Then(
  "the crashed run shows an explicit worker lease integrity failure",
  async function () {
    const card = this.page.locator('[data-run-kind="crashed"]');
    await card.getByText("Worker failure", { exact: true }).waitFor();
    await card.getByText("WORKER_LEASE_EXPIRED", { exact: true }).waitFor();
    const crashed = entry(this, "crashed");
    assert.equal(crashed.run.state, "FAILED");
    assert.equal(crashed.manifest, undefined);
    assert.equal(crashed.run.integrityFailure.code, "WORKER_LEASE_EXPIRED");
  },
);

Then(
  "its completed retry links to the source run with the same frozen configuration",
  async function () {
    const card = this.page.locator(
      '[data-run-kind="retry"][data-run-state="COMPLETED"]',
    );
    const lineage = card.getByTestId("retry-lineage");
    await lineage
      .getByText("Exact frozen configuration verified", { exact: true })
      .waitFor();
    assert.equal(await lineage.getAttribute("data-lineage-exact"), "true");
    const retry = entry(this, "retry");
    const crashed = entry(this, "crashed");
    assert.equal(retry.run.state, "COMPLETED");
    assert.equal(retry.run.retryOfRunId, crashed.run.id);
    assert.deepEqual(
      canonicalFrozenConfiguration(retry),
      canonicalFrozenConfiguration(crashed),
    );
  },
);

Then(/^I capture the "([^"]+)" RUN-05 evidence$/, async function (name) {
  const artifactRoot = path.join(
    process.cwd(),
    "artifacts",
    "verification",
    "RUN-05",
    "screenshots",
  );
  await mkdir(artifactRoot, { recursive: true });
  const curatedRoot = path.join(process.cwd(), "docs", "evidence", "RUN-05");
  if (shouldCaptureCurated()) await mkdir(curatedRoot, { recursive: true });
  const capture = async (suffix) => {
    const artifactPath = path.join(artifactRoot, `${name}-${suffix}.png`);
    await this.page.getByTestId("run-history-panel").screenshot({
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
  await writeManifestComparison(this);
});
