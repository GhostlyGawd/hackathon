# UX-01 verification evidence

UX-01 is **COMPLETE**. The product shell and resumable six-step setup workflow are implemented at source commit `addb4a04744bf20074c79bfc36fc56d12db45db5`; the corrected latest regression head `82bf741b4e53e6d44ec49ac240e580e745513e44` passes locally and in clean-checkout Ubuntu and Windows CI run [29878705897](https://github.com/GhostlyGawd/hackathon/actions/runs/29878705897).

## What this task proves

- The inventory identifies the exact school-software tenant, its district-owned status source, the next authorization review, and one direct next action without treating a sampled run as a green result.
- Setup exposes all six prerequisites at once, stops at the first missing prerequisite, explains every downstream blocker, and resumes from the software and step identifiers in the URL.
- Run-ready derives only from saved authorization, agreement, human-confirmed executable requirement, fictional test data, and a runnable journey with required visible checkpoints.
- Arbitrary model prose cannot change displayed district status or deterministic readiness.
- Empty, loading, error, retry, desktop, narrow, keyboard, and automated WCAG A/AA states are exercised.

## Red-first record

The first focused unit/property command failed because `packages/core/src/setup-workflow.ts` did not exist. The first UX-01 browser run timed out looking for a `continue-setup` control because the setup workflow had not been implemented. During property work, Fast Check shrank untrusted model prose to a single whitespace character; that counterexample is preserved as an example regression.

The first curated visual review found that an initial request failure still left the heading as “Loading software setup.” The heading now becomes “Software setup,” and the recovery BDD scenario asserts that exact state before retrying.

After merging the complete DET and SEC stack, the expanded property matrix exposed two worker-starvation timeouts without producing an invariant counterexample. Four workers still allowed the longest unchanged 500-run property to exceed its original deadline. The property project now uses one worker; two complete repeat matrices and the complete gate pass without changing a seed, run count, assertion, or timeout.

The first latest-head CI run passed on Ubuntu but exposed an unnecessary global session-restore interceptor in the Windows BDD harness. One RUN-05 scenario remained on the real disabled “Restoring session…” control until Playwright's action deadline. Removing that test-only interceptor preserved the real session API boundary; the exact RUN-05 path then passed three independent optimized-production runs, followed by the complete browser matrix.

## Current local evidence

- Five unit/component examples, three property-file checks, and two HTTP integration checks pass.
- Two fixed-seed properties run 500 cases each with seed `20260720`.
- Four optimized-production browser scenarios pass all 69 steps: leave/resume, full run-ready configuration, keyboard/Axe accessibility, and empty/error/retry recovery.
- The production web build and production dependency audit pass.
- The complete security-patched latest-main `pnpm verify` gate passes in 567.2 seconds: 101 Vitest files with 390 checks, all 65 production-browser scenarios with 763 steps, the optimized build, and every lint, type, evidence, toolchain, security, accessibility, and end-to-end command. Failures, retries, and skipped required checks are zero.
- After the Windows-only harness failure, the exact two-scenario RUN-05 production subset passed three consecutive independent runs (57 total steps), and the complete 65-scenario, 763-step production BDD matrix passed again in 253.6 seconds with no retries or skips.
- Clean-checkout verification passes on [Ubuntu](https://github.com/GhostlyGawd/hackathon/actions/runs/29878705897/job/88794677401) and [Windows](https://github.com/GhostlyGawd/hackathon/actions/runs/29878705897/job/88794677369) for the corrected source head.
- The screenshots below were captured from the optimized build at the source commit named above and reviewed at original resolution. They contain only controlled fictional records and reserved `.invalid` destinations.

## Visual evidence

| Asset | Viewport | What it shows |
| --- | --- | --- |
| [Inventory desktop](inventory-desktop.png) | 1440 × 1100 | One fictional software record with district provenance, neutral run wording, blocker, and next action. |
| [Setup step 1](setup-step-01-software-desktop.png) | 1440 × 1100 | Recorded software and its original district-status source. |
| [Setup step 2](setup-step-02-authorization-desktop.png) | 1440 × 1100 | Authorization is the first action required and later steps are blocked. |
| [Setup step 3](setup-step-03-agreement-desktop.png) | 1440 × 1100 | Agreement upload remains visible but cannot bypass authorization. |
| [Setup step 4](setup-step-04-requirements-desktop.png) | 1440 × 1100 | Human requirement confirmation remains visible and blocked in sequence. |
| [Setup step 5](setup-step-05-test-data-desktop.png) | 1440 × 1100 | Fictional accounts and test fields remain visible and blocked in sequence. |
| [Setup step 6](setup-step-06-journey-desktop.png) | 1440 × 1100 | Named journeys and required visibility remain visible and blocked in sequence. |
| [Blocked setup narrow](setup-blocked-narrow.png) | 390 × 844 | The complete six-step blocker chain and disabled out-of-order action at a narrow viewport. |
| [Inventory narrow](inventory-narrow.png) | 390 × 844 | The same inventory provenance and next action without horizontal clipping. |
| [Authorization recovered](setup-authorization-recovered-desktop.png) | 1440 × 1100 | Authorization changes to complete and agreement upload becomes the next action. |
| [Run-ready setup desktop](setup-run-ready-desktop.png) | 1440 × 1100 | Six saved prerequisites complete and the named fictional-data run action exposed. |
| [Run-ready inventory desktop](inventory-run-ready-desktop.png) | 1440 × 1100 | Agreement version, review date, and named-run action derived from saved configuration. |
| [Run-ready setup narrow](setup-run-ready-narrow.png) | 390 × 844 | Complete setup and deterministic run-ready state at a narrow viewport. |
| [Run-ready inventory narrow](inventory-run-ready-narrow.png) | 390 × 844 | Complete inventory metadata and next action at a narrow viewport. |
| [Recoverable setup error](setup-error-narrow.png) | 390 × 844 | Direct failure copy and a visible retry control without a misleading loading heading. |

## Claim boundary

Setup readiness means the named fictional configuration has all stored prerequisites; it does not mean a run occurred, no conflict exists, or the software is safe, compliant, or approved by Pactwire. Comprehensive manual screen-reader and WCAG 2.2 review remains QLT-01.
