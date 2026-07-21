# DET-04 verifiable evidence-receipt proof

DET-04 turns one stored bounded finding into a downloadable receipt whose
bytes and source links can be checked outside Pactwire. The receipt binds the
finding to the finalized run manifest, exact human-confirmed agreement text,
observed event, canary match, human-confirmed destination, screenshot, action
trace, and run configuration. Each artifact has a SHA-256 hash and byte length.

## Evidence

- [Receipt detail — desktop](receipt-detail-desktop.png) shows the eight
  direct-language receipt sections, exact test limits, agreement citation,
  approval effect, next human decision, verifier result, and artifact hashes at
  a 1440 × 1100 viewport.
- [Receipt detail — narrow](receipt-detail-narrow.png) shows the same review and
  verification information at a 390 × 844 viewport without horizontal
  overflow or hidden evidence.
- [Sanitized receipt bundle](sanitized-receipt-bundle.json) is the exact
  exported bundle used for independent verification. It contains only the
  controlled fictional fixture and a redacted canary digest, never the raw
  canary value.
- [Valid verifier report](verifier-valid.json) records eight verified
  artifacts and ten verified hashes with no issues.
- [Corrupted verifier report](verifier-corrupted.json) records the independent
  verifier rejecting a one-byte action-trace change with
  `ARTIFACT_HASH_MISMATCH` while the stored original remains valid.

The browser proof was captured from the optimized production build at source
commit `2b646151491655b5c66d3bdcbd6b61ee77726062`. Both DET-04 BDD scenarios
cross the real browser, authenticated API, stored fixture, downloaded export,
and a separate verifier process. Persistence tests cover immutable in-memory
and PostgreSQL metadata. The encrypted filesystem object-store test confirms
that stored artifact bytes are not plaintext at rest.

## How to verify the export

From a repository checkout at the source commit, run:

~~~text
pnpm receipt:verify docs/evidence/DET-04/sanitized-receipt-bundle.json
~~~

The verifier recomputes artifact hashes, content hashes, the manifest hash,
required artifact coverage, exact agreement-citation lineage, and correction
links. It requires no Pactwire server, database, or authenticated session.

## Claim boundary

A `VALID` report means the exported bytes match the receipt and its included
semantic lineage. It does not mean that the software is safe, compliant,
approved, or free of behavior outside the named controlled test. The bundle
uses fictional identities, reserved domains, synthetic observations, and a
controlled agreement. Human reviewers still own agreement meaning,
destination identity, and approval decisions. Model explanation is not
included as deterministic evidence.
