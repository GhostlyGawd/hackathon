# VAL-01 blinded mechanism-correctness corpus

VAL-01 tests whether Pactwire's deterministic evidence path classifies observed
data-sharing behavior correctly. It does not test whether a vendor is compliant
or whether a model can infer legal meaning.

At source commit
`275dc630e55281c8d424ec612acd5f8a0e63d3c3`, a three-process harness generated,
evaluated, and scored 120 reproducible fictional cases. The controlled result
passed every threshold:

- 48 of 48 instrumentable conflicts were reported as `WITNESSED_CONFLICT`;
- zero of 72 other cases were incorrectly reported as conflicts;
- precision was 100% (48/48; 95% Wilson CI 92.59%–100%);
- recall was 100% (48/48; 95% Wilson CI 92.59%–100%);
- all 42 cases requiring bounded uncertainty used the required state;
- all 120 evidence hashes were recomputed and matched independently; and
- no case created an automated approval, promoted an unknown destination to a
  conflict, or executed an action outside the frozen allowlist.

The generated [results chart](mechanism-results.md),
[machine-readable score](mechanism-score.json), and
[confusion matrix](confusion-matrix.json) show the denominators and thresholds.
The [error table](error-table.json) contains zero errors; this is retained as an
explicit result rather than omitted.

## What the corpus exercises

The public corpus covers exact, URL-encoded, base64, unsupported opaque, and
absent canary values; known allowed, known prohibited, and unknown
destinations; recipient and collection restrictions; complete, partial,
failed, not-tested, and not-visible paths; layout and navigation drift;
prompt-injection controls; and clean reruns.

Each public case passes through the product's real scope manifest, canary
matcher, bounded finding evaluator, prompt-injection control policy, and
approval-event schema. The [coverage report](corpus-coverage.json) records all
dimension counts. These are deterministic controlled-fixture boundaries, not
mock labels supplied directly to the scorer.

## Blinding and integrity

The generator writes two different files. The evaluator reads only
[corpus-public.json](corpus-public.json), which contains inputs and observed
evidence but no expected outcome. A separate process reads the sealed oracle
only after [predictions.json](predictions.json) exists. Static tests reject an
oracle import or extra file read in the evaluator, and schema tests reject an
expected label in the public corpus.

The full oracle is intentionally not curated or committed. The
[oracle commitment](oracle-commitment.json) records its SHA-256 digest and case
count without exposing labels. The scorer separately canonicalizes every
evidence record and publishes all comparisons in
[hash-verification.json](hash-verification.json). This is process isolation for
a reproducible repository experiment; a repository administrator can still
inspect or alter generator source, so it is not a claim of cryptographic
secrecy from the person running the repository.

## Executable tests

Focused VAL-01 unit, property, and integration verification passed 4 files and
10 tests. The property suite used seed `20260722` for 100 runs and proved both
seeded reproducibility and absence of oracle-shaped keys in the evaluated
path. Known false-positive and false-negative fixtures fail the scorer, a
coverage-deficient corpus fails the coverage gate, and a one-result mutation
creates both a false negative and an invalid evidence hash.

Seven `@VAL-01` production-boundary BDD scenarios passed with 57 steps. They
sample a prohibited exact transfer, unknown destination, unsupported
transformation, not-visible evidence, prompt injection, clean rerun, and the
complete threshold decision. The [Cucumber report](cucumber.json) contains the
scenario-level results.

The exact evidence-bearing tree passed the complete uninterrupted `pnpm verify`
gate in 588.9 seconds: 125 test files, 447 tests, 82 optimized-production BDD
scenarios, and 961 steps, with zero failure, skip, or retry. Clean-checkout
evidence head `dec884917478553d23019e43bc18bc32c182ad2c` then passed the
same gate on
[Ubuntu](https://github.com/GhostlyGawd/hackathon/actions/runs/29894214354/job/88840831642)
and
[Windows](https://github.com/GhostlyGawd/hackathon/actions/runs/29894214354/job/88840831589).

## Visual evidence

VAL-01 changes no product screen and does not operate a browser, so desktop and
narrow screenshots are not applicable. The generated results chart is the
appropriate visual evidence for this evaluation: it displays the measured
precision and recall beside their required thresholds and is generated from
the same machine-readable score used by the completion gate.

## Claim boundary

- The 100% result applies only to this controlled, seeded mechanism corpus.
- It does not establish behavior on live vendor interfaces, real accounts, or
  real student data.
- Drift and prompt-injection cases prove deterministic policy behavior; they do
  not establish live GPT-5.6 effectiveness. VAL-02 owns that claim.
- Collection restrictions are compiled into confirmed observable data-flow and
  destination rules before scoring; legal interpretation remains a human
  responsibility.
- No model grades its own output, establishes ground truth, approves a rule, or
  converts uncertainty into a conflict.
- Target-user usefulness and claim comprehension require human validation and
  remain owned by VAL-03.
