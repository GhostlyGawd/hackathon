# AUT-04 verification evidence

This record is complete. It binds the red-first contracts, seeded redaction and context-isolation properties, PostgreSQL and HTTP boundaries, browser acceptance scenarios, clean-checkout CI, and sanitized visual evidence to source commit `8ea84c338f3d4caf62c47475c3e119101aa5fd9d`.

## Behavior under test

A privacy officer saves a fictional password, API token, or session cookie for one software record. Pactwire stores only authenticated ciphertext and returns only label, type, lifecycle status, dates, actor provenance, and key version to normal users. A short-lived token binds value release to one browser harness context and one consumption. Human or page attempts to read the raw value are denied and audited.

Before a prompt, log, evidence object, screenshot, or export leaves its controlled boundary, Pactwire replaces raw, percent-encoded, form-encoded, base64, base64url, JSON-escaped, and sensitive-field representations. The product does not claim this proves every possible transformation of a secret; the enforced contract covers the configured representations named and tested here.

## Red-first record

The first unit/property command failed because the secret-isolation module did not exist. The first integration command failed because neither the PostgreSQL repository nor HTTP routes existed. The existing nine browser scenarios remained green while both new scenarios and ten acceptance steps were undefined.

During implementation, PROP-20 found that the automation audit actor lacked its required component identifier. The first full browser run then found that the new panel read a nested software inventory response as a flat record, producing undefined React keys and no selectable software. Both failures were corrected at their actual boundaries and the exact focused commands passed before the full regression run.

The first optimized-production capture exposed a harness-specific authentication mismatch: Playwright's out-of-page HTTP client did not send the production `Secure` session cookie over the local HTTP test URL, so the export assertion received 401 after the in-page credential and redaction checks had passed. The export step now uses the same-origin browser request path used by the product. The fix preserves the production cookie's `Secure` attribute.

## Current green evidence

- Unit tests cover every configured representation, idempotent replacement, structured sensitive fields, authenticated encryption with bound additional data, and screenshot selectors.
- PROP-15 runs 250 seeded values and requires complete configured-representation removal plus idempotence. PROP-20 runs 250 seeded context pairs and requires that a lease cannot cross contexts or be consumed twice.
- PostgreSQL tests prove plaintext is absent from stored envelopes and audits, all four normal-output channels redact, leases expire and remain context-bound, raw access is denied and audited, unsafe exports are defensively redacted, and ciphertext/lease identity cannot be changed directly in SQL.
- HTTP tests prove values and ciphertext never appear in create/list/revoke responses, forged roles do not grant management rights, invalid expiry is bounded, raw access returns a recorded 403, exports contain metadata only, and cross-workspace lookup stays target-neutral.
- The security suite checks 48 dynamically generated credentials across raw and encoded forms. It also launches two real Chromium contexts and proves that the credential cookie and sensitive DOM value do not cross contexts while screenshot masking covers the sensitive input.
- The AUT-04 browser journeys cover raw disclosure, encoded-output redaction, and clearing metadata on a user switch. The final local gate passes 29 test files with 117 checks plus all 12 browser scenarios and 120 steps in 277.1 seconds, with no unexpected HTTP, console, page, popup, or framework-overlay error.
- The production dependency audit reports no known vulnerabilities, and the bounded repository credential-pattern scan reports no token, access-key, or private-key matches.

## Clean-checkout CI

The [AUT-04 pull request](https://github.com/GhostlyGawd/hackathon/pull/13) verified the exact source commit on both required runners:

- The [Ubuntu job](https://github.com/GhostlyGawd/hackathon/actions/runs/29708777641/job/88249829573) completed successfully in 4 minutes 22 seconds. Its [raw verification artifact](https://github.com/GhostlyGawd/hackathon/actions/runs/29708777641/artifacts/8448617099) contains the generated reports.
- The [Windows job](https://github.com/GhostlyGawd/hackathon/actions/runs/29708777641/job/88249829566) completed successfully in 6 minutes 9 seconds. Its [raw verification artifact](https://github.com/GhostlyGawd/hackathon/actions/runs/29708777641/artifacts/8448624563) contains the generated reports.

## Visual evidence

The [narrow denial capture](secret-access-denied-narrow.png) shows the generated field masked, the saved record reduced to label/type/status/dates/key version, and the raw-access request blocked and marked as audited. The [desktop redaction capture](secret-redaction-desktop.png) shows eight replacements across prompt, log, structured evidence, encoded text, and export content. Both were captured from the optimized production build at source commit `8ea84c338f3d4caf62c47475c3e119101aa5fd9d` and reviewed at original resolution. They contain only fictional fixture names, a fixed redaction marker, and a Playwright mask over the generated credential field.

## Current limitations

- AUT-04 covers stored credentials and context-bound leases. Complete browser runtime isolation for cookies, storage, downloads, and clipboard is part of RUN-01.
- The web fixture is intentionally in memory; the PostgreSQL repository and database constraints are verified independently.
- The interface is for generated fictional values only, never real district or student credentials.
- Raw CI artifacts follow GitHub's retention policy; the two curated, source-bound captures remain in this repository.
