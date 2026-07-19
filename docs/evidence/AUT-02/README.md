# AUT-02 verification evidence

This record is in progress. It captures the red-first contract, focused green checks, and bounded browser evidence for software inventory and approval provenance. It will be finalized only after a committed source revision passes clean-checkout CI on Ubuntu and Windows.

## Behavior under test

Pactwire records the exact school-software tenant, vendor, district owner, known version, and current district approval state. Every state carries an immutable origin naming either a person or an imported district system. Automation and model output cannot originate an imported district state, and the interface says directly that the status is a district record rather than a Pactwire conclusion.

## Red-first record

The initial focused run failed because the inventory module and HTTP route did not exist. The first Gherkin run then executed the three existing access scenarios while leaving all three new inventory scenarios undefined. Those failures preceded the implementation.

## Current green evidence

- Four schema and copy examples cover imported approval, forbidden automated/model sources, HTTPS tenant validation, and bounded no-run language.
- Three seeded properties run 250 cases each for source authority and immutable provenance.
- PostgreSQL tests cover transactional record/origin/audit creation, append-only origin enforcement, filtering, and workspace isolation.
- HTTP tests cover explicit source responses, operator denial despite a forged client role, invalid automation input, filters, and target-neutral cross-workspace access.
- Three inventory Gherkin scenarios pass alongside the three existing access scenarios: 58 browser steps total with no unexpected HTTP, console, or overlay failure.

The complete deterministic repository gate passed in 159.85 seconds: 20 Vitest files with 82 tests, six package/production builds, three AUT-02 properties at 250 runs each, six browser scenarios with 58 steps, and all lint, type, traceability, domain-evidence, security, accessibility, and end-to-end commands. The security and accessibility projects currently contain no dedicated files; the browser gate still enforces meaningful content, role-labelled controls, responsive rendering, no framework overlay, and no unexpected network or console error for this task.

## Provisional visual evidence

- [Imported approval inventory](inventory-approved-desktop.png) shows the district status, exact tenant, owner, known version, named source, agreement empty state, no-run language, authorization review, counts, and next safe action.
- [Filtered narrow inventory](inventory-filtered-narrow.png) shows the same source truth after filtering to APPROVED at a 390-pixel browser viewport.

Both images were captured from the production build. They contain only fictional names, reserved `.invalid` domains, and fixture record IDs. Their source commit will be bound after the implementation commit is created.

## Current limitations

- Agreement, authorization, run, and finding summaries are explicit empty states until their owning PRD tasks are implemented.
- The browser uses signed fictional fixture sessions and an in-memory inventory; PostgreSQL persistence is verified independently.
- Visual captures are provisional until they are bound to a committed source revision.
