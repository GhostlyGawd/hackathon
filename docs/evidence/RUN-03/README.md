# RUN-03 verification evidence

RUN-03 is in progress. The deterministic portion implements the current GPT-5.6 computer-use action contract, repeats fixed trusted instructions on every Responses continuation, exchanges viewport screenshots at original detail, and executes actions only after an exact-origin and reviewed-control policy allows them. Browser content is never an authority input to that policy.

## Current green proof

- Focused unit, property, real-Chromium integration, workflow-contract, type, and lint checks pass.
- Three seeded properties cover 750 generated cases for exact-origin/action denial, page-instruction non-authority, and configured-secret containment.
- Seven real isolated-browser integrations cover an authorized batched action journey, prompt-injection targeting, human-required messaging, popup and redirect containment beneath the model, refusal, and bounded timeout recovery.
- Three optimized-production BDD scenarios pass through the controlled fictional fixture and independent recorder: authorized completion, prompt-injection blocking, and a pre-click human handoff.
- The opt-in live workflow is isolated from pull requests and `main`, requires the encrypted `OPENAI_API_KEY`, runs explicit `gpt-5.6-sol`, and stages only an allowlisted sanitized evidence set.

## Remaining completion gates

The task is not complete yet. The live GPT-5.6 Sol journey must pass from the implementation source commit, its browser trace must be sanitized and reviewed, deterministic evidence must be captured from the same source commit, and clean Ubuntu/Windows CI must pass. The final manifest will bind those assets and run URLs to that source commit.

## Claim boundary

Current local proof establishes policy enforcement and deterministic adapter behavior against controlled fictional fixtures. It does not yet claim a passing live-model journey, contract conformity, safety, compliance, or effectiveness. A clean sampled run will mean only that the named fictional journey reached its deterministic checkpoint inside its frozen scope.
