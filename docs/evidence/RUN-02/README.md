# RUN-02 verification evidence

RUN-02 P0 is complete. It adds an independent, versioned browser-CDP recorder that keeps action claims separate from deterministic observations. It records page navigation, masked screenshot hashes, request destination and response metadata, authorized request-field hashes, browser-storage changes, and explicit capture gaps. Required capture loss deterministically becomes `NOT_VISIBLE`; an unexercised path without a known gap remains `NOT_TESTED`.

The implementation and captured evidence are bound to source commit `dedd0151d819dd99b1cd18609b8fb7713c0e1b60`.

## Red-first record

The [manifest](manifest.json) records failures before the recorder existed, real Chromium's post-response 204 edge, blocked service-worker API behavior, unsafe test matcher assignments, undefined BDD steps, raw URL minimization, missing required-checkpoint validation, optional-field visibility, stale observation hashes after fact tampering, orphan proofs, and a clean-checkout regression caused by a test selecting a CORS `OPTIONS` preflight by host alone. The corrected regression matches the configured host, method, and path and passed six consecutive real-Chromium executions before the replacement CI matrix.

## Current green proof

- The complete optimized-production repository gate passes: 65 deterministic test files with 259 checks, 41 browser BDD scenarios with 467 steps, and every build, type, lint, evidence, domain, end-to-end, security, and accessibility gate.
- Twelve focused unit, property, and real-Chromium integration checks pass.
- PROP-22 proves canonical observation ordering and hashes are invariant to arrival permutations with seed `20260721` over 250 generated cases.
- PROP-05 proves every known required checkpoint gap remains `NOT_VISIBLE` over 250 generated exercised/visibility combinations.
- The real CDP boundary captures navigation, exact request method/URL/host/path, initiator, authorized field hashes, response status/metadata, storage changes, masked screenshot artifacts, and recorder version without persisting raw request bodies.
- Real-browser regressions distinguish a complete 204 response from later transport-tail noise, keep allowed optional fields separate from required visibility, block service-worker control, classify opaque required fields as `NOT_VISIBLE`, and ignore host-matching CORS preflights when validating the configured request.
- Two tagged BDD scenarios pass through the isolated Chromium runner: independent baseline observation and a trusted forced instrumentation gap that page content cannot create.
- [GitHub Actions run 29810698922](https://github.com/GhostlyGawd/hackathon/actions/runs/29810698922) passed from clean checkouts on [Ubuntu](https://github.com/GhostlyGawd/hackathon/actions/runs/29810698922/job/88570804994) and [Windows](https://github.com/GhostlyGawd/hackathon/actions/runs/29810698922/job/88570805010).

## Source-bound evidence

- [Baseline recorder report](baseline-observation-recorder.json) and [desktop screenshot](baseline-observation-desktop.png): the exact `POST /collect` request, authorized fictional field hashes, 204 response, storage changes, and required checkpoint are independently recorded as `VISIBLE`.
- [Baseline browser trace](baseline-observation-browser-trace-sanitized.zip): all fourteen raw Playwright archive entries are preserved.
- [Visibility-loss recorder report](visibility-loss-recorder.json) and [desktop screenshot](visibility-loss-desktop.png): the controlled `INSTRUMENTATION_UNAVAILABLE` event remains authoritative and forces `NOT_VISIBLE` even though the fictional submission completes.
- [Visibility-loss browser trace](visibility-loss-browser-trace-sanitized.zip): all eleven raw Playwright archive entries are preserved.

The two trace archives replace one local repository-root occurrence in optional stack metadata with `$REPOSITORY`. A scan of the expanded archives and curated files found no personal path, token-shaped credential, configured recorder secret, access key, or private-key header. The screenshots were visually inspected at their captured 1280 by 900 viewport. No responsive product screen changed in RUN-02, so a narrow-viewport duplicate is not applicable.

## Claim boundary

This task proves the P0 browser-visible recorder and required-visibility decision. It does not prove proxy visibility, model operation, a contract conflict, safety, compliance, or product effectiveness. FR-038 proxy mode remains explicitly deferred and cannot be represented by the P0 `BROWSER_CDP` schema. All data and destinations are controlled fictional fixtures.
