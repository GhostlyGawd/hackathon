# UX-02 verification evidence

UX-02 is **IN PROGRESS**. The agreement and journey review experience is implemented and locally green at original feature commit `e7cb2398df668bc47bf93b71e55dc52250abe2ff` and corrected combined verification head `030e931fbe91e9d5e31ab5a94f30d8c5f7b8d287`. The implementation head passed clean-checkout Ubuntu and Windows CI in [run 29879337839](https://github.com/GhostlyGawd/hackathon/actions/runs/29879337839), but final closure-head [run 29880132267](https://github.com/GhostlyGawd/hackathon/actions/runs/29880132267) exposed one Windows-only unbounded session-restoration wait. That read now has a five-second deadline; the corrected head must pass both jobs before completion.

## What this task proves

- A requirement decision stays disabled until the reviewer opens the exact stored page cited by the model proposal, returns to the reviewed draft, completes every rule field, and provides a rationale.
- Read-only workspace roles can inspect agreement material but cannot record a requirement decision; the signed server route remains the authority boundary.
- Confirm, ambiguous, and reject controls are keyboard reachable. Confirmation creates a person-checked test instruction; ambiguity and rejection remain non-executable.
- A journey cannot be saved without current software, agreement, confirmed rule, active authorization, fictional persona, allowed action, fictional source field, and a required visible checkpoint.
- The interface directly distinguishes a model proposal, a human-confirmed test rule, and a fact recorded by browser instrumentation.
- Deterministic replay and model-assisted repair have separate history areas. Empty history explicitly does not mean a run passed.

## Red-first record

The first focused example and property commands failed because `apps/web/lib/review-experience.ts` did not exist. The first tagged browser run completed all shared fixture setup, then reported all nine initial UX-02 scenarios undefined. Those failures preceded the implementation. After the UX-02 manifest and proof files were added, the evidence-harness regression test failed on the prior fixed inventory of 18 manifests and 181 proof files; the expected inventory was then reconciled to the checker-observed 19 manifests and 187 proof files.

The new fixed-seed properties use seed `20260721` for 500 generated states each. They prove that no enabled requirement decision lacks authority, exact-source inspection, or complete human input, and no enabled journey save lacks its runnable prerequisites or visible checkpoint.

## Current local evidence

- Four focused example tests and two property tests pass.
- Eleven optimized-production UX-02 browser scenarios pass all 173 steps, including role denial, source navigation, keyboard focus, automated WCAG A/AA checks, authority explanations, journey configuration, and honest replay/repair empty states.
- The corrected combined deterministic gate passes 103 test files with 396 checks and 70 optimized-production browser scenarios with all 843 steps. Failures, retries, and skipped required checks are zero.
- Repository traceability passes with 27 manifests and 278 proof files after reconciling the complete dependency stack.
- Whole-repository evidence, domain-evidence, TypeScript, lint, production build, security, accessibility, and end-to-end gates pass. The production dependency audit reports no known vulnerabilities.
- The screenshots below were captured from the optimized production build at the source commit above. They contain only the controlled fictional district, fictional people, and reserved `.invalid` destinations.
- Every screenshot was reviewed at original resolution and compared with the prior AGR-03 or JRN-02 source-bound screen where one existed. No clipping, overlap, broken focus treatment, or narrow-layout horizontal overflow was observed.

## Visual evidence

| Asset | Viewport | What it shows |
| --- | --- | --- |
| [Source required](requirement-source-required-desktop.png) | 1440 × 1100 | A complete draft remains blocked until the cited stored page is opened. |
| [Cited page focus](citation-page-keyboard-focus-desktop.png) | 1440 × 1100 | The exact stored agreement page has programmatic keyboard focus and a direct return action. |
| [Confirm focus](requirement-confirm-keyboard-focus-desktop.png) | 1440 × 1100 | Source inspection is recorded, the decision is ready, and keyboard focus is visible on Confirm. |
| [Ambiguous focus](requirement-ambiguous-keyboard-focus-desktop.png) | 1440 × 1100 | Keyboard focus moves to Mark ambiguous without changing the review state. |
| [Reject focus](requirement-reject-keyboard-focus-desktop.png) | 1440 × 1100 | Keyboard focus moves to Reject while the source, rationale, and authority explanation remain visible. |
| [Confirmed rule](requirement-confirmed-desktop.png) | 1440 × 1100 | A human-confirmed executable test rule remains beside its exact source and immutable proposal history. |
| [Requirement history](requirement-version-history-desktop.png) | 1440 × 1100 | Human version 2 appends to preserved non-executable model proposal version 1. |
| [Ambiguous narrow](requirement-ambiguous-narrow.png) | 390 × 844 | The direct three-lane authority explanation and non-executable ambiguous decision stack without clipping. |
| [Rejected rule](requirement-rejected-desktop.png) | 1440 × 1100 | A rejected model draft remains non-executable and preserves source, human rationale, and lineage. |
| [Teacher journey](teacher-journey-editor-desktop.png) | 1440 × 1100 | Current rule, authority, fictional actor, allowed/prohibited actions, required checkpoint, causal chain, versions, and empty replay/repair histories. |
| [Student journey narrow](student-journey-editor-narrow.png) | 390 × 844 | The same journey configuration and history boundaries at a narrow viewport. |
| [Journey checkpoint focus](journey-checkpoint-keyboard-focus-desktop.png) | 1440 × 1100 | Keyboard focus is visible on required checkpoint visibility before the first journey version is saved. |

## Remaining gate and claim boundary

The corrected closure head must pass required GitHub Actions jobs on both operating systems. This task's journey editor truthfully displays empty replay and repair histories; UX-03 owns the populated run, finding, receipt, and hold presentation. A human-confirmed rule is a bounded test instruction, not legal advice, software approval, proof of safety, or proof of compliance. A runnable journey is a complete specification, not evidence that a browser run occurred or passed.
