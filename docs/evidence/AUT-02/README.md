# AUT-02 verification evidence

This record is complete. It binds the red-first contract, focused green checks, clean-checkout CI, and bounded browser evidence for software inventory and approval provenance to source commit `8092c84a0beb23c8930970e5f5dd5d8ad43e2267`.

## Behavior under test

Pactwire records the exact school-software tenant, vendor, district owner, known version, and current district approval state. Every state carries an immutable origin naming either a person or an imported district system. Automation and model output cannot originate an imported district state, and the interface says directly that the status is a district record rather than a Pactwire conclusion.

## Red-first record

The initial focused run failed because the inventory module and HTTP route did not exist. The first Gherkin run then executed the three existing access scenarios while leaving all three new inventory scenarios undefined. Those failures preceded the implementation. The first expanded regression later exposed a missing AUT-02 evidence manifest and a five-second integration timeout that was too short for parallel PGlite startup; both gaps were fixed before the complete repository gate passed.

## Current green evidence

- Four schema and copy examples cover imported approval, forbidden automated/model sources, HTTPS tenant validation, and bounded no-run language.
- Three seeded properties run 250 cases each for source authority and immutable provenance.
- PostgreSQL tests cover transactional record/origin/audit creation, append-only origin enforcement, filtering, and workspace isolation.
- HTTP tests cover explicit source responses, operator denial despite a forged client role, invalid automation input, filters, and target-neutral cross-workspace access.
- Three inventory Gherkin scenarios pass alongside the three existing access scenarios: 58 browser steps total with no unexpected HTTP, console, or overlay failure.

The complete deterministic repository gate passed in 159.85 seconds: 20 Vitest files with 82 tests, six package/production builds, three AUT-02 properties at 250 runs each, six browser scenarios with 58 steps, and all lint, type, traceability, domain-evidence, security, accessibility, and end-to-end commands. The security and accessibility projects currently contain no dedicated files; the browser gate still enforces meaningful content, role-labelled controls, responsive rendering, no framework overlay, and no unexpected network or console error for this task.

## Clean-checkout CI

The [AUT-02 pull request](https://github.com/GhostlyGawd/hackathon/pull/11) verified the exact source commit on both required runners:

- [Ubuntu job](https://github.com/GhostlyGawd/hackathon/actions/runs/29704046449/job/88237886063) completed successfully in 2 minutes 48 seconds. Its [raw verification artifact](https://github.com/GhostlyGawd/hackathon/actions/runs/29704046449/artifacts/8447350630) contains the generated reports.
- [Windows job](https://github.com/GhostlyGawd/hackathon/actions/runs/29704046449/job/88237886085) completed successfully in 5 minutes 10 seconds. Its [raw verification artifact](https://github.com/GhostlyGawd/hackathon/actions/runs/29704046449/artifacts/8447373036) contains the generated reports.

## Visual evidence

- [Imported approval inventory](inventory-approved-desktop.png) shows the district status, exact tenant, owner, known version, named source, agreement empty state, no-run language, authorization review, counts, and next safe action.
- [Filtered narrow inventory](inventory-filtered-narrow.png) shows the same source truth after filtering to APPROVED at a 390-pixel browser viewport.

Both images were captured from the production build and are bound to source commit `8092c84a0beb23c8930970e5f5dd5d8ad43e2267`. They contain only fictional names, reserved `.invalid` domains, and fixture record IDs.

## Current limitations

- Agreement, authorization, run, and finding summaries are explicit empty states until their owning PRD tasks are implemented.
- The browser uses signed fictional fixture sessions and an in-memory inventory; PostgreSQL persistence is verified independently.
- Raw CI artifacts follow GitHub's retention policy; the two curated, source-bound captures remain in the repository.
