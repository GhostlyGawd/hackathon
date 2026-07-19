# AUT-03 verification evidence

This record is in progress. It captures the red-first contracts, deterministic policy properties, PostgreSQL and HTTP boundaries, browser acceptance scenarios, and source-bound visual evidence for test authorization and action policy. It will be complete only after a committed source revision passes clean-checkout CI on Ubuntu and Windows.

## Behavior under test

A signed district user records why one exact software tenant may be tested, when that authority must be reviewed or expires, the exact HTTPS destinations and base path, the actions the runner may take, the actions it may never take, and the redirect and popup policy. Pactwire evaluates the stored policy beneath the model. Expired, review-due, revoked, out-of-domain, out-of-path, popup, and prohibited-action attempts stop before execution and create an append-only decision with a fixed reason.

## Red-first record

The initial focused run failed because the test-authorization module and four HTTP route boundaries did not exist. The first Gherkin run left all three authorization scenarios and twenty-two steps undefined while the six prior scenarios remained green. Those failures preceded the implementation.

The first source-commit CI run then found a Windows-only acceptance-test race. The software creation request had already persisted with `201`, but the setup step waited for a transient success banner that disappeared during the development server's first-route refresh. The step now waits for the exact successful `POST`, reloads, and asserts the persisted software appears in the authorization selector. A Windows CI-mode rerun passed all 9 scenarios and 92 steps before the fix was pushed.

## Current green evidence

- Schema and unit examples cover human-only attestation, bounded dates, exact base paths, unlisted redirects, popup policy, prohibited actions, and effective time-derived status.
- PROP-13 generates exact domains and actions outside the allowlist and requires deterministic denial in every case.
- PROP-14 generates expired and revoked authorization states and requires the run-queue decision to deny every case.
- PostgreSQL tests cover transactional policy/audit persistence, append-only decisions, revocation, service-level queue denial, and database rejection when a caller bypasses the service.
- HTTP tests cover server-derived human identity, operator denial despite forged authority, bounded redirect responses, expired and revoked queue conflicts, incomplete attestation, and target-neutral cross-workspace handling.
- Three AUT-03 Gherkin scenarios pass alongside the six prior scenarios: 92 browser steps total. The blocked redirect leaves the browser URL unchanged, no popup page opens, and the full browser gate reports no unexpected HTTP, console, page, or framework-overlay error.
- The complete local `pnpm verify` gate passes: 43 unit tests, 19 seeded property tests, 36 integration tests, and 9 browser scenarios with 92 steps. Lint, type checking, evidence validation, migration validation, and the production Next.js build pass in the same gate.
- The production dependency audit reports no known vulnerabilities, and the repository credential-pattern scan reports no token or private-key matches.
- The security and accessibility script slots do not yet contain dedicated standalone files. For this task, policy abuse cases are covered in unit, property, integration, PostgreSQL, and browser tests; browser acceptance also checks meaningful content, labeled controls, narrow layout, and runtime errors. Dedicated cross-product security and accessibility suites remain later implementation-plan work.

## Visual evidence

The [desktop authorization capture](authorization-active-desktop.png) shows the current human-attested scope before a run queues. The [narrow blocked-attempt capture](authorization-blocked-narrow.png) shows fixed denial reasons for delete, popup, and outside-domain redirect attempts. Both were captured from the production build. They contain only fictional names, reserved `.invalid` domains, fixture identifiers, and synthetic policy text.

## Current limitations

- AUT-03 proves authorization and queue eligibility; later runner tasks will call the same deterministic gate during real model-operated execution.
- The controlled browser fixture uses in-memory state while PostgreSQL persistence and the direct SQL queue trigger are verified independently.
- Visual source binding and clean-checkout CI are pending the source commit.
