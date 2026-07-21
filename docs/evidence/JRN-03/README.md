# JRN-03 verification evidence

JRN-03 is in progress. It adds the human-authored deterministic replay arm: a saved, immutable plan bound to one agreement version, named journey version, authorization, runner configuration, exact action scope, fictional-field bindings, and every required checkpoint. Runtime canary values are injected only while an operation executes and are represented by hashes in the replay outcome.

The implementation evidence is bound to source commit `0eca6378612af76d838f4146353a1e771cbec827`.

## Red-first record

The manifest records focused failures before the replay schema, repositories, executor, real Playwright adapter, PostgreSQL guard, and BDD steps existed. Regression reds also exposed stale workspace-package resolution, a JSON operator-precedence bug in the database action-complement guard, and an author-identity mismatch that allowed the payload to claim automation while its indexed column claimed a human.

## Current green proof

- `pnpm verify` passes in optimized-production mode: 58 unit/property/integration files, 235 checks, 37 BDD scenarios with 424 steps, and two browser end-to-end checks.
- Nine focused domain/execution examples and three seeded properties pass.
- Two persistence cases pass through the in-memory and real PostgreSQL boundaries.
- Two controlled-fixture cases pass through real Playwright: the baseline completes its required checkpoint, while the identical frozen plan reports drift after the fixture moves its route and checkpoint.
- Real-browser regressions bind response checkpoints to the exact authorized origin, consume each response once, and reject URL-parser backslash escapes before navigation.
- Both tagged JRN-03 BDD scenarios pass, with zero model invocations and no raw fictional values in the durable replay outcome.
- Static lint, type checking, the production dependency audit, and the credential-pattern scan pass.
- [GitHub Actions run 29803249286](https://github.com/GhostlyGawd/hackathon/actions/runs/29803249286) passed from a clean checkout on [Ubuntu](https://github.com/GhostlyGawd/hackathon/actions/runs/29803249286/job/88548347644) and [Windows](https://github.com/GhostlyGawd/hackathon/actions/runs/29803249286/job/88548347622).
- The source-bound evidence contains baseline and drift screenshots, durable replay traces, and paired Playwright browser archives. The browser archives preserve their captured actions, snapshots, screenshots, and network records while replacing the local repository root in optional stack metadata with `$REPOSITORY`.

The bundle remains `IN_PROGRESS` because the independent recorder and common scoring layer do not exist yet. These captures prove this replay seam; they do not prove the end-to-end same-recorder ablation criterion.

## Claim boundary

This task proves deterministic replay behavior and supplies the non-model experimental arm. It does not yet claim independent traffic observation, isolated production execution, model-assisted repair, safety, compliance, or product effectiveness. RUN-01 owns the isolated runner and runtime authorization resolution; RUN-02 owns the independent recorder; RUN-04 owns repair; VAL-02 owns the later model-ablation decision.

All exercised accounts, values, hosts, and agreement content are controlled fictional fixtures. No real student data, credentials, production services, or vendor accusations are present.
