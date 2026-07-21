# RUN-04 verification evidence

RUN-04 is in progress. The deterministic implementation is complete locally: GPT-operated browser actions can identify a moved relative path and reviewed selector, but the resulting repair is only a model-proposed draft. A fresh isolated browser must replay that draft and the independent recorder must see the original human-confirmed checkpoint. Only then may a named human append a new deterministic replay version.

## Current green proof

- Unit examples reject action, binding, operation, assertion, and checkpoint changes as bounded repairs.
- Two seeded properties cover 500 generated cases and prevent authorization expansion or promotion without every frozen checkpoint.
- A real-browser integration moves `/student` to `/learner`, changes `submit-assignment` to `turn-in-response`, and verifies the unchanged `submission-request` checkpoint in a fresh isolated browser.
- Append-only in-memory and PostgreSQL repositories keep the model draft, deterministic verification, and human promotion as separate records.
- Two optimized-production BDD stories pass: the bounded repair becomes version 2 only after exact verification and human review; the outage remains `UNRESOLVED` and `NOT_TESTED`.

## Required before completion

- Run the opt-in encrypted-key workflow against GPT-5.6 Sol and preserve its sanitized outputs.
- Commit the implementation, recapture deterministic evidence at that source commit, sanitize all browser traces, and inspect the screenshots.
- Pass the complete deterministic repository gate and clean Ubuntu/Windows CI.
- Replace this in-progress manifest with source-bound evidence metadata and an honest final limitation record.

## Claim boundary

The current proof covers one controlled fictional interface change and one controlled outage. It does not establish a general repair rate, interpret agreement meaning, broaden test authority, prove compliance, or permit the model to activate a replay.
