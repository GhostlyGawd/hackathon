# Pactwire implementation plan

| Field | Value |
| --- | --- |
| Source | [Pactwire PRD](PRD.md) |
| Plan status | Version 1 — execution backlog; implementation in progress |
| Task packages | 35 |
| P0 functional requirements | 40 |
| P1 functional requirements | 3 |
| Completion model | Failing-first tests, implementation, full regression, evidence |
| Last updated | 2026-07-19 |

This plan converts the PRD into dependency-aware, independently verifiable task packages. It is a build contract, not evidence that any feature already exists.

The word **complete** has one meaning in this repository: the task's acceptance criteria pass, all required test layers pass, its PRD traceability is current, and its evidence bundle exists. A screenshot without tests is not completion. Tests without a working user flow are not completion when the task changes a user flow.

## 1. Delivery rules

### 1.1 Task lifecycle

Every implementation task follows the same sequence:

1. **Select:** identify one task ID, its PRD sections, functional requirements, dependencies, and evidence obligations.
2. **Red:** add the smallest automated test that fails for the missing behavior. Record the command and the expected reason for failure.
3. **Green:** add the smallest production implementation that makes the new test pass.
4. **Refactor:** improve the design without weakening the test or authority boundary.
5. **Regress:** run the task-specific tests and the complete repository verification suite.
6. **Exercise:** run applicable Gherkin scenarios through the real product boundary.
7. **Inspect:** capture real visual evidence when the change is visible or browser-operated.
8. **Trace:** update the task, PRD requirement, scenario, test, and evidence mapping.
9. **Review:** inspect failures, skipped tests, warnings, flaky retries, and claim language.
10. **Close:** mark the task complete only after every required artifact is attached to the pull request.

If the test unexpectedly passes during the Red step, the test does not prove the new behavior. Strengthen the test or document that the behavior already exists before continuing.

### 1.2 Test selection rule

| Behavior | Required test |
| --- | --- |
| Pure transformation, schema, reducer, or validator | Unit test |
| An invariant over many possible inputs or event sequences | Property-based test |
| User-visible workflow, authority decision, or recovery path | BDD scenario and browser end-to-end test |
| Database, object storage, browser, or service boundary | Integration test |
| OpenAI request or response contract | Deterministic adapter contract test plus an opt-in live GPT-5.6 contract test |
| Security boundary | Negative integration test and adversarial scenario |
| Visual interface or browser-operated behavior | Browser test plus captured screenshot, trace, or video |
| Performance, accessibility, or compatibility claim | Measured check with a stored report |

Property testing and BDD complement TDD; neither replaces a focused failing test.

### 1.3 Planned canonical commands

FND-01 must create these repository-level commands. Until FND-01 is complete, they are planned interfaces and must not be described as currently runnable.

~~~text
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:property
pnpm test:integration
pnpm test:bdd
pnpm test:e2e
pnpm test:security
pnpm test:a11y
pnpm test:live-openai
pnpm verify
~~~

**pnpm verify** must run every deterministic P0 gate used in normal CI. Live OpenAI tests and target-user studies are separately gated because they require credentials, cost, or external participants, but their last verified result must be present before claims that depend on them.

### 1.4 OpenAI test boundary

- Normal CI uses a deterministic OpenAI adapter fixture to test refusal, incomplete output, invalid schema, and expected tool-action handling.
- Live GPT-5.6 contract tests use the controlled fixture and synthetic data only.
- A mocked response can validate application behavior but cannot validate model effectiveness.
- Model output is never the oracle for network facts, canary matches, company identity, legal meaning, evidence integrity, or approval.
- Computer-use tests run in an isolated browser or container, enforce a domain/action allowlist below the model, keep people in the loop for consequential actions, and treat page content as untrusted.
- PDF agreement tests cover extracted text, page-image handling, unreadable input, missing citations, refusal, and incomplete structured output.

These boundaries follow current OpenAI guidance for computer use, structured outputs, file inputs, and eval-driven development.

## 2. Evidence contract

### 2.1 Evidence bundle

Each task produces a CI artifact at:

~~~text
artifacts/verification/<task-id>/
  manifest.json
  red.txt
  green.txt
  regression.txt
  reports/
  traces/
  screenshots/
  videos/
~~~

Raw artifacts are not committed automatically. Curated, sanitized proof used by README, PRD, demo, or review is copied to:

~~~text
docs/evidence/<task-id>/
~~~

The verification manifest records:

- task ID and title;
- PRD section and FR IDs;
- source commit SHA;
- environment and runner versions;
- exact commands and exit codes;
- test counts, skips, retries, failures, and durations;
- property-test seed, run count, and shrunk counterexample when applicable;
- BDD feature and scenario names;
- live-model identifier when applicable;
- visual asset paths, capture date, viewport, alt text, caption, and provenance;
- sanitization review;
- known limitations; and
- reviewer and completion time.

FND-02 defines and validates the manifest schema. A task with missing required evidence fails its completion gate.

### 2.2 Visual evidence

Visual evidence is required when a task changes:

- a user-facing screen, state, responsive layout, or accessibility behavior;
- a browser-operated journey;
- a finding, receipt, approval transition, or recovery state;
- a fixture behavior shown in the final demonstration; or
- an architecture or evaluation relationship that is materially clearer visually.

Minimum proof:

| Change | Required visual proof |
| --- | --- |
| New or changed screen | Desktop screenshot, narrow-viewport screenshot, and relevant empty/error state |
| State transition | Before and after screenshots with the same synthetic record |
| Browser automation | Trace or short recording plus the deterministic recorder event |
| Finding or receipt | Finding page and inspectable evidence detail |
| Security stop | Blocked-action or prompt-injection state without exposed secrets |
| Evaluation result | Generated chart plus its underlying machine-readable report |

Rules:

- Capture the actual running product at the task commit.
- Do not use a mockup, concept image, or visual-regression baseline as proof that behavior works.
- Sanitize credentials, tokens, personal paths, third-party data, and private research.
- Use fictional names, reserved domains, and synthetic identifiers.
- Store alt text, caption, source commit, capture date, and whether the asset is captured or generated.
- Attach or embed the curated proof in the pull request.
- If visual evidence is not applicable, state why in the pull request. “Not captured” is not the same as “not applicable.”

### 2.3 Section completion gate

A PRD section is successful only when:

1. every P0 task mapped to it is complete;
2. every mapped P0 requirement has at least one passing test;
3. every applicable property and BDD scenario passes;
4. relevant visual proof is attached;
5. no required check is skipped or quarantined;
6. limitations and unvalidated claims remain explicit; and
7. the traceability audit finds no orphan section, requirement, test, scenario, or evidence asset.

P1 work may remain **DEFERRED**, but it must have a named follow-on acceptance gate. Deferred work is never reported as passing.

## 3. Property invariant catalog

Property tests use generated inputs and event sequences with reproducible seeds. The initial TypeScript implementation should use a mature property-test library selected in FND-01.

| ID | Invariant |
| --- | --- |
| PROP-01 | No automated actor or event sequence can enter or restore APPROVED |
| PROP-02 | The only automated approval transition is APPROVED → HOLD |
| PROP-03 | Replaying the same idempotency key cannot create a second hold event |
| PROP-04 | UNKNOWN destination ownership cannot produce a recipient-based WITNESSED_CONFLICT |
| PROP-05 | A clean or not-reobserved finding is impossible when any required checkpoint is untested or invisible |
| PROP-06 | A canary match is possible only through exact equality or an explicitly enumerated reversible transform |
| PROP-07 | Model prose, confidence, or semantic similarity cannot change a deterministic finding |
| PROP-08 | Equivalent canonical evidence produces the same manifest hash |
| PROP-09 | Changing any hashed evidence byte invalidates the receipt |
| PROP-10 | Corrections supersede prior findings without mutating their bytes or history |
| PROP-11 | Audit and approval histories are append-only and preserve actor provenance |
| PROP-12 | Workspace A can never read, mutate, reference, or export workspace B's records |
| PROP-13 | The authorization policy denies every domain and action outside the explicit allowlist |
| PROP-14 | Expired or revoked authorization can never queue a run |
| PROP-15 | Secret redaction is idempotent and removes every configured secret representation |
| PROP-16 | Generated canaries are unique per run, map to one source field, and use reserved non-deliverable domains |
| PROP-17 | Unconfirmed or invalid model proposals can never become executable rules |
| PROP-18 | Run retries preserve the frozen agreement, journey, authorization, and runner configuration |
| PROP-19 | Every terminal run state produces a complete manifest or an explicit integrity failure |
| PROP-20 | Browser contexts share no cookies, local storage, downloads, clipboard, or credentials |
| PROP-21 | A positive witnessed conflict remains bounded to its named observed scope even when unrelated paths are partial |
| PROP-22 | Event ordering and hashing remain deterministic under arbitrary safe retry sequences |
| PROP-23 | The same controlled-fixture seed and version produce identical public facts and seeded behavior |
| PROP-24 | Switching a controlled-fixture version preserves every stable fictional fact and changes only declared behavior |

Every discovered counterexample becomes a permanent example-based regression test before the fix is merged.

## 4. BDD scenario catalog

Gherkin feature files are executed through the real web and browser boundaries. Each scenario carries task and FR tags.

| Feature | Core scenarios |
| --- | --- |
| workspace-access.feature | Authorized role succeeds; unauthorized role is denied; cross-workspace record is invisible |
| software-inventory.feature | Human-owned approval imports with provenance; model activity cannot create approval |
| authorization.feature | Valid scope queues a run; expired scope blocks; redirect and unexpected action stop |
| agreement-intake.feature | PDF uploads and hashes; unreadable file fails safely; cited proposal is reviewable |
| requirement-review.feature | Confirm, edit, reject, mark ambiguous, and version a proposal |
| synthetic-personas.feature | Fictional users and unique canaries are created; likely real data is rejected or challenged |
| journey-authoring.feature | Named teacher and student journeys link rules, fields, checkpoints, and visibility |
| baseline-observation.feature | Named tests complete with all required checkpoints and no seeded conflict |
| witnessed-conflict.feature | Canary reaches a confirmed prohibited fixture destination and APPROVED becomes HOLD |
| repaired-rerun.feature | Prior conflict is not reobserved but HOLD remains |
| visibility-loss.feature | Required visibility is lost, retries remain frozen, and HOLD reason is visibility loss |
| ambiguity.feature | Unsupported transform or unknown destination produces NEEDS_REVIEW |
| human-restoration.feature | Authorized person reviews history and signs a restore decision |
| prompt-injection.feature | Page instructions cannot expand scope, disclose secrets, or trigger a consequential action |
| failure-recovery.feature | Model refusal, invalid schema, CAPTCHA, capture loss, timeout, and integrity failure stay bounded |

The final causal-spine scenario must use live GPT-5.6 against the controlled fixture at least once; deterministic CI replays remain the reliable regression gate.

## 5. Task index and dependency graph

| Task | Priority | Depends on | Primary output | Status |
| --- | --- | --- | --- | --- |
| FND-01 | P0 | — | TypeScript workspace and deterministic CI | COMPLETE |
| FND-02 | P0 | FND-01 | Verification/evidence harness | COMPLETE |
| FND-03 | P0 | FND-01, FND-02 | Domain schemas, state machines, migrations | COMPLETE |
| AUT-01 | P0 | FND-03 | Workspace roles and authorization | COMPLETE |
| AUT-02 | P0 | AUT-01, FND-03 | Software inventory and approval provenance | COMPLETE |
| AUT-03 | P0 | AUT-01, FND-03 | Test authorization and action policy | COMPLETE |
| AUT-04 | P0 | AUT-03 | Secret isolation and redaction | COMPLETE |
| AGR-01 | P0 | AUT-01, FND-03 | Immutable agreement intake | COMPLETE |
| AGR-02 | P0 | AGR-01, FND-02 | GPT-5.6 structured proposals | COMPLETE |
| AGR-03 | P0 + P1 follow-on | AGR-01, AGR-02, AUT-01 | Human review and requirement versions | COMPLETE (P0) |
| JRN-01 | P0 | AUT-01, AUT-04 | Fictional personas and canaries | COMPLETE |
| JRN-02 | P0 | AGR-03, JRN-01 | Named journey editor | NOT STARTED |
| FIX-01 | P0 | FND-01, FND-03 | Controlled classroom fixture | COMPLETE |
| JRN-03 | P0 | JRN-02, FIX-01 | Deterministic replay baseline | NOT STARTED |
| RUN-01 | P0 | AUT-03, AUT-04, FIX-01 | Isolated browser runner | NOT STARTED |
| RUN-02 | P0 + P1 follow-on | RUN-01, JRN-01 | Deterministic recorder and visibility | NOT STARTED |
| RUN-03 | P0 | RUN-01, AUT-03, AUT-04, FIX-01 | Policy-bounded GPT-5.6 computer use | NOT STARTED |
| RUN-04 | P0 | RUN-03, JRN-02, JRN-03 | Model-assisted journey repair | NOT STARTED |
| RUN-05 | P0 | FND-03, RUN-01, RUN-02 | Run orchestration and manifests | NOT STARTED |
| DET-01 | P0 | AGR-03, RUN-02 | Human-confirmed destination registry | NOT STARTED |
| DET-02 | P0 | JRN-01, RUN-02 | Deterministic canary matcher | NOT STARTED |
| DET-03 | P0 | AGR-03, DET-01, DET-02, RUN-05 | Bounded finding evaluator | NOT STARTED |
| DET-04 | P0 | DET-03, AGR-01, RUN-05 | Verifiable evidence receipts | NOT STARTED |
| DET-05 | P0 + P1 follow-on | AUT-02, DET-03, DET-04 | Hold, human restore, and approval audit | NOT STARTED |
| UX-01 | P0 | AUT-02, AUT-03, FND-03, AGR-01, JRN-01 | Inventory and setup experience | NOT STARTED |
| UX-02 | P0 | AGR-03, JRN-02, UX-01 | Agreement and journey review | NOT STARTED |
| UX-03 | P0 | RUN-05, DET-04, DET-05, UX-01 | Run, finding, receipt, and hold experience | NOT STARTED |
| QLT-01 | P0 | UX-01, UX-02, UX-03, RUN-05 | Quality and observability gates | NOT STARTED |
| SEC-01 | P0 | AUT-04, RUN-03, DET-05, UX-03 | Security and privacy threat suite | NOT STARTED |
| VAL-01 | P0 | FIX-01, DET-05, SEC-01 | Blinded mechanism corpus | NOT STARTED |
| VAL-02 | P0 claim gate | JRN-03, RUN-03, RUN-04, VAL-01 | Model-ablation decision | NOT STARTED |
| VAL-03 | P0 claim gate | UX-03, VAL-01 | Workflow and comprehension validation | NOT STARTED |
| DOC-01 | P0 | QLT-01, SEC-01, implemented P0 tasks | Productization documentation and visuals | NOT STARTED |
| DEMO-01 | P0 | UX-03, VAL-01, VAL-02, SEC-01, DOC-01 | Three-minute causal proof | NOT STARTED |
| REL-01 | P0 | All P0 tasks and validation dispositions | Final traceability and release decision | NOT STARTED |

Use **COMPLETE (P0)** when a package's required first-release work passes while a named P1 follow-on remains **DEFERRED**. This preserves an honest P0 release gate without making the P1 requirement appear complete.

~~~mermaid
flowchart TD
    FND["FND-01..03 Foundations"] --> AUTH["AUT-01..04 Authority and inventory"]
    FND --> AGR["AGR-01..03 Agreement"]
    FND --> FIX["FIX-01 Controlled fixture"]
    AUTH --> JRN["JRN-01..03 Synthetic journeys"]
    AGR --> JRN
    FIX --> RUN["RUN-01..05 Browser execution"]
    AUTH --> RUN
    JRN --> RUN
    RUN --> DET["DET-01..05 Deterministic evidence and authority"]
    AGR --> DET
    DET --> UX["UX-01..03 Product experience"]
    AUTH --> UX
    UX --> QLT["QLT-01 Quality and observability"]
    UX --> SEC["SEC-01 Threat suite"]
    DET --> VAL1["VAL-01 Mechanism corpus"]
    SEC --> VAL1
    VAL1 --> VAL2["VAL-02 Model ablation"]
    UX --> VAL3["VAL-03 Workflow validation"]
    QLT --> DOC["DOC-01 Productization evidence"]
    VAL2 --> DEMO["DEMO-01 Three-minute proof"]
    DOC --> DEMO
    DEMO --> REL["REL-01 Final release gate"]
    VAL3 --> REL
~~~

## 6. Implementation tasks

All tasks begin **NOT STARTED**. The PR that starts a task changes its state to **IN PROGRESS**; only a passing evidence bundle changes it to **COMPLETE**.

### Foundations

#### FND-01 — Bootstrap the TypeScript workspace and deterministic CI

- **Status:** COMPLETE — local acceptance and clean-checkout Linux and Windows CI are green.
- **Deliver:** pnpm workspace containing apps/web, apps/runner, apps/fixture, packages/core, packages/evidence, and packages/testkit; strict TypeScript; linting; build graph; database and object-store test services; canonical scripts; CI.
- **PRD:** Sections 8, 13, 21, and 22.
- **Depends on:** none.
- **Red first:** repository smoke test fails because the declared packages, scripts, and isolated test services do not exist.
- **Tests:** clean-checkout install, lint, typecheck, build, unit smoke, database migration smoke.
- **Property/BDD:** no property or BDD requirement; configuration matrix tests cover supported Node and packaged Chromium versions.
- **Evidence:** [FND-01 verification evidence](evidence/FND-01/README.md). Visual UI proof is not applicable.
- **Complete when:** every deterministic canonical command exists, CI blocks failure, lockfile is committed, and setup is reproducible from a clean checkout.

#### FND-02 — Build the verification and evidence harness

- **Status:** COMPLETE — local acceptance, clean-checkout Linux and Windows CI, and uploaded traceability artifacts are green.
- **Deliver:** verification manifest JSON Schema, task evidence collector, artifact directory conventions, screenshot metadata validator, and traceability checker.
- **PRD:** Sections 19, 21, 22, and 26.
- **Depends on:** FND-01.
- **Red first:** schema tests reject an intentionally incomplete manifest and traceability check reports orphan FR-001.
- **Tests:** manifest unit tests, schema integration, artifact sanitization checks, broken-link detection, orphan detection.
- **Property:** generated manifests accept exactly valid required-field combinations; arbitrary missing or contradictory fields are rejected.
- **BDD:** not applicable.
- **Evidence:** [FND-02 verification evidence](evidence/FND-02/README.md) and its machine-readable manifest. Visual proof is not applicable.
- **Complete when:** CI fails on missing required evidence, bad metadata, broken curated evidence links, or orphan traceability.

#### FND-03 — Implement core domain schemas, state machines, and data boundaries

- **Status:** COMPLETE — focused and full local verification plus clean-checkout Ubuntu and Windows CI are green.
- **Deliver:** shared schemas and reducers for workspaces, roles, software, authorization, agreements, requirements, personas, canaries, journeys, runs, observations, findings, receipts, approval events, and human decisions; initial migrations.
- **PRD:** Sections 6, 10, 14, 15, and 23.
- **Depends on:** FND-01 and FND-02.
- **Red first:** invalid state transitions and cross-workspace references are accepted by the empty domain layer.
- **Tests:** schema, migration, reducer, serialization, and referential-integrity tests.
- **Properties:** PROP-01, PROP-02, PROP-05, PROP-11, PROP-12, PROP-18, and PROP-19.
- **BDD:** state vocabulary is exercised later through user flows.
- **Evidence:** [FND-03 verification evidence](evidence/FND-03/README.md), including the generated state-transition diagram and migration report.
- **Complete when:** impossible states are unrepresentable or rejected, every transition has actor provenance, and domain events round-trip without semantic loss.

### Authority, inventory, and secrets

#### AUT-01 — Implement workspace roles and server-side authorization

- **Deliver:** workspace creation, privacy-officer/test-operator/reviewer roles, server-side permission checks, and role audit events.
- **PRD:** FR-001; Sections 5, 14, and 15.
- **Depends on:** FND-03.
- **Red first:** an operator can perform a privacy-officer action and workspace A can read workspace B.
- **Tests:** permission matrix unit tests and cross-tenant integration tests.
- **Properties:** PROP-11 and PROP-12.
- **BDD:** workspace-access.feature.
- **Evidence:** allowed and denied UI screenshots using fictional users.
- **Complete when:** every restricted route, action, and export is server-authorized and all denial cases remain auditable without leaking record existence.

#### AUT-02 — Implement software inventory and approval provenance

- **Deliver:** software record, tenant URL, vendor, owner, known version, imported approval state, and immutable provenance.
- **PRD:** FR-002 and FR-006; Sections 10.1 and 12.1.
- **Depends on:** AUT-01 and FND-03.
- **Red first:** an imported APPROVED record lacks its human/external actor or is presented as Pactwire's conclusion.
- **Tests:** repository, API, approval-origin, and list/filter integration tests.
- **Properties:** PROP-01, PROP-02, and PROP-11.
- **BDD:** software-inventory.feature.
- **Evidence:** inventory screenshot showing status, source, owner, agreement version, and bounded latest-run language.
- **Complete when:** every approval state identifies who or what set it and no automated source can masquerade as human approval.

#### AUT-03 — Implement authorization, allowlists, and action policy

- **Deliver:** authorization basis, attestation, review/expiry date, allowed domains/actions, prohibited actions, redirect/popup policy, revocation, and run-queue gate.
- **PRD:** FR-003 and FR-004; Sections 9.1 and 16.
- **Depends on:** AUT-01 and FND-03.
- **Red first:** expired authorization queues a run and an unlisted redirect is followed.
- **Tests:** policy unit tests, API integration, redirect/popup/browser negative tests.
- **Properties:** PROP-13 and PROP-14.
- **BDD:** authorization.feature.
- **Evidence:** authorization setup and blocked-domain/action screenshots.
- **Complete when:** denial is enforced beneath the model and every blocked attempt records a bounded reason.

#### AUT-04 — Implement secret isolation and evidence redaction

- **Deliver:** encrypted secret storage, harness injection, short-lived sessions, structured redaction, screenshot masking, export redaction, and access audit.
- **PRD:** FR-005 and FR-032; Sections 16 and 17.
- **Depends on:** AUT-03.
- **Red first:** seeded passwords, tokens, cookies, or encoded variants appear in logs, prompts, screenshots, or exports.
- **Tests:** redaction unit tests, integration with logs/receipts/screenshots, secret-scanner regression.
- **Properties:** PROP-15 and PROP-20.
- **BDD:** prompt-injection.feature includes an attempted secret disclosure.
- **Evidence:** sanitized before/after redaction sample and denied raw-access state.
- **Complete when:** the security corpus finds no configured secret representation in normal outputs and authorized raw access is isolated and audited.

### Agreement intake and human confirmation

#### AGR-01 — Store, hash, and version agreement inputs

- **Deliver:** PDF/text upload, original bytes, source page map, effective dates, uploader/time, immutable version, and SHA-256 hash.
- **PRD:** FR-010; Sections 9 and 14.
- **Depends on:** AUT-01 and FND-03.
- **Red first:** changing one source byte does not create a different immutable version or hash.
- **Tests:** upload/API/storage tests, PDF/text fixtures, duplicate and corruption cases.
- **Properties:** identical canonical bytes produce the same content hash; any byte change changes verification; stored versions never mutate.
- **BDD:** agreement-intake.feature.
- **Evidence:** upload and source-document viewer screenshots using the fictional DPA.
- **Complete when:** the original source and page citations can be independently verified from storage without model output.

#### AGR-02 — Integrate GPT-5.6 structured requirement proposals

- **Status:** COMPLETE — deterministic gates, source-bound browser evidence, and the real GPT-5.6 Sol fictional-PDF contract pass at source commit `694060df2ea0f6b24a3a67df88ee3172ae4c81a1`.
- **Deliver:** OpenAI Responses adapter, PDF input handling, validated structured schema, exact citation locator, refusal/incomplete/invalid-output handling, cost and model logging, deterministic fake adapter, and opt-in live contract test.
- **PRD:** FR-011; Sections 3, 15, and 17.
- **Depends on:** AGR-01 and FND-02.
- **Red first:** an invalid schema, missing citation, refusal, or unrelated file creates a proposal.
- **Tests:** adapter contract tests for every response type; citation round-trip; live GPT-5.6 test against the fictional DPA.
- **Property:** invalid, incomplete, uncited, or refused outputs never become valid proposals.
- **BDD:** agreement-intake.feature covers successful proposal and safe model failure.
- **Evidence:** proposal and safe-error screenshots; sanitized live-contract manifest.
- **Complete when:** every accepted proposal maps to an exact source span and every unsupported response stays visibly non-executable.

#### AGR-03 — Implement human requirement review, ambiguity, versioning, and comparison

- **Status:** COMPLETE (P0) — source-bound human confirmation, ambiguity, rejection, immutable versions, browser evidence, and clean-checkout Ubuntu/Windows CI pass at implementation commit `a1566dbd1fdf1da4a60c9f443b3219ce74d3158a`. FR-015 remains DEFERRED (P1) until the changed-span and affected-journey acceptance gate passes.
- **Deliver:** side-by-side source review; confirm/edit/reject/ambiguous actions; executable flag; author/reason/time; immutable revisions. P1 adds changed-span comparison and affected-journey re-review.
- **PRD:** FR-012, FR-013, FR-014, and FR-015; Sections 12.3 and 15.
- **Depends on:** AGR-01, AGR-02, and AUT-01.
- **Red first:** an unconfirmed proposal queues a rule or an edit rewrites a prior confirmed version.
- **Tests:** reducer/API/storage tests; confirmation permission matrix; citation persistence.
- **Properties:** PROP-10 and PROP-17.
- **BDD:** requirement-review.feature.
- **Evidence:** confirm, ambiguous, rejected, and version-history screenshots.
- **Complete when:** P0 confirmation/version invariants pass. FR-015 remains explicitly deferred until its comparison scenario and evidence pass.

### Synthetic journeys and controlled fixture

#### JRN-01 — Implement fictional personas and run-specific canaries

- **Deliver:** isolated teacher/student personas, likely-real-data warning, reserved email domains, per-run field canaries, source mapping, and non-reuse enforcement.
- **PRD:** FR-020 and FR-021; Sections 6, 9, and 16.
- **Depends on:** AUT-01 and AUT-04.
- **Red first:** generated accounts use routable addresses, canaries collide, or a canary lacks one source field.
- **Tests:** persona validation, generator unit tests, database uniqueness, likely-real-input cases.
- **Properties:** PROP-16 across large generated run and workspace sets.
- **BDD:** synthetic-personas.feature.
- **Evidence:** persona configuration screenshot containing obviously fictional data.
- **Complete when:** generated identities are isolated, non-routable, unique, traceable, and absent from unrelated runs.

#### JRN-02 — Implement named journey schema and editor

- **Deliver:** role, goal, start state, linked requirement, test fields, allowed/prohibited actions, checkpoints, required visibility, steps, and immutable versions.
- **PRD:** FR-022; Sections 9 and 12.4.
- **Depends on:** AGR-03 and JRN-01.
- **Red first:** a journey without a confirmed requirement, authorization, role, or required checkpoint is runnable.
- **Tests:** schema/reducer/API/component tests and version persistence.
- **Property:** runnable journeys always reference current immutable prerequisites and cannot mutate a historical run.
- **BDD:** journey-authoring.feature.
- **Evidence:** teacher and student journey editor screenshots.
- **Complete when:** every runnable journey has an inspectable causal link from agreement rule through synthetic field to checkpoint.

#### FIX-01 — Build the controlled classroom fixture

- **Status:** COMPLETE — all nine deterministic modes, independent hidden oracle, exact fictional DPA, real reserved-host browser traffic, seeded properties, BDD stories, optimized-production visual evidence, and Ubuntu/Windows verification passed at implementation commit `6c9657f3fadb1721a6816327b6d30eb94fafc4ae`.
- **Deliver:** fictional teacher/student app and DPA with baseline, regression, repaired, ambiguous, invisible, interface-drift, prompt-injection, risky-action, and failure modes.
- **PRD:** Section 18.
- **Depends on:** FND-01 and FND-03.
- **Red first:** fixture contract tests cannot distinguish the declared versions and seeded events.
- **Tests:** fixture unit/API/browser tests and a hidden ground-truth manifest unavailable to the application evaluator.
- **Properties:** PROP-23 and PROP-24; version switches alter only the declared seeded behavior, and generated fixture cases remain reproducible from a seed.
- **BDD:** baseline-observation, witnessed-conflict, repaired-rerun, visibility-loss, ambiguity, prompt-injection, and failure-recovery features.
- **Evidence:** screenshots of each visible version/state and a fixture behavior map.
- **Complete when:** every P0 positive, negative, ambiguity, visibility, and safety scenario has independent fixture ground truth.

#### JRN-03 — Implement deterministic recording/replay and the non-model baseline

- **Deliver:** stable replay format, checkpoint assertions, variable canary injection, replay outcome, drift detection, and human-authored baseline arm.
- **PRD:** FR-024 and FR-027; Sections 3 and 19.2.
- **Depends on:** JRN-02 and FIX-01.
- **Red first:** replay silently succeeds after a required fixture checkpoint moves or disappears.
- **Tests:** replay unit/integration/browser tests across baseline and drifted fixture.
- **Properties:** retries and replays preserve frozen scope; a missing checkpoint cannot become success.
- **BDD:** baseline-observation.feature and failure-recovery.feature.
- **Evidence:** deterministic trace and browser recording of baseline and drift failure.
- **Complete when:** the baseline can be run with the same recorder and scoring layer used by GPT-5.6.

### Browser execution and model operation

#### RUN-01 — Implement isolated browser execution

- **Deliver:** per-run Chromium context or container, clean storage, controlled downloads/clipboard, network egress policy, lifecycle cleanup, and crash handling.
- **PRD:** FR-030; Sections 13, 16, and 17.
- **Depends on:** AUT-03, AUT-04, and FIX-01.
- **Red first:** two sequential runs can observe each other's cookie or local-storage canary.
- **Tests:** browser isolation, process cleanup, egress, crash, and concurrency integration tests.
- **Properties:** PROP-20 under generated run order and concurrency.
- **BDD:** authorization.feature and failure-recovery.feature.
- **Evidence:** isolation test report and short trace; UI screenshot only if a visible isolation error is added.
- **Complete when:** no browser state, credential, download, or clipboard value crosses run/workspace boundaries.

#### RUN-02 — Implement deterministic recorder and visibility detection

- **Deliver:** action times, page URLs, screenshots, request method/URL/host, initiator when available, authorized request fields, response metadata, storage changes, capture-gap events, and recorder versioning. P1 adds separately labeled proxy capture.
- **PRD:** FR-031, FR-035, and FR-038; Sections 13 and 17.
- **Depends on:** RUN-01 and JRN-01.
- **Red first:** a seeded network request is missed or a forced capture gap is classified as clean.
- **Tests:** CDP/network/storage integration, ordering, capture failure, service-worker, and encrypted/uninspectable cases.
- **Properties:** observed event order and canonicalization are deterministic; required capture loss always yields NOT_VISIBLE.
- **BDD:** baseline-observation.feature and visibility-loss.feature.
- **Evidence:** browser trace paired with recorder events and capture-loss screenshot.
- **Complete when:** P0 capture and visibility cases pass independently of model output. FR-038 remains deferred until proxy-mode tests and labels pass.

#### RUN-03 — Integrate GPT-5.6 computer use with policy enforcement

- **Deliver:** Responses computer-use loop, screenshot/action exchange, scoped instruction, action summaries, stop/handoff states, lower-layer allowlist checks, and deterministic action adapter for CI.
- **PRD:** FR-023, FR-026, and FR-036; Sections 3, 15, and 16.
- **Depends on:** RUN-01, AUT-03, AUT-04, and FIX-01.
- **Red first:** on-screen instructions can expand the domain scope, request a secret, or perform a prohibited fixture action.
- **Tests:** action translation contract, blocked actions, popup/redirect, refusal/timeout, and opt-in live GPT-5.6 fixture run.
- **Properties:** page content cannot mutate authorization, rules, destination status, evidence, or approval.
- **BDD:** prompt-injection.feature and authorization.feature.
- **Evidence:** sanitized live browser recording, action summaries, recorder events, and blocked-action screenshots.
- **Complete when:** GPT-5.6 completes the named authorized journey and every adversarial scope-expansion attempt is stopped beneath the model.

#### RUN-04 — Implement model-assisted journey repair

- **Deliver:** drift diagnosis, bounded repair attempt, checkpoint verification, draft repair version, human review for scope change, and deterministic replay promotion.
- **PRD:** FR-025; Sections 3 and 12.4.
- **Depends on:** RUN-03, JRN-02, and JRN-03.
- **Red first:** a visually plausible repaired path is promoted despite missing the original checkpoint.
- **Tests:** repair adapter contract, drift fixture browser tests, checkpoint equivalence, and promotion permissions.
- **Property:** no repair can broaden authorization or become active without satisfying the frozen checkpoint contract.
- **BDD:** failure-recovery.feature includes successful bounded repair and unresolved drift.
- **Evidence:** before/after drift recording, draft diff, and checkpoint verification screenshot.
- **Complete when:** live GPT-5.6 repairs at least one seeded layout change while an unrepairable change stays partial or not tested.

#### RUN-05 — Implement run orchestration, retries, manifests, and recovery

- **Deliver:** queue, worker lease, immutable run snapshot, state transitions, retry lineage, cancellation, terminal manifests, partial/failed handling, and integrity failures.
- **PRD:** FR-037; Sections 10.2 and 17.
- **Depends on:** FND-03, RUN-01, and RUN-02.
- **Red first:** a retry changes its source configuration or a crashed run appears COMPLETED without a manifest.
- **Tests:** reducer, queue integration, crash/retry/cancel, idempotency, and manifest finalization.
- **Properties:** PROP-18, PROP-19, and PROP-22.
- **BDD:** failure-recovery.feature.
- **Evidence:** run-history screenshots and manifest comparison for complete, partial, failed, and retried runs.
- **Complete when:** every terminal state is explainable, immutable, and safely resumable or rerunnable.

### Deterministic findings, receipts, and authority

#### DET-01 — Implement the human-confirmed destination registry

- **Deliver:** domain facts, entity identity, source evidence, approval classification, reviewer/time, immutable versions, and UNKNOWN default.
- **PRD:** FR-034; Sections 6, 15, and 16.
- **Depends on:** AGR-03 and RUN-02.
- **Red first:** an unseen domain is automatically assigned a company or agreement status.
- **Tests:** registry/API/versioning tests and unknown-domain cases.
- **Property:** PROP-04.
- **BDD:** ambiguity.feature and requirement-review.feature.
- **Evidence:** known, prohibited, and unknown destination screenshots.
- **Complete when:** no recipient finding can outrun the human-confirmed domain-to-entity evidence.

#### DET-02 — Implement deterministic canary matching

- **Deliver:** exact, URL-encoded, and Base64 matchers; field/run/source lineage; unsupported-transform result; collision handling.
- **PRD:** FR-033; Sections 6 and 15.
- **Depends on:** JRN-01 and RUN-02.
- **Red first:** semantic similarity or an unsupported transformation produces a positive match.
- **Tests:** example unit tests and large generated string/body/header/query corpus.
- **Properties:** PROP-06 and no false positive for arbitrary non-canary payloads within the declared generator domain.
- **BDD:** ambiguity.feature.
- **Evidence:** machine-readable matcher report; visual evidence is not applicable.
- **Complete when:** every accepted match is reproducible without a model and every unsupported case stays ambiguous.

#### DET-03 — Implement bounded finding evaluation

- **Deliver:** deterministic rule evaluator, finding states, named-scope language, visible/untested checkpoints, model-explanation separation, and reason codes.
- **PRD:** FR-040, FR-041, and FR-046; Sections 10.3 and 15.
- **Depends on:** AGR-03, DET-01, DET-02, and RUN-05.
- **Red first:** unknown destination, missing checkpoint, unsupported transform, or model assertion creates WITNESSED_CONFLICT or a clean result.
- **Tests:** decision-table unit tests and fixture integration for every state.
- **Properties:** PROP-04, PROP-05, PROP-07, and PROP-21.
- **BDD:** baseline-observation, witnessed-conflict, repaired-rerun, visibility-loss, and ambiguity features.
- **Evidence:** finding-state matrix screenshot and machine-readable decision table.
- **Complete when:** every possible input class has one bounded result and prohibited “pass/safe/compliant” labels fail copy tests.

#### DET-04 — Implement evidence receipts, export, and superseding corrections

- **Deliver:** content-addressed receipt, agreement/request/canary/destination/screenshot/action/configuration lineage, sanitized export, independent verifier, and correction links.
- **PRD:** FR-042, FR-043, FR-044, and FR-045; Sections 12.6 and 14.
- **Depends on:** DET-03, AGR-01, and RUN-05.
- **Red first:** changing an artifact preserves verification or a correction mutates the original receipt.
- **Tests:** canonicalization, hash, export/import, verifier, authorization, correction, and corruption tests.
- **Properties:** PROP-08, PROP-09, and PROP-10.
- **BDD:** witnessed-conflict.feature and failure-recovery.feature.
- **Evidence:** receipt-detail screenshot, exported sanitized bundle, and successful/failed verifier reports.
- **Complete when:** an independent process can recompute every hash and detect any mutation.

#### DET-05 — Implement hold, human restoration, approval audit, and P1 notifications

- **Deliver:** idempotent witnessed-conflict hold; retry-gated visibility-loss hold with distinct reason; append-only history; human restore/reject/retire decision; P1 bounded webhooks.
- **PRD:** FR-050, FR-051, FR-052, FR-053, FR-054, FR-055, and FR-056; Sections 10.1 and 12.7.
- **Depends on:** AUT-02, DET-03, and DET-04.
- **Red first:** a clean rerun restores APPROVED, an automated event enters APPROVED, or retrying a receipt creates duplicate holds.
- **Tests:** state reducer, API authorization, database transaction/idempotency, concurrency, and webhook copy tests.
- **Properties:** PROP-01, PROP-02, PROP-03, and PROP-11.
- **BDD:** witnessed-conflict, repaired-rerun, visibility-loss, and human-restoration features.
- **Evidence:** APPROVED-before, HOLD-after, still-HOLD-after-repair, and human-restore screenshots tied to the same fictional record.
- **Complete when:** all P0 authority invariants pass under generated concurrent event sequences. FR-056 remains deferred until notification delivery and bounded-language evidence pass.

### Product experience

#### UX-01 — Build the product shell, inventory, and setup workflow

- **Deliver:** accessible navigation, software inventory, status provenance, six-step setup, resumable drafts, authorization blockers, empty/loading/error states, desktop and narrow layouts.
- **PRD:** Sections 5, 9, 12.1, and 12.2.
- **Depends on:** AUT-02, AUT-03, FND-03, AGR-01, and JRN-01.
- **Red first:** Playwright user cannot create and resume an authorized fictional software setup.
- **Tests:** component, API integration, keyboard, automated accessibility, and browser BDD.
- **Property:** displayed status always derives from a stored provenance event, never a model summary.
- **BDD:** software-inventory.feature and authorization.feature.
- **Evidence:** desktop/narrow inventory, each setup step, blocked prerequisite, and recovery screenshots.
- **Complete when:** a new user reaches a run-ready configuration without hidden prerequisites or misleading green state.

#### UX-02 — Build agreement and journey review experiences

- **Deliver:** source/proposal split view, citation navigation, confirm/edit/reject/ambiguous controls, version history, persona setup, journey editor, checkpoint and visibility controls, replay/repair history.
- **PRD:** Sections 12.3 and 12.4.
- **Depends on:** AGR-03, JRN-02, and UX-01.
- **Red first:** browser scenario can confirm a requirement without seeing its source or create a runnable journey without checkpoints.
- **Tests:** component, keyboard, citation navigation, role authorization, BDD, and accessibility.
- **Property:** UI actions cannot bypass executable-rule or runnable-journey domain invariants.
- **BDD:** requirement-review, synthetic-personas, and journey-authoring features.
- **Evidence:** desktop/narrow and keyboard-focus screenshots for confirm, ambiguity, and journey configuration.
- **Complete when:** users can explain the difference between model proposal, human-confirmed rule, and observed fact from the interface.

#### UX-03 — Build run, finding, receipt, hold, and recovery experiences

- **Deliver:** live run view, model-action/recorder separation, checkpoint coverage, stop control, finding hierarchy, receipt inspection/export, hold review/history, recovery and integrity states.
- **PRD:** Sections 12.5, 12.6, 12.7, and 17.
- **Depends on:** RUN-05, DET-04, DET-05, and UX-01.
- **Red first:** a witnessed conflict can be displayed without tested scope, receipt evidence, or next human action.
- **Tests:** component, BDD browser, accessibility, visual regression, and copy-boundary tests.
- **Properties:** finding labels and actions remain consistent with the deterministic state and authority.
- **BDD:** all outcome and recovery features.
- **Evidence:** every finding state, receipt detail, before/after hold, human decision, partial, failed, and integrity-error screenshots plus the causal-spine video.
- **Complete when:** a reviewer can inspect the evidence and make a bounded decision without reading model prose.

### Quality, security, validation, and release

#### QLT-01 — Add analytics, observability, reliability, accessibility, performance, and compatibility gates

- **Deliver:** privacy-safe analytics events, structured logs by responsibility lane, costs/latency/retries/capture gaps, service health, WCAG 2.2 AA automation/manual checklist, performance budgets, packaged Chromium matrix, and reliability soak tests.
- **PRD:** Sections 20 and 21.
- **Depends on:** UX-01, UX-02, UX-03, and RUN-05.
- **Red first:** guardrail event contains raw request data; a state relies on color alone; console p95 exceeds the declared budget in the test profile.
- **Tests:** analytics schema, log redaction, a11y, performance, load, crash, retry, and compatibility.
- **Properties:** analytics never include configured secrets or raw student-like values; retries preserve idempotency under load.
- **BDD:** critical paths run with keyboard-only and screen-reader assertions.
- **Evidence:** accessibility, performance, compatibility, and soak reports with representative UI screenshots.
- **Complete when:** all PRD quality thresholds pass or a changed PRD records an honest revised threshold before implementation claims success.

#### SEC-01 — Execute the security, privacy, and prompt-injection threat suite

- **Deliver:** executable cases for real-data entry, prompt injection, credential leakage, egress, harmful actions, cross-workspace access, tampering, false attribution, incomplete capture, publication permission, and retention/deletion.
- **PRD:** Section 16 and the security cases in Section 17.
- **Depends on:** AUT-04, RUN-03, DET-05, and UX-03.
- **Red first:** each control begins with a seeded attack that succeeds or is not detected before the control is added.
- **Tests:** negative unit/integration/browser tests, adversarial fixture, dependency and secret scans.
- **Properties:** PROP-04, PROP-09, PROP-12, PROP-13, PROP-15, and PROP-20.
- **BDD:** prompt-injection.feature, authorization.feature, and failure-recovery.feature.
- **Evidence:** blocked-action and safe-recovery screenshots, sanitized traces, threat matrix, and zero-secret scan.
- **Complete when:** every PRD threat has a passing test and residual risk; no high-severity boundary is waived for the demo.

#### VAL-01 — Build and run the blinded mechanism-correctness corpus

- **Deliver:** at least 100 reproducible cases with at least 40 instrumentable conflicts, required transform/destination/visibility/drift/injection classes, hidden ground truth, scorer, confidence intervals, and error analysis.
- **PRD:** Section 19.1.
- **Depends on:** FIX-01, DET-05, and SEC-01.
- **Red first:** scorer fails known confusion-matrix fixtures and corpus coverage checker reports missing case classes.
- **Tests:** scorer unit/property tests, corpus schema, blindness checks, full controlled run.
- **Property:** generated cases reproduce by seed and cannot expose ground truth to the evaluated path.
- **BDD:** the core outcome features are sampled as end-to-end corpus cases.
- **Evidence:** machine-readable results, confusion matrix, precision/recall chart, error table, hash verification, and limitations.
- **Complete when:** thresholds are met with denominators and confidence intervals, or the task records failure and blocks the corresponding claim.

#### VAL-02 — Run the manual, deterministic, and GPT-5.6 ablation

- **Deliver:** frozen tasks, shared recorder/scorer, three arms, blinded evaluation, expert-time capture, cost, retries, coverage, precision/recall, and decision report.
- **PRD:** Section 19.2 and the model-native claim in Section 3.
- **Depends on:** JRN-03, RUN-03, RUN-04, and VAL-01.
- **Red first:** analysis fixture catches unequal inputs, recorder versions, or hidden-ground-truth exposure between arms.
- **Tests:** experiment-integrity checks and metric recomputation from raw logs.
- **Property:** arm labels cannot change scoring; identical evidence scores identically.
- **BDD:** live GPT-5.6 executes the same named journeys used by deterministic replay.
- **Evidence:** coverage-per-expert-hour and authoring/repair-time charts, raw result table, model ID, source commit, and failure cases.
- **Complete when:** GPT-5.6 reaches the PRD thresholds. If deterministic replay matches it, this task completes as a failed thesis and REL-01 blocks or repositions the product.

#### VAL-03 — Validate workflow usefulness and claim comprehension

- **Deliver:** consented task protocol, synthetic fixture script, comprehension rubric, participant data-minimization plan, analysis, and claim decision.
- **PRD:** Sections 4, 5, 19.3, and 19.4.
- **Depends on:** UX-03 and VAL-01.
- **Red first:** rubric fixtures fail to distinguish dangerous “clean means compliant” answers from bounded interpretations.
- **Tests:** protocol dry run, scoring agreement check, and analysis reproducibility.
- **Property/BDD:** product BDD scenarios are the participant tasks; scoring is calibrated by human review rather than model self-grading.
- **Evidence:** anonymized aggregate report and approved screenshots only; no participant recording without explicit consent.
- **Complete when:** qualified reviews meet the comprehension target. If access is unavailable, the task remains unvalidated and every public claim must say so; a synthetic proxy cannot pass this gate.

#### DOC-01 — Productize setup, architecture, limitations, security, provenance, and visual documentation

- **Deliver:** five-minute setup, working sample path, architecture tied to code, limitations, security/privacy, sample data, OpenAI/Codex contribution, evaluation commands, evidence catalog, provenance, license decision record, and support guidance.
- **PRD:** Sections 13, 16, 22, 24, 25, and 26.
- **Depends on:** QLT-01, SEC-01, and the implemented P0 tasks.
- **Red first:** documentation checks detect a command that does not run, a broken evidence link, stale architecture component, missing provenance, or unsupported claim.
- **Tests:** clean-checkout documentation test, link/citation check, command smoke test, claim-lint, and evidence metadata validation.
- **Property/BDD:** not applicable beyond generated link/command cases; the sample path is executed as BDD.
- **Evidence:** real screenshots, current architecture diagram, sample receipt, verification reports, captions, and provenance.
- **Complete when:** a new reviewer can run and understand the controlled product without reconstructing missing steps.

#### DEMO-01 — Produce and verify the three-minute causal proof

- **Deliver:** public-ready video under three minutes, audio narration, transcript, shot list, fixture reset, deterministic receipt, real hold event, repaired rerun, uncertainty state, and OpenAI/Codex explanation.
- **PRD:** Sections 3, 18.4, and 22.
- **Depends on:** UX-03, VAL-01, VAL-02, SEC-01, and DOC-01.
- **Red first:** automated rehearsal fails when required beats are absent, exceed the duration, or use inconsistent fixture state.
- **Tests:** scripted demo smoke run, media duration/audio validation, link/access check, and transcript claim-lint.
- **BDD:** the final causal-spine scenario.
- **Evidence:** the video itself, transcript, source commit, fixture seed, receipt hash, screenshots, and rehearsal report.
- **Complete when:** one uninterrupted run proves input → model operation → deterministic observation → receipt → APPROVED to HOLD → repaired rerun remains HOLD → uncertainty stays visible.

#### REL-01 — Run final traceability and release gate

- **Deliver:** completed task graph, PRD section audit, FR/test/scenario/evidence matrix, P0 verification, P1 deferral list, risk register, known limitations, clean checkout, and truthful release/submission decision.
- **PRD:** Sections 8, 22, 23, 24, 25, and 26.
- **Depends on:** every P0 task, QLT-01, SEC-01, VAL-01, VAL-02, VAL-03 disposition, DOC-01, and DEMO-01.
- **Red first:** release checker reports at least one deliberately orphaned requirement and one missing evidence artifact.
- **Tests:** full deterministic verify, live GPT-5.6 contract, security, eval recomputation, documentation, packaged test path, and repository secret/data scan.
- **Properties:** the entire invariant catalog runs with recorded seeds and no quarantined counterexample.
- **BDD:** every P0 feature scenario passes against the packaged or hosted test path.
- **Evidence:** signed traceability report, CI and live-test results, final screenshot catalog, demo, and explicit unvalidated claims.
- **Complete when:** all P0 gates pass with zero skipped required checks. A failed model ablation, security boundary, evidence integrity check, or authority invariant blocks release; missing target-user access permits only the explicitly labeled controlled-mechanism claim.

## 7. Functional-requirement traceability

This table assigns every PRD functional requirement to one task package and its primary proof. Tests may cover additional requirements, but ownership remains singular.

| Requirement | Owner task | Primary proof |
| --- | --- | --- |
| FR-001 | AUT-01 | Permission matrix, cross-workspace property, access BDD |
| FR-002 | AUT-02 | Software repository/API tests and inventory BDD |
| FR-003 | AUT-03 | Expiry/revocation tests and authorization BDD |
| FR-004 | AUT-03 | Allowlist property and blocked browser actions |
| FR-005 | AUT-04 | Secret corpus and redaction evidence |
| FR-006 | AUT-02 | Approval-provenance invariant and UI |
| FR-010 | AGR-01 | Immutable source/hash tests and upload BDD |
| FR-011 | AGR-02 | Structured adapter/live contract and citations |
| FR-012 | AGR-03 | Unconfirmed-rule property and review BDD |
| FR-013 | AGR-03 | Version immutability tests and history UI |
| FR-014 | AGR-03 | Ambiguity tests and review BDD |
| FR-015 | AGR-03 P1 | Agreement-diff scenario and affected-journey evidence |
| FR-020 | JRN-01 | Fictional-persona validation and BDD |
| FR-021 | JRN-01 | Canary uniqueness/source property |
| FR-022 | JRN-02 | Journey schema/checkpoint tests and BDD |
| FR-023 | RUN-03 | Live computer-use run and action contract |
| FR-024 | JRN-03 | Deterministic replay and drift tests |
| FR-025 | RUN-04 | Live repair, checkpoint proof, and draft history |
| FR-026 | RUN-03 | Risk-stop browser suite |
| FR-027 | JRN-03 | Shared-recorder baseline run |
| FR-030 | RUN-01 | Cross-context isolation property |
| FR-031 | RUN-02 | Seeded request/storage capture integration |
| FR-032 | AUT-04 | Redaction property across every output surface |
| FR-033 | DET-02 | Generated matcher corpus |
| FR-034 | DET-01 | Unknown-destination property and registry BDD |
| FR-035 | RUN-02 | Forced capture-gap BDD and NOT_VISIBLE result |
| FR-036 | RUN-03 | Prompt-injection suite and blocked evidence |
| FR-037 | RUN-05 | Terminal-manifest property and recovery BDD |
| FR-038 | RUN-02 P1 | Proxy-mode labeling and minimization suite |
| FR-040 | DET-03 | Finding decision table and properties |
| FR-041 | DET-03 | Ambiguity BDD and unknown-input cases |
| FR-042 | DET-04 | Scope-complete receipt UI and tests |
| FR-043 | DET-04 | Content-addressed receipt verification |
| FR-044 | DET-04 | Independent export verifier |
| FR-045 | DET-04 | Superseding-correction property |
| FR-046 | DET-03 | Model-narrative separation tests |
| FR-050 | DET-05 | Witnessed-conflict hold BDD |
| FR-051 | DET-05 | Frozen retry and visibility-loss BDD |
| FR-052 | DET-05 | Automated-approval impossibility property |
| FR-053 | DET-05 | Repaired-rerun stays HOLD BDD |
| FR-054 | DET-05 | Human restoration permission and signature BDD |
| FR-055 | DET-05 | Append-only approval-history property |
| FR-056 | DET-05 P1 | Bounded webhook delivery/copy tests |

## 8. PRD section gates

Every PRD section is explicitly owned. REL-01 fails if any row lacks the listed proof or a truthful P1 deferral.

| PRD section | Owning tasks | Full-success proof |
| --- | --- | --- |
| 1. Product in one sentence | DOC-01, UX-01 | Product copy and screenshot describe the bounded problem plainly |
| 2. Problem | VAL-03, DOC-01 | Sources remain scoped; user review or explicit adoption-unvalidated label |
| 3. Product thesis | RUN-03, DET-03, DET-05, VAL-02, DEMO-01 | Live model operation, deterministic witness, real hold, and passing ablation |
| 4. Goals and outcomes | VAL-01, VAL-02, VAL-03, REL-01 | Every claimed outcome has a measured result or explicit non-claim |
| 5. Users and authority | AUT-01, AUT-02, DET-05, UX-01 | Role BDD, approval provenance, and authority UI |
| 6. Definitions | FND-03, DET-03, DOC-01 | Shared schema vocabulary and copy tests |
| 7. Product principles | AUT-04, RUN-03, DET-03, DET-05, SEC-01 | Boundary properties and adversarial suite |
| 8. First complete release | REL-01 | All P0 tasks pass; each P1 item passes or is visibly deferred |
| 9. End-to-end workflow | UX-01, UX-02, UX-03, DEMO-01 | Complete BDD causal spine and video |
| 10. State model | FND-03, RUN-05, DET-03, DET-05 | State-machine properties and state screenshots |
| 11. Functional requirements | FND-02 and all FR owner tasks | All 43 rows trace to passing proof or explicit P1 deferral |
| 12. Required product experience | UX-01, UX-02, UX-03 | Browser BDD, accessibility checks, desktop/narrow/error screenshots |
| 13. Reference architecture | FND-01, RUN-01, RUN-02, DOC-01 | Code-aligned architecture diagram and boundary tests |
| 14. Core data model | FND-03, DET-04 | Migrations, referential invariants, and receipt lineage |
| 15. Responsibility boundaries | AGR-03, RUN-03, DET-01, DET-03, DET-05 | Model/deterministic/human separation tests |
| 16. Security, privacy, and safety | AUT-04, RUN-01, RUN-03, SEC-01 | Threat matrix, negative tests, and sanitized visual proof |
| 17. Failure and recovery | RUN-04, RUN-05, UX-03, SEC-01 | Failure-recovery BDD and every bounded error screenshot |
| 18. Controlled fixture | FIX-01, DEMO-01 | Independent ground truth, all versions, and recorded causal spine |
| 19. Validation plan | VAL-01, VAL-02, VAL-03 | Reproducible reports, thresholds, error analysis, and honest disposition |
| 20. Product metrics | QLT-01, VAL-01, VAL-02 | Privacy-safe events and recomputable metric reports |
| 21. Quality requirements | QLT-01, SEC-01 | Reliability, a11y, performance, compatibility, and observability reports |
| 22. Definition of done | REL-01 | All twelve PRD completion clauses evidenced |
| 23. Fixed decisions | FND-02, DOC-01, REL-01 | Automated decision/claim drift check |
| 24. Open implementation decisions | DOC-01, REL-01 | Decision records or explicit unresolved/deferred status |
| 25. Principal risks | SEC-01, VAL-02, VAL-03, REL-01 | Each risk has evidence, mitigation, and residual status |
| 26. Evidence and capability sources | DOC-01 | Current official links, citations, and provenance audit |

## 9. Pull-request completion checklist

Every implementation PR must answer:

- Which single task package is advanced?
- Which PRD sections and FR IDs are affected?
- What test failed first, with what command and expected failure?
- What implementation made it pass?
- Which property invariants ran, with seed and count?
- Which BDD scenarios ran?
- Which integration and full-regression commands passed?
- Which tests were skipped, retried, flaky, or unavailable?
- Is visual evidence applicable? If yes, where is the captured proof? If no, why not?
- Does any claim exceed the evidence?
- What remains incomplete?

The repository pull-request template mirrors this checklist.

## 10. Planning definition of done

This breakdown is complete when:

1. all 35 task packages have dependencies, failing-first tests, completion criteria, and evidence obligations;
2. all 43 functional requirements have one owner;
3. all 26 PRD sections have a full-success gate;
4. property invariants cover the highest-risk state, evidence, isolation, and authority rules;
5. BDD scenarios cover the complete user journey and failure states;
6. visual evidence requirements distinguish real product proof from mockups;
7. P1 requirements are visible and cannot be mistaken for P0 completion;
8. OpenAI model effectiveness requires a live controlled test and independent ground truth;
9. unavailable target-user validation forces bounded claims rather than a synthetic pass; and
10. durable repository and pull-request instructions enforce this plan during implementation.

## 11. Official implementation references

- [OpenAI computer use guide](https://developers.openai.com/api/docs/guides/tools-computer-use)
- [OpenAI structured outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs)
- [OpenAI file inputs guide](https://developers.openai.com/api/docs/guides/file-inputs)
- [OpenAI evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices)
- [Pactwire PRD](PRD.md)
