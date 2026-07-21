# RUN-04 verification evidence

RUN-04 is in progress. Source-bound deterministic evidence at commit `0082dcceece05db5986b43fb5b4dc3ecd69072e6` proves the bounded repair and unresolved branches. The required live GPT-5.6 Sol workflow and Ubuntu/Windows CI were both triggered, but GitHub refused to start their jobs because the account's Actions payment or spending limit requires attention. That external pre-execution failure is not counted as product evidence or a completed gate.

## Current green proof

- Unit examples reject action, binding, operation, assertion, and checkpoint changes as bounded repairs.
- Two seeded properties cover 500 generated cases and prevent authorization expansion or promotion without every frozen checkpoint.
- A real-browser integration moves `/student` to `/learner`, changes `submit-assignment` to `turn-in-response`, and verifies the unchanged `submission-request` checkpoint in a fresh isolated browser.
- Append-only in-memory and PostgreSQL repositories keep the model draft, deterministic verification, and human promotion as separate records.
- Two optimized-production BDD stories pass: the bounded repair becomes version 2 only after exact verification and human review; the outage remains `UNRESOLVED` and `NOT_TESTED`.
- Hash-valid forged repair envelopes are rejected before a browser operation or promotion, and PostgreSQL derives checkpoint truth from the actual checkpoint entries instead of trusting a summary field.

## Source-bound deterministic evidence

The successful controlled path is preserved as the [drifted starting state](bounded-repair-before-desktop.png), [model-adapter discovery result](bounded-repair-model-discovery-desktop.png), and [fresh deterministic checkpoint result](bounded-repair-checkpoint-verified-desktop.png). Machine-readable evidence includes the [model-adapter run](bounded-repair-model-run.json), [observed controls](bounded-repair-model-observations.json), [bounded draft](bounded-repair-draft.json), [candidate outcome](bounded-repair-candidate-outcome.json), [verification](bounded-repair-verification.json), [promoted replay](bounded-repair-promoted-replay.json), and [human promotion receipt](bounded-repair-promotion.json).

The unresolved branch is preserved as the [failure starting state](unresolved-repair-before-desktop.png), [failed discovery result](unresolved-repair-model-discovery-desktop.png), [unresolved draft](unresolved-repair-draft.json), and [`NOT_TESTED` verification](unresolved-repair-verification.json).

Five source, discovery, and verification recordings were sanitized. Their paired reports record zero credential-pattern findings: [bounded source](bounded-repair-source-sanitization.json), [bounded discovery](bounded-repair-discovery-sanitization.json), [bounded verification](bounded-repair-verification-sanitization.json), [unresolved source](unresolved-repair-source-sanitization.json), and [unresolved discovery](unresolved-repair-discovery-sanitization.json). Raw traces remain ignored local artifacts.

## Required before completion

- Restore GitHub Actions billing or spending capacity, rerun the opt-in encrypted-key workflow against GPT-5.6 Sol, and preserve its sanitized outputs.
- Pass the complete deterministic repository gate and clean Ubuntu/Windows CI.
- Replace this in-progress manifest with source-bound evidence metadata and an honest final limitation record.

## Claim boundary

The current proof covers one controlled fictional interface change and one controlled outage. It does not establish a general repair rate, interpret agreement meaning, broaden test authority, prove compliance, or permit the model to activate a replay.
