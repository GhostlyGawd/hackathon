# UX-01 verification evidence

UX-01 is **IN PROGRESS**. The product shell and resumable six-step setup workflow are implemented at source commit `addb4a04744bf20074c79bfc36fc56d12db45db5`; the security-patched latest-main regression head `edee755bb681fa3f8d1e3ed1d6dbe8545fd149ab` is locally green. Clean-checkout Ubuntu and Windows CI must still pass before this task can become complete.

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

## Current local evidence

- Five unit/component examples, three property-file checks, and two HTTP integration checks pass.
- Two fixed-seed properties run 500 cases each with seed `20260720`.
- Four optimized-production browser scenarios pass all 69 steps: leave/resume, full run-ready configuration, keyboard/Axe accessibility, and empty/error/retry recovery.
- The production web build and production dependency audit pass.
- The complete security-patched latest-main `pnpm verify` gate passes in 567.2 seconds: 101 Vitest files with 390 checks, all 65 production-browser scenarios with 763 steps, the optimized build, and every lint, type, evidence, toolchain, security, accessibility, and end-to-end command. Failures, retries, and skipped required checks are zero.
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

## Remaining gate and claim boundary

The task remains in progress until the pull request receives clean-checkout verification on both required GitHub Actions runners. Setup readiness means the named fictional configuration has all stored prerequisites; it does not mean a run occurred, no conflict exists, or the software is safe, compliant, or approved by Pactwire. Comprehensive manual screen-reader and WCAG 2.2 review remains QLT-01.
