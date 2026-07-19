# AUT-04 verification evidence

This record is in progress. The implementation and local checks exist, but no source commit, clean-checkout CI result, or source-bound production screenshot is claimed yet.

## Behavior under test

A privacy officer saves a fictional password, API token, or session cookie for one software record. Pactwire stores only authenticated ciphertext and returns only label, type, lifecycle status, dates, actor provenance, and key version to normal users. A short-lived token binds value release to one browser harness context and one consumption. Human or page attempts to read the raw value are denied and audited.

Before a prompt, log, evidence object, screenshot, or export leaves its controlled boundary, Pactwire replaces raw, percent-encoded, form-encoded, base64, base64url, JSON-escaped, and sensitive-field representations. The product does not claim this proves every possible transformation of a secret; the enforced contract covers the configured representations named and tested here.

## Red-first record

The first unit/property command failed because the secret-isolation module did not exist. The first integration command failed because neither the PostgreSQL repository nor HTTP routes existed. The existing nine browser scenarios remained green while both new scenarios and ten acceptance steps were undefined.

During implementation, PROP-20 found that the automation audit actor lacked its required component identifier. The first full browser run then found that the new panel read a nested software inventory response as a flat record, producing undefined React keys and no selectable software. Both failures were corrected at their actual boundaries and the exact focused commands passed before the full regression run.

The first optimized-production capture exposed a harness-specific authentication mismatch: Playwright's out-of-page HTTP client did not send the production `Secure` session cookie over the local HTTP test URL, so the export assertion received 401 after the in-page credential and redaction checks had passed. The export step now uses the same-origin browser request path used by the product. The fix preserves the production cookie's `Secure` attribute.

## Current local evidence

- Unit tests cover every configured representation, idempotent replacement, structured sensitive fields, authenticated encryption with bound additional data, and screenshot selectors.
- PROP-15 runs 250 seeded values and requires complete configured-representation removal plus idempotence. PROP-20 runs 250 seeded context pairs and requires that a lease cannot cross contexts or be consumed twice.
- PostgreSQL tests prove plaintext is absent from stored envelopes and audits, all four normal-output channels redact, leases expire and remain context-bound, raw access is denied and audited, unsafe exports are defensively redacted, and ciphertext/lease identity cannot be changed directly in SQL.
- HTTP tests prove values and ciphertext never appear in create/list/revoke responses, forged roles do not grant management rights, invalid expiry is bounded, raw access returns a recorded 403, exports contain metadata only, and cross-workspace lookup stays target-neutral.
- The security suite checks 48 dynamically generated credentials across raw and encoded forms. It also launches two real Chromium contexts and proves that the credential cookie and sensitive DOM value do not cross contexts while screenshot masking covers the sensitive input.
- The AUT-04 browser journeys cover raw disclosure, encoded-output redaction, and clearing metadata on a user switch. The final local gate passes 29 test files with 117 checks plus all 12 browser scenarios and 120 steps in 233.8 seconds, with no unexpected HTTP, console, page, popup, or framework-overlay error.

## Visual evidence

The production captures will be added after a source commit exists so each image can be bound to the exact code it depicts. Screenshot calls already apply the same password and sensitive-element mask selectors used by the security contract, including failure captures.

## Current limitations

- AUT-04 covers stored credentials and context-bound leases. Complete browser runtime isolation for cookies, storage, downloads, and clipboard is part of RUN-01.
- The web fixture is intentionally in memory; the PostgreSQL repository and database constraints are verified independently.
- The interface is for generated fictional values only, never real district or student credentials.
