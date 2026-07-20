# JRN-01 verification evidence

This record is in progress. The implementation and focused local checks exist, but no source commit, clean-checkout CI result, or source-bound production screenshot is claimed yet.

## Behavior under test

A signed district test operator configures an obviously fictional teacher or student. Pactwire displays a permanent warning, scans the submitted name, email, and custom fields on the server, blocks bounded likely-real patterns before persistence, and requires an explicit fictional-only confirmation. A saved address must use the reserved non-deliverable `.invalid` domain.

For a prepared run, the operator selects specific persona fields. Pactwire creates one immutable mapping from that run, persona, and source field to a generated value. Replaying the same selection returns the existing mapping. Another run receives disjoint values, an unrelated run receives nothing, and the database prevents a value from being reused anywhere in the installation.

## Red-first record

The first unit/property command failed because the synthetic-data module did not exist and zero tests ran. The first focused Gherkin run kept all twelve existing setup steps green while all eighteen new behavior steps remained undefined. The first integration command failed because neither the PostgreSQL repository nor the signed routes existed.

Implementation then exposed three narrower counterexamples:

- the service passed its trusted authorization envelope into the strict persona scanner, so the property shrank immediately to a one-field email case and the scanner rejected its own envelope;
- the PostgreSQL audit writer omitted the required `actor_kind` column; and
- an unauthorized reviewer with a forged client role received a body-validation `400` before the server expressed the real audited permission denial.

The scanner now receives only the four user-data fields, the audit writer persists actor kind, and authorization runs from the signed principal and route workspace before untrusted body validation.

A final pre-commit trust-boundary review produced another red case: the new POST routes spread JSON fields after their trusted envelope, so a reviewer could substitute a known privacy-officer principal. The adversarial route test observed `201` instead of `403`. All three routes now merge untrusted fields first and overwrite `principal`, `workspaceId`, and `runId` from the signed cookie and URL. Forged envelopes are denied for scanning, persona creation, and canary generation.

The first repository-wide regression run found one additional integration failure after all 127 non-browser tests passed: the added panel produced enough legitimate read-audit events during a user switch to push a previously recorded permission denial outside the UI's eight-item history. The dashboard now retains the latest 24 events. The original AUT-01 authority feature then passed all three scenarios and 27 steps, including visible denial evidence after the switch.

## Current green evidence

- Unit examples cover routable addresses, numeric identifiers, phone patterns, unmarked names, safe `.invalid` inputs, confirmation, idempotent source mappings, and canary formatting.
- PROP-16 runs 250 generated field sets and run pairs across two isolated workspaces with seed `20260719`. It requires one mapping per source, exact replay, globally disjoint cross-run and cross-workspace values, and reserved domains for address canaries.
- PostgreSQL tests prove confirmation and scan evidence persist, rejected bytes do not enter audits, source mappings are complete, values are globally unique, unrelated runs are empty, and canaries are immutable.
- Signed HTTP tests prove an operator can configure test data, a likely-real submission returns a bounded `422` without echoing values, a forged role cannot grant permission, and cross-workspace access remains target-neutral.
- Three JRN-01 browser scenarios and all 30 steps pass with no unexpected HTTP, console, page, popup, or framework-overlay error.

## Visual evidence

The production captures will be added after a source commit exists. The planned proof is a desktop success state with fictional teacher/student mappings and a narrow blocked-input state after the submitted values have been cleared from the page.

## Current limitations

- The likely-real-data scanner is a bounded prevention layer, not proof that an arbitrary value is fictional. Production release still requires a synthetic tenant, staff training, log/seed review, and manual privacy review.
- The browser fixture uses prepared run identifiers in memory; PostgreSQL integration proves the same canary records require real run and persona foreign keys.
- JRN-01 generates traceable values. Deterministic matching of exact and enumerated transforms is owned by DET-02.
- A reserved `.invalid` address cannot be a deliverable production email. Pactwire does not query or import external production account directories.
