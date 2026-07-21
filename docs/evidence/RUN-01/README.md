# RUN-01 verification evidence

RUN-01 is in progress. It adds a browser-execution primitive that allocates a fresh Chromium process, browser context, clipboard scope, and download root to every run. The runner applies exact navigation-origin and network-host policy below future model code, blocks service workers, mediates popups, downloads, and clipboard access, and destroys owned resources only after artifact finalization or immediately after a crash.

## Red-first record

The manifest records the missing-module failure before implementation, the initial trace-schema compile failure, the WebSocket and URL-credential policy gap, undefined BDD bindings, lint failures in the new binding, and the orphan-proof failure before this evidence bundle existed.

## Current green proof

- The complete optimized-production repository gate passes: 62 deterministic test files with 247 checks, 39 browser BDD scenarios with 447 steps, and every build, type, lint, evidence, domain, end-to-end, security, and accessibility gate.
- Ten focused unit, property, and real-Chromium integration checks pass.
- Two PROP-20 properties pass with seed `20260721` and 250 generated cases each.
- The sequential BDD story proves that cookie, local storage, isolated clipboard state, and downloads from one run are absent from the next run at the same authorized origin.
- The crash-recovery BDD story uses CDP to crash a real renderer, waits for terminal cleanup, and proves the recovery run starts without the crashed run's browser state.
- HTTP navigation, HTTP subresource requests, WebSockets, popups, downloads, and clipboard access are exercised through their real browser boundaries.
- Policy-violation records retain only a hostname and SHA-256 URL digest, not the query text used by the negative test.

Source-bound traces and clean-checkout CI are still pending. The bundle will remain `IN_PROGRESS` until those checks pass.

## Claim boundary

This task proves a trusted isolated-browser runner and its lifecycle boundary. It does not yet prove independent observation, model operation, agreement conformity, safety, compliance, or effectiveness. RUN-02 owns the recorder and RUN-03 owns the GPT-5.6 computer-use loop. All exercised data and destinations are controlled fictional fixtures.
