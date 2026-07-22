# SEC-01 security and privacy threat suite

SEC-01 now exercises every threat named in PRD section 16 against the real
deterministic boundary that owns the decision. The machine-readable
[threat matrix](threat-matrix.json) contains 11 passing controls and an explicit
residual risk for each threat. It is not a model-written security grade.

## Material fix

The audit found a real retention defect. Evidence artifacts were encrypted in
the content-addressed object store, but the same bytes were also embedded as
base64 in immutable receipt JSON. An object-store deletion therefore would not
have removed the retained payload.

At implementation commit
`e7b074c1bc233ee6ee49d1039bf3ab30edd08a93`:

- receipt rows store hashes, lengths, bounded sanitized summaries, and artifact
  metadata without `contentBase64`;
- artifact bytes exist only in the evidence object store and are rehydrated for
  an authorized private review;
- a privacy officer must supply the exact receipt ID and a reason before manual
  deletion;
- deletion is idempotent, appends `REQUESTED` and `COMPLETED` tombstones, and
  preserves shared objects until no retained receipt references them;
- a 30-day product default can be configured from 1 through 365 days and the
  retention worker uses the same fail-closed deletion path; and
- deleted artifact content returns HTTP 410 while immutable audit metadata
  remains.

The decision and its non-legal boundary are recorded in
[SEC-01 evidence retention and release decision](../../decisions/SEC-01-evidence-retention-and-release.md).

## Release boundary

Pactwire P0 permits only a sanitized download by an authorized human for
private review. The response is labeled `private-review-only`. An explicit
external-public delivery request is denied. There is no route that publishes a
finding, contacts a vendor, or turns a sampled run into a public accusation.

## Executable threat evidence

The [threat matrix](threat-matrix.json) invokes the actual controls for:

1. likely real-data blocking without echo;
2. prompt-injected control rejection;
3. secret-representation redaction and type blocking;
4. exact-host egress denial;
5. human handoff for messaging and prohibition of deletion;
6. cross-workspace concealment and mutation denial;
7. one-byte receipt mutation invalidation;
8. UNKNOWN destination identity until human confirmation;
9. NOT_VISIBLE after required capture loss;
10. denial of external-public evidence delivery; and
11. metadata-only persistence plus tombstoned artifact deletion.

The [repository secret scan](repository-secret-scan.json) inspected all 496
tracked and non-ignored worktree text files. It reported no high-confidence
OpenAI, GitHub, AWS, private-key, or tracked environment-file finding. A clean
scan means only that those configured patterns were absent in that revision.

The earlier production dependency prerequisite remains active: the frozen graph
rejects the vulnerable `fast-uri` and optional `sharp` ranges, and the package
manager audit must remain green. A clean registry audit does not prove the graph
vulnerability-free.

## Browser and recovery proof

Five SEC-tagged optimized-production BDD scenarios passed with 61 steps:

- `prompt-injection.feature` — page instructions cannot create authority;
- `authorization.feature` — redirect, popup, DELETE, and real-person messaging
  attempts stop before execution;
- `failure-recovery.feature` — the risky action remains unclicked and a changed
  receipt artifact becomes INVALID while the stored receipt remains VALID.

The [Cucumber report](cucumber.json) records the complete scenario result. The
prompt-injection and human-handoff screenshots are paired with sanitized action,
run, and independent-recorder JSON. The authorization screenshot shows the
bounded blocked state and append-only reasons at the narrow viewport. The
tamper bundle is synthetic and sanitized; the two verifier reports show the
valid/invalid transition without changing stored evidence.

Visual review at original resolution found no clipped control, overlapping
content, missing state label, or real identity. The three screenshots show
controlled fictional or reserved-domain data only. SEC-01 did not change a UI
screen, so the captures prove boundary states rather than a responsive redesign.

## Test record

The focused implementation gates passed 13 files and 37 tests with zero
failure, skip, or retry. The applicable fixed-seed suites cover PROP-04,
PROP-09, PROP-12, PROP-13, PROP-15, and PROP-20. New SEC policy properties use
seed `20260722` for 500 runs; existing boundary properties retain their recorded
task seeds and permanent shrunk regressions.

The evidence-reconciled tree also passed the uninterrupted `pnpm verify` gate in
539 seconds: 121 test files, 437 tests, 75 optimized-production browser
scenarios, and 904 steps, with zero failure, skip, or retry. Evidence head
`46da20a0733e64c968920e3adde08f0413c63857` then passed the same clean-checkout
gate on [Ubuntu](https://github.com/GhostlyGawd/hackathon/actions/runs/29891082669/job/88831505721)
and [Windows](https://github.com/GhostlyGawd/hackathon/actions/runs/29891082669/job/88831505724).

## Claim boundary

- Every run uses the controlled fictional fixture, fictional identities,
  synthetic values, and reserved test destinations.
- A passing threat case proves only the tested control and named scope.
- A valid receipt proves included bytes match the immutable hashes; it does not
  prove complete capture, safety, compliance, approval, or legal meaning.
- The 30-day duration is a Pactwire product default, not legal advice.
- Production deletion still requires deployment-specific validation for
  backups, replicas, caches, object storage, and encryption keys.
- A human can copy a private export outside Pactwire; the P0 release policy
  prevents product-operated publication, not every out-of-band action.
- Deterministic adapters prove the harness boundary. They do not establish live
  GPT-5.6 effectiveness, which belongs to VAL-02.
