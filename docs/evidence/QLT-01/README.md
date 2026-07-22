# QLT-01 quality and observability evidence

QLT-01 is complete at source commit `30d5410e27a06b58153155f9158b44b2063f53fa`. The complete deterministic suite passed with 115 test files, 421 tests, 75 browser scenarios, and 904 BDD steps. [GitHub Actions run 29887341588](https://github.com/GhostlyGawd/hackathon/actions/runs/29887341588) independently passed the same deterministic gate on Ubuntu and Windows at exact evidence head `73088fa4ab726e13de259241b213495cb5af284c`.

## What this proves

- Pactwire records only allowlisted analytics events and structured responsibility-lane logs. Artifact and actor references are SHA-256 pseudonyms; arbitrary request bodies, messages, credentials, and student-like values are rejected.
- The signed quality endpoint requires `AUDIT_READ`, conceals cross-workspace records, returns `private, no-store`, and exposes a recomputed report rather than raw telemetry.
- Missing guardrail measurements cannot be reported as a pass. The seven declared guardrails all have explicit samples and zero observed violations in the measured browser profile.
- The fixed browser profile is Chromium `149.0.7827.55` revision `1228`. Firefox, native applications, and unsupported browser capabilities fail closed instead of silently receiving a compatibility claim.
- Retries are idempotent both by immutable record identifier and by semantic state transition.

## Reports

- [Measured browser performance and guardrails](performance.json): 60 console interactions at 10 ms p95 against a 500 ms budget; one run-progress transition at 73 ms against 2,000 ms; and 20 evidence-summary transitions at 66 ms against 500 ms.
- [Reliability soak and compatibility matrix](soak-and-compatibility.json): 10,000 delivery attempts collapse to 2,000 unique analytics events, 2,000 unique logs, and 2,000 unique measurements; every responsibility lane receives 400 logs.
- [Automated accessibility report](accessibility-automated.json): zero Axe A/AA violations and no unresolved incomplete rule other than contrast that Axe could not calculate through layered gradients and pseudo-elements.
- [Keyboard and semantic-state report](accessibility-semantics.json): keyboard activation, textual state meaning, and contextual image alternatives pass. This is DOM/accessibility-tree automation, not a claimed external screen-reader session.
- [Accessible review BDD result](cucumber.json): the production browser scenario completed with all nine hooks and steps passing.

The performance report uses an isolated measurement store, so its zero analytics and responsibility-lane counts are expected. Runtime analytics are exercised by the route integration suite; the soak report separately proves aggregation, lane coverage, retry accounting, and idempotency under deterministic load. Soak timings are generated load-profile inputs, not observed user latency.

## Accessibility review

| Check | Result | Evidence and boundary |
| --- | --- | --- |
| Keyboard reaches and activates the selected finding and stop action | PASS | Production BDD plus `tests/a11y/core-flows.test.ts` |
| Run, finding, and approval states have textual meaning independent of color | PASS | Six run states, six finding states, and one approval state inspected |
| Semantic regions use valid native elements | PASS | Axe reports zero violations and no non-contrast incomplete rules |
| Visible images have contextual alternatives | PASS | One source-bound recorder image inspected |
| Design-token text contrast is at least 4.5:1 on declared surfaces | PASS | Deterministic `tests/unit/quality-color-tokens.test.ts`; the red run caught `--faint` at 4.3901 before correction |
| Layered-gradient contrast | MANUAL REVIEWED | Axe marked 337 nodes indeterminate because it cannot resolve the layered backgrounds. Original-resolution desktop and narrow captures were reviewed against the corrected design tokens; no automated numeric pass is claimed for those nodes. |
| External NVDA, JAWS, or VoiceOver session | NOT EXECUTED | QLT-01 claims automated keyboard and accessibility-tree assertions only. A future external assistive-technology session would broaden evidence, not rewrite this result. |

## Curated visual evidence

- [Accessible authority console, desktop](accessible-authority-console-desktop.png): full fictional setup, run, finding, hold, and workspace-authority surfaces at a 1,440 × 1,100 browser viewport.
- [Accessible authority console, narrow](accessible-authority-console-narrow.png): the same complete authority path stacked at a 390 × 844 browser viewport without clipped controls or hidden states.
- [Accessible finding review, desktop](accessible-finding-review-desktop.png): six distinct finding meanings and the selected evidence hierarchy with model prose excluded from authority.
- [Accessible finding review, narrow](accessible-finding-review-narrow.png): the same finding and evidence order remains readable and operable on the narrow layout.

The screenshots were captured from the production build at the source commit and reviewed at original resolution. They are visual evidence, not a substitute for the automated, property, API, and browser tests.

## Failing-first record

The focused red runs exposed real product or test-contract defects before they were corrected: an absent telemetry module and health profile; an unsafe substring assertion shrunk to punctuation; omitted log metrics; a missing quality endpoint; cross-workspace aggregate leakage; unmeasured guardrails presented as passing; real routes emitting no events; an omitted `UNKNOWN` approval dimension; six low-contrast nodes; three prohibited ARIA labels on semanticless elements; and the `--faint` token at 4.3901. The permanent punctuation regression and token-contrast test preserve the shrunk counterexamples.

One red was a test defect rather than a product defect: the first performance browser assertion targeted `stop-live-run` instead of the implemented `stop-active-run`. The manifest records that distinction.

## Claim limits

- A clean sampled run is not proof of safety, compliance, approval, or behavior outside the named test scope.
- The quality report exposes counts and measured boundaries, not raw traffic or identity.
- The event catalog includes future journey, checkpoint, and finding transitions that current UI routes do not yet perform; no claim of exhaustive runtime emission is made.
- This evidence uses only fictional identities, reserved destinations, synthetic values, and the controlled fixture.
- Exact-head clean-checkout CI passed on Ubuntu and Windows; the closure commit changes only this task status and the recorded CI provenance.
