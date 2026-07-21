# DET-02 deterministic canary matcher evidence

DET-02 compares transient, authorized field values with the run's fictional
canaries before RUN-02 redacts those values. The durable output contains only
SHA-256 digests, canary identifiers, source fields, run and observation IDs,
recorder source, candidate location and path, and one enumerated transform.

The matcher accepts only whole-field equality through `EXACT`, canonical
`URL_ENCODED`, or standard padded `BASE64`. It does not search substrings or
use semantic similarity. A declared transform outside that set produces
`UNSUPPORTED_TRANSFORM`; two canary records matching one candidate produce
`COLLISION`. Neither state contains a positive match record.

## Evidence

- [Generated matcher report](matcher-report.json) binds exact body,
  URL-encoded query, Base64 header, semantic no-match, unsupported storage,
  and collision cases to source commit
  `cd9e74040877c8cbad7d80f49531601a461ae87d`. It also records the fixed
  property seed and 5,000 generated corpus cases.
- [Controlled ambiguity report](ambiguity-matcher-report.json) comes from the
  optimized-production `AMBIGUOUS` browser fixture. The fixture dispatched its
  opaque reference through a real browser/API boundary; the matcher retained
  only its digest and returned `UNSUPPORTED_TRANSFORM` with zero matches.

The real-recorder integration test separately proves that an authorized JSON
field is compared while transient, that its matcher digest equals the
recorder's minimized authorized-field digest, and that the raw fictional
canary is absent from the final recorder report.

## Claim boundary

This evidence proves deterministic matching for authorized field candidates
already extracted by instrumentation. RUN-02 automatically supplies authorized
JSON body fields; query, header, and storage instrumentation can use the same
typed candidate boundary but their automatic extraction adapters are not
claimed here. The matcher cannot infer that an opaque value came from a
canary. It can only refuse a declared unsupported transform or return no
enumerated match. DET-03 owns the later `NEEDS_REVIEW` decision.

Visual evidence is not applicable: DET-02 changes a deterministic recorder
and machine report, not a user interface. The browser-level behavior is
retained as machine-readable Cucumber and matcher output rather than a mockup
or screenshot.
