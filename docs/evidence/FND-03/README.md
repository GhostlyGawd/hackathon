# FND-03 verification evidence

| Field | Value |
| --- | --- |
| Task | FND-03 — Implement core domain schemas, state machines, and data boundaries |
| PRD sections | 6, 10, 14, 15, and 23 |
| Status | COMPLETE |
| Verified source commit | `e29509f8b451e6751745c584fcb13082f6efd73d` |
| Local verification date | 2026-07-19 |
| Visual evidence | [Generated state-transition tables and diagrams](state-transitions.md) |
| Migration evidence | [Generated migration report](migration-report.json) |

## Red-first record

The initial focused contract failed before executing a test because the domain and migration modules did not exist:

~~~text
pnpm exec vitest run --project unit tests/unit/domain-state.test.ts --project integration tests/integration/domain-migrations.test.ts
Exit code: 1
Reason: packages/core/src/domain.ts and packages/core/src/migrations.ts were missing
~~~

Permanent regression examples were also added for counterexamples found during the green phase:

- standalone and persisted run-event types could contradict their state path;
- a human approval reason could contradict its target state, and a non-restoration decision could support APPROVED;
- workspace-scoped in-memory storage rejected safe duplicate IDs across tenants and thereby exposed global identity coupling;
- retry history could be appended to its terminal source instead of creating a distinct run;
- PostgreSQL permitted frozen run configuration changes and cross-wired same-workspace software/run references;
- journey versions and run canaries were mutable; and
- committed migration evidence could drift from the migration source.

Each counterexample failed before its implementation change and now remains in the focused suite.

## Focused green checks

~~~text
Test files: 6 passed
Tests: 32 passed
Failures: 0
Retries: 0
Skipped tests: 0
Duration: 11.10 seconds
~~~

The focused suite contains 18 schema/reducer/evidence unit examples, eight seeded properties, and six PostgreSQL migration/integrity tests.

Property tests use seed `20260719` and 250 runs per property (2,000 generated cases total):

- PROP-01: automated event sequences cannot enter or restore APPROVED;
- PROP-02: APPROVED → HOLD is the only accepted automated approval transition;
- PROP-05: clean and not-reobserved findings require every required checkpoint to be exercised and visible;
- PROP-11: audit and approval histories append without mutation and preserve actor provenance;
- PROP-12: tenant reads, mutations, references, and exports remain isolated, including equal record IDs across workspaces;
- PROP-18: retries preserve the exact agreement, journey, authorization, runner version, and snapshot hash;
- PROP-19: every terminal run has a manifest or an explicit integrity failure; and
- serialized domain events round-trip without semantic loss.

## Migration and state evidence

The initial migration creates 19 domain tables plus the migration metadata table. It uses composite foreign keys for workspace boundaries and same-software/same-run relationships. Twelve evidence or version tables are append-only. Separate database guards enforce signed human restoration, run-state movement, frozen run configuration, terminal immutability, and exact retry snapshots.

The [state-transition evidence](state-transitions.md) is generated from the same transition definitions used by the reducers. The checked Mermaid diagrams make the central authority relationship visible: deterministic automation can only move APPROVED to HOLD for a witnessed conflict or required visibility loss; it cannot grant or restore approval.

`pnpm domain:evidence:check` and `tests/unit/domain-evidence.test.ts` fail if either committed evidence asset differs from the implementation.

The full deterministic repository gate also passed:

~~~text
pnpm verify
Exit code: 0
Duration: 78.4 seconds

Workspace contract: 6 packages and 14 canonical scripts
Evidence traceability: 43 requirements, 26 PRD sections, 35 tasks, 3 manifests, 26 proof files
Typecheck: root test/script graph and all 6 packages passed
Production build: all 6 packages passed
Tests: 12 files, 57 tests passed
Failures: 0
Retries: 0
Skipped tests: 0
Production dependency audit: 0 advisories
~~~

## Clean-checkout CI and raw artifacts

Pull request [#9](https://github.com/GhostlyGawd/hackathon/pull/9) installed from the frozen lockfile and passed the complete `pnpm verify` gate on both required operating systems:

- [Verify on ubuntu-latest](https://github.com/GhostlyGawd/hackathon/actions/runs/29700576530/job/88228839287) — passed in 1m23s; [verification artifact](https://github.com/GhostlyGawd/hackathon/actions/runs/29700576530/artifacts/8446328899) uploaded.
- [Verify on windows-latest](https://github.com/GhostlyGawd/hackathon/actions/runs/29700576530/job/88228839281) — passed in 2m54s; [verification artifact](https://github.com/GhostlyGawd/hackathon/actions/runs/29700576530/artifacts/8446342002) uploaded.

Both jobs verified source commit `e29509f8b451e6751745c584fcb13082f6efd73d`. Neither reported a failure, retry, or skipped test. Raw artifacts expire after the configured 14-day retention period; this sanitized record and the machine-readable manifest remain durable.

## BDD and visual applicability

BDD is not applicable to this foundation task because it introduces no user-facing workflow. The state vocabulary is exercised through real browser BDD scenarios in the later authorization, run, finding, and restoration tasks.

Screen captures are not applicable yet. A generated diagram is applicable and attached because the approval and run state relationships are central to this task.

## Sanitization and limitations

All examples use reserved `.invalid` domains, fictional names, synthetic hashes, and non-person identifiers. No credential, student identifier, or live customer data is present.

- This task establishes domain and persistence invariants; it does not implement server routes, a browser runner, or a product screen.
- The generated state diagram proves the implemented transition contract, not Pactwire's real-world effectiveness.
- Raw CI artifacts are retained for 14 days; the sanitized manifest and evidence record remain committed.
