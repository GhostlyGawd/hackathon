# AGR-01 verification evidence

This record is complete. It binds exact agreement bytes, content-addressed storage, immutable version metadata, signed upload permissions, page extraction, source download, red-first tests, clean-checkout CI, and reviewed production visuals to source commit `225d3ca64c0f684fb92b5cc5c5222c428f9c60f2`.

## Behavior under test

A signed district privacy officer selects a school software record and uploads a PDF or UTF-8 text agreement. Pactwire computes SHA-256 from the exact uploaded bytes, stores those bytes under a content-addressed key, extracts bounded page text without a model, and records the file name, byte count, effective dates, uploader, time, and sequential page map in a new immutable version.

Uploading the exact same bytes for the same software reuses the existing version. Changing one byte changes the hash and creates the next version without changing the prior record. Every original-file read checks both length and SHA against immutable metadata; every displayed page includes offsets and a SHA for the displayed text.

## Red-first record

The first primitive command failed because the agreement-intake module did not exist. The first AGR-01 Cucumber run left the shared signed-session and software setup green while all fifteen agreement behavior steps were undefined. The first repository integration run then failed at the missing `AGREEMENT_UPLOAD` authorization boundary, and the HTTP suite failed to import the not-yet-created routes.

Implementation exposed two additional integrity counterexamples. First, an object store accepted bytes under a key naming a different SHA. Second, the filesystem adapter returned a deliberately tampered file without rejecting it. The object-store boundary now validates the key against bytes on both write and read, while the service independently verifies stored length and SHA before returning an original.

The first shared non-browser regression also correctly rejected the new tests as orphaned until this task manifest bound them to AGR-01.

The first source-commit CI run then exposed a cross-platform harness counterexample. `pnpm verify` built the optimized application and subsequently launched `next dev` from the same `.next` tree. Ubuntu reported a canceled original-file download followed by stale 404 responses and DOM timeouts, while Windows passed. A red-first mode-selection test now fixes the contract: CI uses the already-built production server, local runs retain development mode, and either mode can be explicitly selected. The complete `CI=true pnpm verify` matrix and both clean-checkout runners pass after this change.

## Current green evidence

- Unit examples cover exact-byte hashing, text page offsets and page hashes, unsupported and malformed input, and content-address enforcement.
- The seeded property runs 250 byte arrays and proves exact replay keeps one hash while an XOR mutation at any generated position changes it.
- PostgreSQL and filesystem integration covers text and real two-page PDF fixtures, exact original reads, duplicate reuse, next-version creation, audit minimization, SQL update/delete rejection, at-rest corruption, reviewer read-only access, and cross-workspace hiding.
- Signed multipart-route tests prove uploader identity comes from the session, forged client actor fields are ignored, malformed input stores no version, exact downloads preserve bytes, and authorization happens before body processing.
- All three focused AGR-01 browser scenarios and 30 steps pass with no unexpected HTTP, console, page, popup, or framework-overlay error. The successful journey also performs a browser download and hashes the downloaded file.
- The final local gate passes 38 Vitest files with 143 checks plus all 18 browser scenarios and 180 steps. The production dependency audit reports no known vulnerabilities, and the bounded repository credential-pattern scan reports no token, access-key, API-key, Slack-token, or private-key matches.

## Clean-checkout CI

The [AGR-01 pull request](https://github.com/GhostlyGawd/hackathon/pull/15) verified source commit `225d3ca64c0f684fb92b5cc5c5222c428f9c60f2` on both required runners:

- The [Ubuntu job](https://github.com/GhostlyGawd/hackathon/actions/runs/29716705752/job/88271302738) completed successfully in 4 minutes 38 seconds. Its [raw verification artifact](https://github.com/GhostlyGawd/hackathon/actions/runs/29716705752/artifacts/8450898259) contains the generated reports.
- The [Windows job](https://github.com/GhostlyGawd/hackathon/actions/runs/29716705752/job/88271302762) completed successfully in 6 minutes 34 seconds. Its [raw verification artifact](https://github.com/GhostlyGawd/hackathon/actions/runs/29716705752/artifacts/8450924385) contains the generated reports.

## Visual evidence

The [desktop source capture](agreement-source-desktop.png) shows the immutable version, original SHA-256, uploader, effective dates, exact-source download, and two extracted fictional pages with their own hashes. The [narrow invalid-PDF capture](agreement-invalid-pdf-narrow.png) shows the malformed file rejected and zero versions stored.

Both images were captured from the optimized production build at source commit `225d3ca64c0f684fb92b5cc5c5222c428f9c60f2` and reviewed at original resolution. They contain only fictional fixture names, reserved test content, deterministic hashes, and test timestamps; no credential, personal path, real student data, private agreement, or real-vendor accusation is present.

## Current limitations

- Page extraction reads embedded PDF text; image-only scanned PDFs are rejected because OCR is not part of AGR-01.
- Extracted page text and hashes make source locations verifiable, but they do not interpret legal meaning. Human rule confirmation belongs to AGR-03.
- Agreement input is bounded to 10 MB, 500 pages, and two million extracted characters.
- The local browser fixture uses an ephemeral in-memory store. AGR-01 also provides PostgreSQL metadata and filesystem object-store adapters; production deployment wiring remains a release task.
