# AUT-01 verification evidence

This record is in progress. It will be finalized with clean-checkout Ubuntu and Windows CI links after the implementation commit is pushed.

## Behavior under test

Pactwire loads a signed user identity, looks up that user’s workspace roles on the server, and authorizes each restricted request from the stored roles. A browser-supplied role cannot grant permission. Requests for another workspace return a generic unavailable response while the denial is appended only to the caller’s active workspace audit.

## Red-first evidence

The initial focused test run failed because the authorization module did not exist. A later browser acceptance run reached the UI but showed `Session unavailable`: the fictional fixture attempted to pass its UI-only `key` through the strict server principal contract. The fix kept the strict contract and adapted the fixture to send identity fields only.

## Current green evidence

- Four unit tests cover workspace creation, the explicit role matrix, operator denial without mutation, and forged-session audit isolation.
- Two seeded properties run 250 cases each for append-only provenance and cross-workspace isolation across reads, mutations, permission references, and exports.
- Six PostgreSQL and HTTP integration tests cover persistence isolation plus every AUT-01 route category.
- Three Gherkin scenarios execute 27 browser steps against the real Next.js routes: allowed assignment, denied assignment with audit review, and a target-neutral cross-workspace lookup.
- Captured screenshots use only fictional names and IDs.

The complete deterministic repository gate passed in 104 seconds: 16 Vitest files with 69 tests, two properties at 250 runs each, three browser scenarios with 27 steps, both production builds, and all lint, type, traceability, toolchain, security, accessibility, and end-to-end commands. The security and accessibility suites currently contain no dedicated files; the browser scenarios still enforce no unexpected console/network failures, no framework overlay, meaningful content, role-labelled controls, and responsive rendering for this task.

## Known limitations

- The web surface is an explicitly labelled local fixture with signed fictional sessions. It is not yet connected to an external identity provider.
- The authorization service has a PostgreSQL repository and integration coverage, while the browser fixture intentionally uses an in-memory repository for deterministic demonstration.
- This evidence verifies the implemented access-control contract; it is not a third-party security certification.
