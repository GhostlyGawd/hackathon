# AGR-03 verification evidence — complete for P0

AGR-03 P0 is complete at implementation source commit `a1566dbd1fdf1da4a60c9f443b3219ce74d3158a`. A named human can review a model proposal beside its exact stored agreement text, edit the observable rule, explain the decision, and confirm, mark ambiguous, or reject it. FR-015 agreement-version comparison remains explicitly deferred as P1.

## Behavior implemented

- Confirmation requires a human actor, a rationale, complete observable fields, and a deterministic predicate. It appends an executable version without rewriting the model proposal or citation.
- Ambiguous and rejected decisions append non-executable versions and preserve the reviewer, time, rationale, and canonical old/new values.
- Both repositories reject stale review sources. The PostgreSQL transaction locks the latest version; the deterministic in-memory fixture serializes competing writes so two decisions cannot fork one source.
- Signed no-store HTTP routes enforce the reviewer permission boundary and return bounded not-found or stale-conflict errors.
- The browser uses direct language: “Confirm means use this as a test rule.” It also says that confirmation does not accept a model's legal interpretation, prove safety, or change software approval.

## What passed

- Six focused proof files contain 25 passing tests across examples, seeded properties, service/PostgreSQL persistence, signed routes, migrations, and evidence integrity.
- `PROP-10` and `PROP-17` each ran 250 cases with seed `20260720`. The shrunk `plainLanguage=" !"` counterexample remains a permanent example regression for canonical change recording.
- Three production browser scenarios and 35 steps cover confirmation, ambiguity, rejection, exact source preservation, and immutable history.
- The final local `pnpm verify` gate passed in 233.0 seconds with the completed manifest and visual assets present: 82 unit, 28 property, 75 integration, 23 BDD scenarios / 238 steps, and 2 security tests, plus workspace, toolchain, evidence, domain, lint, type-check, build, E2E, and accessibility gates.
- Optimized-production captures were made from the implementation commit and visually reviewed for direct state labels, desktop/narrow layout, authority copy, and fictional-only data:
  - `requirement-confirmed-desktop.png` — SHA-256 `d3780470227f43b366e742e540dd39d83413af29f2aa717abd5f085403b7d98a`
  - `requirement-version-history-desktop.png` — SHA-256 `45fd3a60be274e595d2a20e5d3c8585c45e6bdb9cf202a158ff102b8bb058629`
  - `requirement-ambiguous-narrow.png` — SHA-256 `e3b10ec497b5f02d657c668fb1d04a720cbf66b74d8e0ac595ea1647f86f704c`
  - `requirement-rejected-desktop.png` — SHA-256 `447def92144969e1b7d9955dd39da95f317dacfc3ae7421ef41af4b5fda27057`
- Clean-checkout verification passed on [Ubuntu](https://github.com/GhostlyGawd/hackathon/actions/runs/29793141664/job/88518969178) and [Windows](https://github.com/GhostlyGawd/hackathon/actions/runs/29793141664/job/88518969141).

## Known limitations

- FR-015 is not implemented. It stays deferred until changed agreement spans can identify affected journeys and force explicit human re-review with scenario and visual evidence.
- A human-confirmed requirement is only a bounded test rule. It does not establish legal meaning, safety, compliance, or software approval.
- The predicate is recorded here; deterministic traffic evaluation belongs to DET-03.
- Browser BDD uses ephemeral fictional storage. PostgreSQL persistence is proved separately at the repository boundary.
