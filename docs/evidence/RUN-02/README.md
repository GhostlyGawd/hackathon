# RUN-02 verification evidence

RUN-02 P0 is in progress. It adds an independent, versioned browser-CDP recorder that keeps action claims separate from deterministic observations. It records page navigation, masked screenshot hashes, request destination and response metadata, authorized request-field hashes, browser-storage changes, and explicit capture gaps. Required capture loss deterministically becomes `NOT_VISIBLE`; an unexercised path without a known gap remains `NOT_TESTED`.

## Red-first record

The manifest records failures before the recorder existed, real Chromium's post-response 204 edge, blocked service-worker API behavior, unsafe test matcher assignments, undefined BDD steps, raw URL minimization, missing required-checkpoint validation, optional-field visibility, stale observation hashes after fact tampering, and orphan proofs.

## Current green proof

- The complete optimized-production repository gate passes: 65 deterministic test files with 259 checks, 41 browser BDD scenarios with 467 steps, and every build, type, lint, evidence, domain, end-to-end, security, and accessibility gate.
- Twelve focused unit, property, and real-Chromium integration checks pass.
- PROP-22 proves canonical observation ordering and hashes are invariant to arrival permutations with seed `20260721` over 250 generated cases.
- PROP-05 proves every known required checkpoint gap remains `NOT_VISIBLE` over 250 generated exercised/visibility combinations.
- The real CDP boundary captures navigation, request method/URL/host/path, initiator, authorized field hashes, response status/metadata, storage changes, masked screenshot artifacts, and recorder version without persisting raw request bodies.
- Real-browser regressions distinguish a complete 204 response from later transport-tail noise, keep allowed optional fields separate from required visibility, block service-worker control, and classify opaque required fields as `NOT_VISIBLE`.
- Two tagged BDD scenarios pass through the isolated Chromium runner: independent baseline observation and a trusted forced instrumentation gap that page content cannot create.

Source-bound optimized-production reports, screenshots, sanitized paired browser traces, and clean-checkout CI are pending. The bundle remains `IN_PROGRESS` until those checks pass.

## Claim boundary

This task proves the P0 browser-visible recorder and required-visibility decision. It does not prove proxy visibility, model operation, a contract conflict, safety, compliance, or product effectiveness. FR-038 proxy mode remains explicitly deferred and cannot be represented by the P0 `BROWSER_CDP` schema. All data and destinations are controlled fictional fixtures.
