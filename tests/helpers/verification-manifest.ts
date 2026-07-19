export function makeValidManifest(
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    schemaVersion: "1.0.0",
    taskId: "FND-02",
    title: "Build the verification and evidence harness",
    status: "COMPLETE",
    prdSections: [19, 21, 22, 26],
    functionalRequirements: [],
    sourceCommitSha: "a".repeat(40),
    startedAt: "2026-07-19T17:45:00.000Z",
    completedAt: "2026-07-19T18:00:00.000Z",
    artifactRoot: "artifacts/verification/FND-02/",
    curatedEvidenceRoot: "docs/evidence/FND-02/",
    environment: {
      os: "test",
      node: "24.14.1",
      pnpm: "11.6.0",
      ci: {
        provider: "github-actions",
        runUrl: "https://github.com/example/repository/actions/runs/1",
        jobs: [
          {
            name: "Verify on test",
            url: "https://github.com/example/repository/actions/runs/1/job/1",
            status: "SUCCESS",
          },
        ],
      },
    },
    commands: [
      {
        phase: "RED",
        name: "Focused red",
        command: "pnpm test:red",
        exitCode: 1,
        durationMs: 100,
        expectedFailure: "validator did not exist",
      },
      {
        phase: "REGRESSION",
        name: "Full verification",
        command: "pnpm verify",
        exitCode: 0,
        durationMs: 1_000,
      },
    ],
    testSummary: {
      files: 2,
      passed: 4,
      failed: 0,
      skipped: 0,
      retries: 0,
    },
    propertyTests: {
      applicable: true,
      results: [
        {
          id: "manifest-validity",
          seed: 20_260_719,
          numRuns: 100,
          passed: true,
        },
      ],
    },
    bdd: {
      applicable: false,
      rationale: "FND-02 has no user-facing workflow.",
      scenarios: [],
    },
    visualEvidence: {
      applicable: false,
      rationale: "FND-02 has no user-facing interface.",
      assets: [],
    },
    proofs: [
      {
        kind: "test",
        path: "tests/unit/verification-manifest.test.ts",
        description: "Manifest validation tests",
      },
    ],
    sanitization: {
      reviewed: true,
      reviewedAt: "2026-07-19T18:00:00.000Z",
      findings: [],
    },
    knownLimitations: ["Fixture manifest; no product behavior is claimed."],
    reviewer: "test-reviewer",
    ...overrides,
  };
}
