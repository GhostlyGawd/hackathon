# AUT-01 verification evidence

| Field | Value |
| --- | --- |
| Task | AUT-01 — Implement workspace roles and server-side authorization |
| PRD sections | 5, 14, and 15 |
| Status | COMPLETE |
| Verified source commit | `7ba16b9b08f318f687aa8516079534573e7fcdcd` |
| Local verification date | 2026-07-19 |
| Visual evidence | Five captured desktop and narrow-screen states linked below |

## Behavior under test

Pactwire loads a signed user identity, looks up that user’s workspace roles on the server, and authorizes each restricted request from the stored roles. A browser-supplied role cannot grant permission. Requests for another workspace return a generic unavailable response while the denial is appended only to the caller’s active workspace audit.

## Red-first evidence

The initial focused test run failed because the authorization module did not exist. A later browser acceptance run reached the UI but showed `Session unavailable`: the fictional fixture attempted to pass its UI-only `key` through the strict server principal contract. The fix kept the strict contract and adapted the fixture to send identity fields only.

The first clean-checkout Ubuntu run also exposed an ordering race: a delayed session-restore 401 could clear a newer successful sign-in. The interface now disables sign-in until restoration settles, and every browser scenario intentionally delays the restore response to preserve this regression case.

## Green evidence

- Four unit tests cover workspace creation, the explicit role matrix, operator denial without mutation, and forged-session audit isolation.
- Two seeded properties run 250 cases each for append-only provenance and cross-workspace isolation across reads, mutations, permission references, and exports.
- Six PostgreSQL and HTTP integration tests cover persistence isolation plus every AUT-01 route category.
- Three Gherkin scenarios execute 27 browser steps against the real Next.js routes: allowed assignment, denied assignment with audit review, and a target-neutral cross-workspace lookup.
- Captured screenshots use only fictional names and IDs.

The complete deterministic repository gate passed in 104 seconds: 16 Vitest files with 69 tests, two properties at 250 runs each, three browser scenarios with 27 steps, both production builds, and all lint, type, traceability, toolchain, security, accessibility, and end-to-end commands. The security and accessibility suites currently contain no dedicated files; the browser scenarios still enforce no unexpected console/network failures, no framework overlay, meaningful content, role-labelled controls, and responsive rendering for this task.

## Clean-checkout CI and raw artifacts

Pull request [#10](https://github.com/GhostlyGawd/hackathon/pull/10) installed from the frozen lockfile and passed the complete `pnpm verify` gate on both required operating systems:

- [Verify on ubuntu-latest](https://github.com/GhostlyGawd/hackathon/actions/runs/29702603988/job/88234094591) — passed in 2m28s; [verification artifact](https://github.com/GhostlyGawd/hackathon/actions/runs/29702603988/artifacts/8446923955) uploaded.
- [Verify on windows-latest](https://github.com/GhostlyGawd/hackathon/actions/runs/29702603988/job/88234094596) — passed in 2m59s; [verification artifact](https://github.com/GhostlyGawd/hackathon/actions/runs/29702603988/artifacts/8446929137) uploaded.

Both jobs verified source commit `7ba16b9b08f318f687aa8516079534573e7fcdcd`. Neither reported a failure, retry, or skipped test. Raw artifacts expire after the configured 14-day retention period; this sanitized record and the machine-readable manifest remain durable.

## Captured visual evidence

- [Allowed desktop state](allowed-desktop.png): a fictional privacy officer assigns a reviewer role and the append-only authority event appears.
- [Denied desktop state](denied-desktop.png): a fictional test operator receives a server-enforced denial and cannot inspect the audit.
- [Denied narrow state](denied-narrow.png): the same denial stays readable and operable at a 390-pixel viewport.
- [Denial audit state](denial-audit-desktop.png): a review-capable role sees the bounded denial reason in the active workspace.
- [Cross-workspace state](cross-workspace-desktop.png): a known foreign ID yields a generic unavailable response without revealing the target tenant or user.

## Known limitations

- The web surface is an explicitly labelled local fixture with signed fictional sessions. It is not yet connected to an external identity provider.
- The authorization service has a PostgreSQL repository and integration coverage, while the browser fixture intentionally uses an in-memory repository for deterministic demonstration.
- This evidence verifies the implemented access-control contract; it is not a third-party security certification.
