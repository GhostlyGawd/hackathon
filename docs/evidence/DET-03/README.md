# DET-03 bounded finding evaluation evidence

DET-03 turns a finalized run manifest, a human-confirmed executable rule,
deterministic canary outcomes, and human-confirmed destination records into one
of six bounded finding states. The decision order is deterministic. Model prose
is stored and displayed separately, labeled **Model explanation — not
evidence**, and cannot change the state or reason codes.

## Evidence

- [Finding-state matrix — desktop](finding-state-matrix-desktop.png) shows all
  six direct-language states and the selected witnessed-conflict detail. The
  selected detail names the test scope, path coverage, run manifest, matched
  observation, prohibited destination version, reason codes, model boundary,
  and limitations.
- [Finding-state matrix — narrow](finding-state-matrix-narrow.png) shows the
  same state matrix and selected evidence at a 390 × 844 viewport without
  hiding scope or decision ownership.
- [Machine-readable decision table](decision-table.json) records the ordered
  evaluator conditions and one controlled fictional example of every bounded
  state from the authenticated API.

The browser evidence was captured from the optimized production build at
source commit `614182176d3848d53c0b0d5dcff143ea1c8ee533`. The five DET-03 BDD
scenarios traverse the real page and authenticated API for complete baseline,
witnessed conflict, repaired rerun, visibility loss, and ambiguity cases. The
PostgreSQL integration separately verifies that the exact evaluation payload is
append-only and bound to the finalized run-manifest hash.

## Claim boundary

The screenshots and reports use controlled fictional identities, reserved
domains, and synthetic observations. They prove the evaluator mechanism and
its user-visible boundaries in this controlled environment. They do not prove
that software is safe, compliant, approved, or free of behavior outside the
named test scope. Purpose, legal meaning, unknown ownership, unsupported
transforms, collisions, and incomplete lineage remain human-review cases.
