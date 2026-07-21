# JRN-03 verification evidence

JRN-03 is complete. It provides the human-authored deterministic replay arm: an immutable plan bound to one agreement version, named journey version, authorization, runner configuration, exact action scope, fictional-field bindings, and every required checkpoint. Runtime fictional values are injected only while an operation executes and persist only as hashes.

The deterministic arm now runs through the same independent browser-CDP recorder, exact `POST /collect` capture rule, and required-checkpoint visibility scorer used by the GPT-operated arm. Recorder action claims remain separate from observed browser and network facts. A recorder failure prevents the replay from returning a completed outcome.

The implementation and captured evidence are bound to source commit `2a358b1b5e3de75cdd99ad8638dfe7a86582ce46`.

## Red-first record

The [manifest](manifest.json) records failures before the replay schema, immutable repositories, executor, Playwright adapter, PostgreSQL guards, and BDD steps existed. Earlier regressions exposed stale package resolution, database operator precedence, mismatched author identity, reusable and cross-origin response checkpoints, URL-parser backslash escapes, and orphan evidence. The completion seam adds two more reds: unit/property tests failed before the deterministic recorder sink existed, preserving the first generated shrink as a permanent example, and both browser stories were undefined before the shared visibility score was implemented.

## Current green proof

- The complete optimized-production repository gate passes with 69 deterministic test files and 279 checks, plus 44 browser BDD scenarios with 508 steps.
- Three seeded properties cover 750 generated cases for frozen scope, value-free outcomes and recorder actions, and required-checkpoint failure.
- The shared-recorder sink emits one bounded `DETERMINISTIC` action claim per attempted operation, records no runtime value, and fails closed if the recorder rejects a write.
- Real Playwright cases still prove baseline completion, moved-interface drift, exact-origin response matching, single-use response evidence, and immutable replay persistence.
- The baseline browser story completes six operations with zero model calls, verifies its execution checkpoint, and receives a separate `VISIBLE` score only after the independent recorder observes the exact service request and 204 response.
- The drift story stops after one navigation, leaves the execution checkpoint `NOT_REACHED`, sends no fictional request, and receives a separate `NOT_TESTED` recorder score.
- The same recorder configuration passes seven combined JRN-03, RUN-02, and RUN-03 optimized-production browser stories with 85 steps.
- [GitHub Actions run 29819428856](https://github.com/GhostlyGawd/hackathon/actions/runs/29819428856) passed from clean checkouts on [Ubuntu](https://github.com/GhostlyGawd/hackathon/actions/runs/29819428856/job/88598302133) and [Windows](https://github.com/GhostlyGawd/hackathon/actions/runs/29819428856/job/88598302184).

## Source-bound evidence

- Baseline: [desktop completion](baseline-replay-desktop.png), [deterministic replay outcome](baseline-replay-trace.json), [independent recorder report](baseline-recorder.json), and [sanitized browser trace](baseline-browser-trace-sanitized.zip). The replay is `COMPLETED` with six operations and zero model calls; the independent recorder contains six value-free action claims, eight canonical observations, and a `VISIBLE` required checkpoint.
- Interface drift: [moved-route desktop](drift-replay-desktop.png), [deterministic replay outcome](drift-replay-trace.json), [independent recorder report](drift-recorder.json), and [sanitized browser trace](drift-browser-trace-sanitized.zip). The replay is `DRIFTED` after one navigation with zero model calls; the independent recorder contains one value-free action claim, five observations, and a `NOT_TESTED` required checkpoint.

The baseline and drift archives preserve all 14 and 7 captured Playwright entries plus one sanitizer report each. Expanded trace text and curated JSON were scanned for the configured recorder secret, personal paths, token-shaped credentials, API-key values, and private-key headers. None remained. Both screenshots were visually inspected at 1440 by 1100. No product screen changed in this completion seam, so narrow-viewport duplicates are not applicable.

## Claim boundary

JRN-03 proves a saved human-authored replay and supplies a non-model arm measured through the same P0 recorder and visibility scorer as the GPT arm. It does not aggregate or compare corpus results, claim that GPT adds coverage, diagnose or repair drift, infer agreement meaning, prove compliance, or establish product effectiveness. RUN-04 owns repair, RUN-02 retains the explicit proxy-mode P1 follow-on, and VAL-02 owns the blinded model-ablation decision. All identities, values, hosts, and agreement content are controlled fictional fixtures.
