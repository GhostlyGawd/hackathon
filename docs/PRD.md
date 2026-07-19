# Pactwire product requirements document

| Field | Value |
| --- | --- |
| Document status | Version 1 — approved direction and implementation specification |
| Product status | Idea-selection research complete; product implementation not yet started |
| Track | OpenAI Build Week — Education |
| Primary user | School district student-data privacy officer |
| Last updated | 2026-07-19 |
| Scope | First complete web-product release and controlled validation environment |

This document is the product source of truth for the first Pactwire build. The research archive explains how the direction was selected; this PRD defines what must be built, what the product may claim, and how its central claim will be tested.

Requirements marked **P0** are necessary for the first complete product. **P1** requirements are valuable extensions that must not block or weaken the P0 safety model.

## 1. Product in one sentence

> **Pactwire checks whether school websites and software collect more student information than the district allowed or send it to unapproved companies.**

In operational terms, Pactwire lets a district privacy officer replay approved, synthetic student and teacher activities after school software changes. If a deterministic recorder witnesses a data flow that conflicts with a human-confirmed requirement from the district's signed privacy agreement, Pactwire places the district's existing approval on hold for a person to review.

Pactwire does not certify safety, determine legal compliance, test every possible behavior, or approve software.

## 2. Problem

School districts approve websites and software used for lessons, homework, assessment, grading, communication, and administration. Those products may collect student names, email addresses, classwork, grades, device details, or other information.

Before approval, a vendor and district may sign a data-protection agreement describing:

- which student information the product may collect;
- why the product needs it;
- which outside companies may receive it; and
- what restrictions apply to its use or disclosure.

The agreement is a promise about behavior. The product can change after approval, its third-party services can change, and a district's tenant configuration can differ from a generic public test. District staff generally do not have a repeatable way to compare their own signed agreement with what authorized student and teacher activities cause the current product to transmit.

The result is a verification gap:

1. the district makes an approval decision from documents and representations;
2. the product or its configuration changes;
3. the original approval remains in force;
4. the district may not receive a concrete, replayable witness when tested behavior no longer matches a reviewed requirement.

The 2023–25 Utah State Board of Education, BYU, and Internet Safety Labs investigation demonstrates that this gap is real in the tested set. Investigators used synthetic accounts and authorized credentials, exercised real product journeys, captured network behavior, and compared observations with agreements. They reported at least one contractually unlisted data element in 44 of 85 tested applications with an SDPC-based DPA. This is evidence about that investigation's sample, not a national prevalence estimate.

## 3. Product thesis

Pactwire turns a one-time document review into a repeatable behavior-regression check owned by the district.

The causal chain is:

~~~text
human-confirmed agreement requirement
        +
authorized synthetic student or teacher journey
        +
deterministically captured data flow
        ↓
replayable evidence of a witnessed conflict
        ↓
district-controlled APPROVED status becomes HOLD
        ↓
human review and decision
~~~

GPT-5.6 is structural only if it materially improves contract-relevant journey coverage per hour of expert effort. It may propose testable requirements, explore unfamiliar interfaces, and repair journeys when interfaces change. It may not fabricate observed traffic, decide what the law requires, determine compliance, hash its own evidence, or control an approval decision.

The product remains useful when the model is wrong because:

- a person confirms the requirements against the signed agreement;
- a recorder outside the model captures browser and network facts;
- deterministic rules establish whether an observed canary matches a confirmed test rule;
- ambiguous cases remain visibly unresolved; and
- only a person can create or restore approval.

## 4. Goals and success outcomes

### 4.1 Product goals

1. Give a district privacy officer a repeatable way to test selected promises in the district's own signed agreement.
2. Produce a reviewable evidence receipt that binds a named journey, synthetic test value, observed request, destination, agreement citation, screenshot, time, and immutable hashes.
3. Detect newly witnessed conflicts and loss of previously required visibility after product changes.
4. Connect a high-confidence witnessed conflict to a reversible operational action: **APPROVED → HOLD**.
5. Make uncertainty impossible to mistake for approval or proof of safety.
6. Demonstrate that GPT-5.6 finds or maintains materially more contract-relevant test coverage than a human-recorded deterministic replay baseline.

### 4.2 User outcomes

A privacy officer should be able to:

- understand exactly which agreement promises are being tested;
- see which student or teacher activities were and were not exercised;
- inspect the external facts behind every consequential finding;
- distinguish a witnessed conflict from an ambiguous, untested, or invisible condition;
- place software on hold without making an unsupported public accusation; and
- decide whether and when to restore approval after reviewing a later run.

### 4.3 Non-goals

Pactwire will not:

- declare that software is safe, private, legal, or compliant;
- prove that prohibited behavior never occurs;
- use real student records or production child accounts;
- test behavior outside an explicitly authorized tenant and domain scope;
- replace a district privacy officer, security professional, lawyer, vendor review, or accessibility review;
- automatically grant, renew, or restore approval;
- infer that an unknown domain belongs to a specific company without confirmed evidence;
- inspect server-side processing that is not observable from the authorized client;
- contact vendors, block student access, change district identity systems, or publish accusations in P0;
- test native mobile applications, browser extensions, or desktop software in P0; or
- optimize for the number of model calls or agent actions.

## 5. Users and authority

### 5.1 Primary user

**District student-data privacy officer**

This person owns or administers the district's application privacy review. They can confirm what a signed agreement means for a specific test, review evidence, and decide whether an application should remain approved.

Primary job:

> When an approved school product changes, help me check the student-data promises that matter, show me the exact evidence behind any conflict, and stop the approval from silently remaining active until I review it.

### 5.2 Supporting users

| Actor | Product responsibility | Authority boundary |
| --- | --- | --- |
| District test operator | Configures synthetic accounts, runs journeys, and troubleshoots access | Cannot confirm legal meaning or restore approval unless also assigned the privacy-officer role |
| District security or technology reviewer | Inspects network evidence and destination identity | Supplies technical judgment; does not acquire legal authority from Pactwire |
| District application approver | Owns the operational approval record | May set or restore approval after reviewing the receipt |
| Vendor responder | May receive an exported evidence package in a future workflow | Has no access by default and cannot alter district evidence |
| Pactwire system | Records observations, evaluates preconfirmed machine-testable rules, and enforces holds | May only transition an existing APPROVED state to HOLD under the rules in this document |

Students and teachers are not Pactwire users in P0. Their roles are represented only by isolated, fictional test accounts.

## 6. Plain-language definitions

| Term | Meaning in Pactwire |
| --- | --- |
| School software | A web product a district uses for teaching, learning, assessment, communication, or administration |
| Data-protection agreement (DPA) | The signed privacy agreement between a district and a software vendor |
| Requirement | A specific promise or restriction from the DPA that a privacy officer has reviewed and confirmed for testing |
| Synthetic account | A clearly fictional student or teacher account created only for authorized testing |
| Canary | A unique made-up value, such as a test email address or assignment phrase, that lets the recorder identify where a specific test field traveled |
| Journey | A named series of actions, such as “teacher assigns work” or “student submits work” |
| Observation | A browser, storage, or network fact captured by the deterministic recorder |
| Destination | The web domain and, when confirmed, the company receiving an observed request |
| Finding | Pactwire's bounded statement about what the named test did or did not establish |
| Evidence receipt | An immutable package tying a finding to its run configuration, observations, agreement citation, and hashes |
| Required visibility | A capture point that the privacy officer marks as necessary for a test to remain valid |
| Hold | A reversible district status requiring human review before the software returns to approved use |

## 7. Product principles

1. **Observed facts come from instrumentation, not model narration.**
2. **Agreement meaning becomes executable only after human confirmation.**
3. **The model explores; it does not authorize.**
4. **Absence of observed evidence is not evidence of safety.**
5. **Unknown, untested, and invisible states remain prominent.**
6. **Automatic authority is asymmetric: Pactwire may hold but never approve.**
7. **Every consequential result must be reproducible from an external evidence receipt.**
8. **No real child data enters the product, logs, prompts, screenshots, fixtures, or repository.**
9. **Website content is untrusted input, never a source of permission.**
10. **The controlled demonstration must tell the same truth as the intended product.**

## 8. First complete release

### 8.1 P0 scope

The first complete release includes:

- district workspace and role-based access;
- school-software inventory with an imported human-owned approval status;
- authorization attestation and domain/action allowlist;
- versioned DPA upload from PDF or text;
- GPT-5.6-assisted requirement proposals with exact source citations;
- mandatory human confirmation of every executable requirement;
- synthetic student and teacher profiles with run-specific canaries;
- named journey creation, model-assisted discovery, deterministic replay, and repair;
- an isolated browser runner using GPT-5.6 computer use;
- deterministic network, browser-storage, screenshot, and action capture;
- human-confirmed destination registry;
- deterministic canary matching and rule evaluation;
- bounded finding states;
- content-addressed evidence receipts and export;
- automatic **APPROVED → HOLD** under narrowly defined conditions;
- human-only approval restoration with an audit trail;
- a controlled school-software fixture with baseline, regression, repaired, ambiguous, and invisible cases;
- an evaluation harness comparing manual, deterministic replay, and GPT-assisted arms; and
- product analytics that contain no real student data.

### 8.2 P1 scope

P1 may include:

- scheduled and vendor-release-triggered reruns;
- email, webhook, ticketing, and procurement-system integrations;
- collaborative vendor remediation;
- shared district agreement templates;
- additional identity providers and multifactor handoff;
- native mobile application testing;
- richer destination ownership research with human confirmation;
- policy-change monitoring;
- district-to-district anonymized benchmark statistics; and
- production-grade multi-region deployment.

P1 work must preserve every authority and evidence boundary in this document.

## 9. End-to-end workflow

### 9.1 Preconditions

Before a run, Pactwire must have:

1. a district user with authority to configure the test;
2. an explicit attestation that the district controls or is authorized to test the tenant;
3. an allowed base URL, allowed supporting domains, and prohibited actions;
4. fictional student and teacher accounts isolated from real district data;
5. a versioned DPA;
6. at least one human-confirmed, machine-testable requirement;
7. at least one named journey linked to that requirement; and
8. a declared current approval status owned by a person or district system.

### 9.2 Primary journey

1. **Add software.** The privacy officer records the software, vendor, authorized tenant, current district status, and test owner.
2. **Define authority.** The officer attests authorization, sets the domain allowlist, and identifies actions the runner may never take.
3. **Import the agreement.** Pactwire stores the original document, computes its hash, and creates an immutable version.
4. **Review proposed requirements.** GPT-5.6 proposes structured test requirements with exact page and text citations. The officer edits, rejects, or confirms each proposal.
5. **Configure fictional users.** The operator provides synthetic student and teacher accounts. Pactwire creates unique canaries for the selected fields and run.
6. **Confirm journeys.** GPT-5.6 proposes contract-relevant activities. The officer selects the journeys, roles, checkpoints, allowed actions, and required visibility.
7. **Run in isolation.** GPT-5.6 operates the authorized interface inside an isolated browser. A separate recorder captures actions and externally visible behavior.
8. **Evaluate evidence.** Deterministic rules match canaries, confirmed destinations, and confirmed requirements. Anything requiring semantic or legal judgment becomes **NEEDS_REVIEW**.
9. **Show the result.** Pactwire displays the named scope, coverage, finding state, exact request and agreement evidence, and important limitations.
10. **Enforce the safe transition.** A witnessed conflict, or loss of previously required visibility after retries, changes an existing **APPROVED** status to **HOLD**.
11. **Human review.** The privacy officer reviews the receipt, coordinates any investigation, records a decision, and may later restore approval.
12. **Rerun after repair.** Pactwire repeats the same journey. A clean rerun can say only that the prior conflict was not seen again in those named tests. It never restores approval.

## 10. State model

### 10.1 Approval states

| State | Meaning | Who can enter it |
| --- | --- | --- |
| UNKNOWN | Pactwire has no district approval decision | Human or imported district system |
| APPROVED | The district has approved the software outside Pactwire's automated evaluator | Human or imported district system only |
| HOLD | Use or approval requires human review | Pactwire under the narrow rules below, or a human |
| REJECTED | The district has rejected the software | Human or imported district system only |
| RETIRED | The district no longer evaluates or uses the record | Human only |

Automatic transitions:

~~~text
APPROVED -- witnessed conflict ------------------------> HOLD
APPROVED -- required visibility lost after retries ----> HOLD

No other automatic approval-state transition is allowed.
~~~

A successful, clean, failed, partial, untested, or invisible run never creates **APPROVED** and never changes **HOLD** back to **APPROVED**.

### 10.2 Run states

| State | Meaning |
| --- | --- |
| QUEUED | Configuration is immutable and waiting to execute |
| RUNNING | The isolated browser and recorder are active |
| COMPLETED | The runner ended and all required artifacts were finalized |
| PARTIAL | Some named coverage completed, but at least one required segment did not |
| FAILED | No valid receipt could be finalized |
| CANCELED | An authorized person stopped the run |

Every terminal run receives a manifest. A failed or partial run must preserve any safely captured evidence and clearly list missing coverage.

### 10.3 Finding states

The user interface must show the plain-language label before the internal token.

| Internal state | Required user-facing meaning |
| --- | --- |
| WITNESSED_CONFLICT | “Pactwire recorded a data flow that conflicts with this confirmed test rule.” |
| NO_CONFLICT_OBSERVED_IN_NAMED_TESTS | “Pactwire did not record this conflict in the named tests. Other behavior was not assessed.” |
| NOT_REOBSERVED_IN_NAMED_TESTS | “A previously recorded conflict did not appear in this rerun of the named tests. Human review is still required.” |
| NOT_TESTED | “This requirement or path was not exercised.” |
| NOT_VISIBLE | “Pactwire could not observe the evidence needed to evaluate this test.” |
| NEEDS_REVIEW | “The evidence is ambiguous or needs human technical, privacy, or legal judgment.” |

The words “pass,” “safe,” “compliant,” and “approved” must not label a finding.

**NO_CONFLICT_OBSERVED_IN_NAMED_TESTS** and **NOT_REOBSERVED_IN_NAMED_TESTS** are allowed only when every required checkpoint for that specific rule was exercised and remained visible. If a required checkpoint was skipped or could not be observed, the result must be **NOT_TESTED** or **NOT_VISIBLE**, even when the recorder captured no conflict. A positive **WITNESSED_CONFLICT** may still stand when unrelated paths are incomplete, but the receipt must show that incomplete scope.

## 11. Functional requirements

### 11.1 Workspace, inventory, and authority

| ID | Priority | Requirement | Acceptance criteria |
| --- | --- | --- | --- |
| FR-001 | P0 | Create a district workspace and assign privacy officer, test operator, and reviewer roles | Restricted actions are enforced server-side; a role-change event is recorded in the audit log |
| FR-002 | P0 | Create a school-software record | Record includes product name, vendor, authorized tenant URL, district owner, current human-owned approval state, and version when known |
| FR-003 | P0 | Require test authorization before execution | No run can queue until the user attests authority, records its basis, and sets an expiration or review date |
| FR-004 | P0 | Enforce domain and action scope | The runner cannot navigate, submit, download, upload, message, purchase, delete, or administer outside the configured policy |
| FR-005 | P0 | Keep credentials outside normal model context | The harness injects secrets where feasible; secrets and session tokens are redacted from prompts, logs, screenshots, and exports |
| FR-006 | P0 | Preserve the district's existing approval record | Pactwire identifies the human or external system that set the state and never represents an imported status as its own conclusion |

### 11.2 Agreement intake and confirmation

| ID | Priority | Requirement | Acceptance criteria |
| --- | --- | --- | --- |
| FR-010 | P0 | Upload a PDF or text DPA as an immutable version | Original file, effective dates, page map, SHA-256 hash, uploader, and upload time are stored |
| FR-011 | P0 | Use GPT-5.6 to propose structured test requirements | Each proposal includes exact source text, page or section, data field, action, recipient restriction, purpose restriction when applicable, ambiguity, and suggested observable test |
| FR-012 | P0 | Require human confirmation before a proposal becomes executable | Unconfirmed model output cannot create a rule, finding, run, or approval-state change |
| FR-013 | P0 | Version confirmed requirements | Edits create a new version with author, reason, old value, and new value; previous receipts keep their original version |
| FR-014 | P0 | Represent ambiguity explicitly | A proposal without a clear, observable predicate can be saved only as non-executable or **NEEDS_REVIEW** |
| FR-015 | P1 | Compare agreement versions | Pactwire identifies changed source spans and asks a person which confirmed requirements and journeys must be re-reviewed |

Structured model responses must follow a validated schema. Refusal, incomplete output, invalid schema, unrelated input, or missing citation must result in a visible intake error rather than a guessed requirement.

### 11.3 Synthetic test data and journeys

| ID | Priority | Requirement | Acceptance criteria |
| --- | --- | --- | --- |
| FR-020 | P0 | Configure isolated fictional student and teacher personas | The setup warns against real data, scans for likely real district identifiers, uses reserved non-deliverable domains for generated addresses, and requires confirmation before saving |
| FR-021 | P0 | Generate unique field-level canaries per run | Every selected field maps to a run-specific value and source persona; values cannot be reused across districts or production accounts |
| FR-022 | P0 | Create named, versioned journeys | Each journey records role, purpose, start state, steps or goal, checkpoints, test data, linked requirements, allowed actions, and required visibility |
| FR-023 | P0 | Use GPT-5.6 to discover and operate contract-relevant journeys | The model receives only the authorized goal and tools; each action, screenshot, and outcome is recorded |
| FR-024 | P0 | Save a deterministic replay where possible | A successful journey can be rerun without model interpretation until interface drift requires repair |
| FR-025 | P0 | Use GPT-5.6 to propose journey repairs after interface drift | The repaired path remains a draft until it reaches the same human-confirmed checkpoints and passes deterministic scope checks |
| FR-026 | P0 | Stop for risky or unexpected actions | Authentication escalation, CAPTCHA, payment, messaging a real person, permission changes, destructive actions, or scope expansion require a person or terminate the run |
| FR-027 | P0 | Preserve a non-model baseline | The same fixture and evidence recorder can run a human-authored deterministic journey for ablation testing |

### 11.4 Isolated execution and deterministic capture

| ID | Priority | Requirement | Acceptance criteria |
| --- | --- | --- | --- |
| FR-030 | P0 | Run each test in an isolated browser context | Cookies, storage, downloads, clipboard, and credentials do not cross runs or workspaces; the context is destroyed after artifact finalization |
| FR-031 | P0 | Capture authorized browser and network evidence | Recorder captures time, action, page URL, screenshot, request method and URL, destination host, initiator when available, authorized request fields, response metadata, and relevant storage changes |
| FR-032 | P0 | Redact secrets and minimize persisted data | Authorization tokens, passwords, session cookies, and unrelated fields are removed from normal views and exports; raw access is restricted and audited |
| FR-033 | P0 | Detect canary propagation deterministically | Exact and explicitly enumerated transforms such as URL encoding or Base64 are supported; semantic similarity alone cannot establish a match |
| FR-034 | P0 | Maintain a human-confirmed destination registry | A destination is treated as an approved or prohibited company only when its domain-to-entity mapping and agreement status are confirmed; otherwise it is unknown |
| FR-035 | P0 | Detect loss of required visibility | Missing instrumentation, encryption, service-worker interference, capture gaps, or changed endpoints produce **NOT_VISIBLE**, not a clean finding |
| FR-036 | P0 | Treat page content as untrusted | Text or images inside the tested product cannot change the allowlist, reveal secrets, invoke external tools, modify requirements, or alter approval |
| FR-037 | P0 | Produce an immutable run manifest | Manifest includes configuration versions, model identifier, runner version, timestamps, observation hashes, missing coverage, and terminal status |
| FR-038 | P1 | Support an authorized proxy capture mode | Proxy evidence remains separately labeled and must preserve the same minimization, scope, and receipt rules |

### 11.5 Evaluation, findings, and evidence receipts

| ID | Priority | Requirement | Acceptance criteria |
| --- | --- | --- | --- |
| FR-040 | P0 | Evaluate only human-confirmed, machine-testable predicates | **WITNESSED_CONFLICT** requires a confirmed rule, confirmed field identity, deterministic observation, confirmed destination status when relevant, and complete receipt lineage |
| FR-041 | P0 | Route uncertain mappings to human review | Unknown field identity, transformed values outside enumerated transforms, uncertain destination ownership, purpose inference, or ambiguous agreement language results in **NEEDS_REVIEW** |
| FR-042 | P0 | Display the tested scope with every finding | Finding names the software version, agreement version, role, journey, fields, observation window, visible paths, untested paths, and limitations |
| FR-043 | P0 | Build a content-addressed evidence receipt | Receipt binds the exact agreement span, request or storage event, canary match, destination record, screenshots, action trace, configuration, timestamps, and SHA-256 manifest hash |
| FR-044 | P0 | Make receipts reproducible and exportable | An authorized reviewer can download a sanitized bundle and independently recompute every included artifact hash |
| FR-045 | P0 | Preserve corrections without rewriting history | A correction creates a linked superseding finding; original observations, decisions, and receipts remain intact |
| FR-046 | P0 | Separate model narrative from evidence | GPT-5.6 may summarize a receipt, but its prose is labeled as an explanation and is never part of the deterministic conflict predicate |

### 11.6 Approval hold and human decision

| ID | Priority | Requirement | Acceptance criteria |
| --- | --- | --- | --- |
| FR-050 | P0 | Automatically hold an existing approval for a witnessed conflict | A qualifying **WITNESSED_CONFLICT** causes one idempotent **APPROVED → HOLD** transition linked to the receipt |
| FR-051 | P0 | Hold for loss of previously required visibility only after retries | If a checkpoint marked required was previously visible, Pactwire retries using the frozen policy; persistent loss changes **APPROVED → HOLD** with reason “required visibility lost,” not “contract conflict” |
| FR-052 | P0 | Never grant or restore approval automatically | Automated code paths cannot enter **APPROVED** from any other state; this invariant has unit, integration, and end-to-end tests |
| FR-053 | P0 | Keep a hold after a clean rerun | A rerun may produce **NOT_REOBSERVED_IN_NAMED_TESTS**, but status remains **HOLD** until a person acts |
| FR-054 | P0 | Require a human decision record to restore approval | Reviewer sees the originating receipt and rerun history, records a reason, and signs the state change with identity and time |
| FR-055 | P0 | Maintain an append-only approval history | Every imported, human, and automated state event records actor, reason, prior state, new state, receipt, and timestamp |
| FR-056 | P1 | Notify connected district systems | Webhook or ticket payload uses bounded language and contains a receipt link; it cannot label software compliant or illegal |

## 12. Required product experience

### 12.1 Software inventory

The default view shows:

- software name and authorized tenant;
- current district approval state and who set it;
- latest run state and time;
- count of witnessed conflicts, needs-review items, invisible requirements, and untested requirements;
- DPA version and next authorization review date; and
- the next safe action.

A green badge must never summarize a sampled run. Neutral wording such as “No conflict observed in 2 named tests” is required.

### 12.2 Setup flow

The setup flow has six visible steps:

1. software and district status;
2. authorization and allowed scope;
3. agreement upload;
4. requirement confirmation;
5. fictional accounts and test fields; and
6. journeys and required visibility.

The user can leave and resume setup. Pactwire explains why a missing prerequisite blocks execution.

### 12.3 Agreement review

The screen places the source document beside each proposed structured requirement. The user can:

- inspect the exact cited text and page;
- see what the model thinks can be tested;
- edit the data field, recipient, action, and expected rule;
- mark it ambiguous or non-observable;
- reject it; or
- confirm it with name, time, and rationale.

“Confirm” means “use this as a test rule,” not “accept the model's legal interpretation.”

### 12.4 Journey editor

Each journey shows:

- plain-language goal;
- teacher or student role;
- linked confirmed requirements;
- fictional fields used;
- allowed and prohibited actions;
- required checkpoints and visibility;
- deterministic steps when recorded;
- model-proposed repair history; and
- last successful version.

### 12.5 Run view

During a run, the user sees:

- current named journey and role;
- isolated browser preview;
- model actions separated from recorder events;
- allowed scope;
- completed and incomplete checkpoints;
- detected canary matches; and
- a prominent stop control.

The UI must not show chain-of-thought. It shows concise action summaries and externally observable events.

### 12.6 Finding detail

A witnessed conflict page must answer, in this order:

1. **What did Pactwire record?**
2. **Which fictional field was involved?**
3. **What action caused it?**
4. **Where was it sent or collected?**
5. **Which confirmed agreement rule does that conflict with?**
6. **What exactly was tested and not tested?**
7. **Why did the district status change?**
8. **What must a person decide next?**

The request, canary, destination record, agreement citation, screenshot, timestamps, hashes, and export are accessible without reading model prose.

### 12.7 Hold review

The reviewer can:

- inspect every receipt that contributed to the hold;
- request or record a rerun;
- record vendor or internal notes;
- keep the hold;
- reject or retire the software; or
- restore approval with a signed reason.

The restore action includes a confirmation that the latest clean result covers only its named tests.

## 13. Reference architecture

The first implementation should use a TypeScript monorepo unless a later architecture decision records a concrete reason to change it.

- **Web console and API:** Next.js application for setup, review, runs, findings, and approval history.
- **Relational data:** PostgreSQL for workspaces, versions, rules, state, and audit metadata.
- **Runner service:** isolated Node.js worker using Chromium and Playwright/CDP for browser control and deterministic instrumentation.
- **OpenAI integration:** Responses API with GPT-5.6, structured outputs for requirement proposals, and computer use for authorized interface operation.
- **Evidence storage:** content-addressed encrypted object storage behind a local filesystem adapter for the controlled demonstration.
- **Fixture:** a separately deployable fictional school-software application with configurable behaviors.
- **Evaluation harness:** shared scenarios that can run manual, deterministic replay, and GPT-assisted arms against the same recorder.

~~~mermaid
flowchart LR
    Officer["District privacy officer"] --> Console["Pactwire web console"]
    Console --> Agreement["Agreement review and confirmed test rules"]
    Console --> Journey["Journey and synthetic-data configuration"]
    Console --> State["District approval-state service"]

    Agreement --> Orchestrator["Run orchestrator"]
    Journey --> Orchestrator
    Orchestrator --> Model["GPT-5.6: propose, navigate, repair"]
    Model --> Sandbox["Isolated browser harness"]
    Sandbox --> Fixture["Authorized school software or controlled fixture"]

    Sandbox --> Recorder["Deterministic recorder"]
    Recorder --> Matcher["Canary matcher and rule evaluator"]
    Agreement --> Matcher
    Matcher --> Receipt["Content-addressed evidence receipt"]
    Receipt --> State
    State --> Officer

    Guard["Scope, secret, and action policy"] --> Model
    Guard --> Sandbox
    Guard --> Recorder
~~~

The model lane and evidence lane are separate by design. No model-produced statement can be substituted for a recorder event.

## 14. Core data model

| Entity | Purpose | Important invariants |
| --- | --- | --- |
| Workspace | District boundary | No cross-workspace data or credential access |
| UserRole | Authority mapping | Consequential actions are server-authorized and audited |
| SoftwareRecord | Product and tenant under review | Approval state identifies its human or external owner |
| Authorization | Test basis, scope, expiration, and prohibited actions | Required and current before every run |
| AgreementVersion | Original DPA and immutable source map | Original bytes and hash never change |
| RequirementVersion | Human-confirmed executable or non-executable rule | Model output alone cannot create it |
| DestinationRecord | Domain-to-entity identity and approval classification | Unknown remains unknown until a person confirms it |
| Persona | Fictional teacher or student configuration | Contains no real student information |
| Canary | Unique run-specific test value | Maps to one synthetic source field and run |
| JourneyVersion | Named role activity and checkpoints | Linked to exact requirement and authorization versions |
| Run | Frozen execution configuration | Changes create another run, never mutate history |
| Observation | Deterministic browser or network fact | Hashable and traceable to recorder version and time |
| CanaryMatch | Enumerated deterministic relationship | Model similarity cannot create a positive match |
| Finding | Bounded result state | Always includes tested scope and limitations |
| EvidenceReceipt | Content-addressed proof package | Immutable; corrections supersede rather than edit |
| ApprovalEvent | State transition | Automated actor can only perform APPROVED → HOLD |
| HumanDecision | Signed review outcome | Required for every restoration of approval |

No table or event should contain a real student identifier. Test fixtures and seed files must be obviously fictional.

## 15. Responsibility boundaries

| Task | GPT-5.6 | Deterministic system | Human |
| --- | --- | --- | --- |
| Find candidate agreement requirements | Proposes with citations | Validates schema and source location | Confirms, edits, rejects, or marks ambiguous |
| Decide legal meaning or compliance | Never | Never | Qualified district authority or counsel |
| Propose contract-relevant journeys | Yes | Stores versions and checkpoints | Selects scope and allowed actions |
| Operate an unfamiliar interface | Yes, inside policy | Enforces scope and records actions | Intervenes for blocked or risky steps |
| Repair a drifted journey | Proposes and attempts | Verifies checkpoints and scope | Accepts consequential scope changes |
| Record traffic and storage | Never supplies the fact | Sole source of observed evidence | Inspects when needed |
| Match a canary | May help explain | Exact or enumerated transforms only | Reviews ambiguous transforms |
| Identify a destination company | May propose research | Stores domain facts and status | Confirms the mapping |
| Produce a witnessed conflict | May explain | Applies confirmed predicate to recorded fact | Reviews and may supersede |
| Change APPROVED to HOLD | Never chooses | Executes narrow, tested rule | May also place a hold |
| Create or restore APPROVED | Never | Technically prohibited for automation | Authorized person or imported district system only |

## 16. Security, privacy, and safety requirements

| Risk | Required control | Verification |
| --- | --- | --- |
| Real student data enters the system | Fictional-only onboarding, prominent warnings, likely-identifier scan, synthetic fixture, no production SIS integration | Seed and log scan; end-to-end test; manual release review |
| Prompt injection in tested software | Treat page content as untrusted; fixed system policy; no arbitrary shell, email, admin API, or allowlist mutation; stop on scope requests | Adversarial fixture pages must fail to expand scope or expose secrets |
| Credential leakage | Secret store, harness injection, short-lived sessions, redaction, no secret in exports, isolated browser | Automated secret scanning and canary credentials in security tests |
| Out-of-scope browsing or action | Domain/action allowlist enforced below the model; redirect and popup checks; network egress policy | Blocked-domain, redirect, download, upload, delete, and message tests |
| Harmful action in an authorized tenant | Synthetic tenant, least-privilege accounts, prohibited action classes, human handoff for consequential actions | Fixture includes payment, messaging, permission, and deletion traps |
| Cross-district leakage | Tenant-scoped authorization, storage keys, encryption, and object prefixes | Automated isolation tests |
| Evidence tampering | Immutable source versions, content-addressed artifacts, manifest hashes, append-only audit history | Recompute hashes; mutation test must invalidate receipt |
| False company attribution | Human-confirmed destination registry and visible unknown state | Unknown-domain case cannot become a witnessed recipient conflict |
| False assurance after incomplete capture | First-class **NOT_TESTED**, **NOT_VISIBLE**, **PARTIAL**, and **FAILED** states; no green pass | Capture-loss and unexercised-path end-to-end tests |
| Unsupported public accusation | Bounded language, private-by-default findings, sanitized export, no automatic external publication | Copy review and permission test |
| Excessive evidence retention | Configurable retention, restricted raw access, redacted export, deletion workflow that preserves only required audit metadata | Retention and deletion tests |

Production deployment requires a documented threat model, dependency review, encryption key plan, incident response path, and privacy review. The controlled fixture can run locally, but “local” does not remove the need for isolation or authorization.

## 17. Failure and recovery behavior

| Failure | Product response |
| --- | --- |
| Agreement is unreadable, unrelated, or extraction is incomplete | Stop intake, preserve the source, explain the error, and require manual review |
| Citation does not map to the source | Reject the proposal; never create an executable rule |
| Login or multifactor authentication blocks the runner | Pause for an authorized human handoff without exposing secrets to the model |
| CAPTCHA or anti-automation control appears | Stop and mark the affected path **NOT_TESTED** unless an authorized human completes it |
| Interface changed | Attempt a bounded GPT-5.6 repair; verify checkpoints; otherwise mark the path partial or not tested |
| Unexpected domain or popup appears | Block it, record the attempt, and mark affected evidence as unknown or not tested |
| Recorder drops events or cannot inspect a request | Mark the relevant checkpoint **NOT_VISIBLE**; never infer a clean result |
| Destination ownership is uncertain | Use **NEEDS_REVIEW** or unknown destination; no recipient conflict |
| Canary transform is not deterministic | Use **NEEDS_REVIEW**; model interpretation cannot promote it |
| GPT-5.6 refuses, times out, or returns invalid structure | Retry within policy, then preserve a visible model failure and allow deterministic/manual operation |
| Evidence artifact hash does not verify | Invalidate the receipt, block automated hold from that receipt, and raise an integrity incident |
| Hold transition is retried | Idempotently reuse the existing approval event and receipt link |
| Repaired version no longer shows the conflict | Record **NOT_REOBSERVED_IN_NAMED_TESTS** and retain **HOLD** pending human review |

## 18. Controlled demonstration fixture

The central demonstration uses a fictional web product named **Pactwire Classroom Fixture**. It is not modeled on or presented as a finding about a real vendor.

### 18.1 Fixture roles and journeys

- Teacher journey: create an assignment containing a unique fictional class phrase.
- Student journey: sign in with a synthetic email address, open the assignment, and submit a unique fictional response.

### 18.2 Confirmed test rule

The fixture DPA states, in plain language, that the synthetic student email and submission may be collected by the classroom service to deliver the assignment, but the student email may not be sent to the fixture analytics company.

The privacy officer confirms the exact source span, field, allowed first-party destination, prohibited analytics destination, and named journeys before execution.

### 18.3 Configurable fixture versions

| Version | Behavior | Expected bounded result |
| --- | --- | --- |
| Baseline | Submission remains in the allowed first-party request | No conflict observed in the named tests |
| Regression | Student-email canary is included in a request to the confirmed fixture analytics destination | Witnessed conflict and APPROVED → HOLD |
| Repaired | Analytics request no longer contains the student-email canary | Prior conflict not re-observed; HOLD remains |
| Ambiguous | A transformed value outside the enumerated matcher appears at an unknown destination | Needs review |
| Invisible | The required capture point is unavailable | Not visible; after the configured retry rule, required visibility loss may place approval on hold |

### 18.4 Three-minute causal spine

1. Show the fictional software as **APPROVED**, one human-confirmed agreement rule, two named journeys, and synthetic canaries.
2. Run GPT-5.6 computer use against the unfamiliar fixture while the separate recorder is visible.
3. Show the exact canary in the disallowed fixture request.
4. Open the receipt: request, destination, role, action, screenshot, agreement span, timestamp, and hashes.
5. Show the actual approval event change from **APPROVED** to **HOLD**.
6. Rerun the repaired fixture and show **NOT_REOBSERVED_IN_NAMED_TESTS** while the status remains **HOLD**.
7. Briefly show an untested or invisible branch to prove missing evidence never becomes green.

The demo claim is the recorded event and state transition, not the visual activity of the agent.

## 19. Validation plan

Validation is split so a successful fixture cannot be misrepresented as proof of adoption or legal compliance.

### 19.1 Layer A — mechanism correctness

Create a blinded controlled corpus containing:

- at least 100 cases;
- at least 40 instrumentable seeded conflicts;
- allowed first-party flows and prohibited third-party flows;
- exact, URL-encoded, Base64, and unsupported transforms;
- known and unknown destinations;
- collection restrictions and recipient restrictions;
- layout and navigation drift;
- partial, failed, not-tested, and not-visible paths;
- prompt-injection attempts; and
- clean reruns after a prior conflict.

Ground truth is defined by fixture code and a separate test manifest unavailable to the model and evaluator during execution.

Advance only if Pactwire demonstrates:

- at least 95% precision for **WITNESSED_CONFLICT**;
- at least 85% recall for instrumentable seeded conflicts;
- zero automated approvals or approval restorations;
- zero witnessed-recipient conflicts based only on an unknown destination;
- zero out-of-allowlist actions in the adversarial suite;
- correct uncertainty state on every intentionally non-instrumentable case; and
- stable evidence hashes across independent verification.

Report denominators, errors, and 95% confidence intervals. Do not hide ambiguous or excluded cases.

### 19.2 Layer B — model contribution

Run the same authorized tasks and recorder in three arms:

1. Utah-style manual exploration;
2. human-authored deterministic recorder/replayer; and
3. GPT-5.6 journey discovery and repair.

Evaluators are blinded to seeded conflicts. Measure:

- confirmed contract-relevant paths exercised;
- instrumentable conflicts found;
- false conflict findings;
- human journey-authoring time;
- human repair time after interface drift;
- model and infrastructure cost;
- retries and incomplete paths; and
- expert minutes spent reviewing model proposals.

The GPT-5.6 thesis advances only if it:

- doubles contract-relevant path coverage per expert hour versus deterministic replay;
- reduces human journey authoring and repair time by at least 50%;
- preserves the Layer A precision and recall thresholds; and
- never produces an unbounded compliance conclusion in the evaluated UI or export.

If deterministic replay matches GPT-5.6 on coverage and effort, the model-native thesis fails. The product must then be repositioned as conventional deterministic regression testing or killed as the lead hackathon idea.

### 19.3 Layer C — workflow usefulness

Conduct task-based reviews with district privacy or education-technology professionals when access is available. Use the controlled fixture and ask participants to:

- confirm one test requirement;
- explain every finding state in their own words;
- identify what was and was not tested;
- verify the evidence behind a witnessed conflict;
- decide whether to keep or restore a hold; and
- identify information they would need before acting in a real district.

Measure task completion, time to correct interpretation, dangerous misunderstandings, decision confidence, and missing workflow steps. The target is 100% correct understanding that a clean named run is not proof of compliance and that Pactwire cannot approve software.

If qualified target-user review has not occurred, submission and product copy must say “mechanism validated in a controlled environment; district workflow and adoption remain unvalidated.”

### 19.4 Layer D — authorized pilot

A future real-world claim requires an explicitly authorized district or vendor test tenant, legal and security review, synthetic-only data, and a predeclared response protocol. A hackathon fixture cannot validate:

- national prevalence;
- complete product data lifecycle behavior;
- legal noncompliance;
- production false-negative rate;
- district adoption; or
- improved student outcomes.

## 20. Product metrics

### 20.1 Primary metrics

- Contract-relevant path coverage per expert hour.
- Precision and recall on instrumentable seeded conflicts.
- Median human time to create and repair a journey.
- Median time from detected product change to reviewable receipt.
- Percentage of confirmed requirements ending in each bounded state.
- Percentage of receipts whose hashes independently verify.
- Human interpretation accuracy across finding states.

### 20.2 Guardrail metrics

- Automated approval or restoration count: target **zero**.
- Out-of-scope action count: target **zero**.
- Real-student-data incidents: target **zero**.
- Secret exposure incidents: target **zero**.
- Unknown destinations incorrectly attributed: target **zero**.
- Findings missing named scope or limitations: target **zero**.
- Holds later determined to result from recorder or rule defects.

Do not optimize away **NOT_TESTED**, **NOT_VISIBLE**, or **NEEDS_REVIEW**. A lower uncertainty count is useful only when additional valid evidence resolves it.

### 20.3 Analytics events

P0 analytics include:

- software record created;
- authorization created, expired, or revoked;
- agreement uploaded;
- requirement proposed, confirmed, rejected, or marked ambiguous;
- journey created, replayed, repaired, or abandoned;
- run queued and terminal state;
- checkpoint visible, invisible, tested, or untested;
- finding created or superseded;
- receipt viewed, verified, or exported;
- approval placed on hold; and
- human decision recorded.

Analytics contain identifiers for fictional test artifacts, never student records or raw request bodies.

## 21. Quality requirements

### 21.1 Reliability

- Approval transitions and receipt finalization are idempotent.
- A process crash cannot leave a run labeled complete without a verifiable manifest.
- Retries preserve the original configuration and are linked as distinct attempts.
- Timeouts and partial results remain visible.

### 21.2 Accessibility

- Core setup, review, run, finding, and hold flows target WCAG 2.2 AA.
- All statuses use text and icons in addition to color.
- Evidence tables and dialogs support keyboard use and screen readers.
- Screenshots have contextual alternatives when needed to understand a finding.

### 21.3 Observability

- Structured logs separate model actions, harness actions, recorder events, rule evaluations, and human decisions.
- Logs include correlation identifiers but exclude secrets and raw student-like data.
- Cost, latency, retries, blocked actions, capture gaps, and model failures are measurable.

### 21.4 Performance

- Normal console interactions should respond within 500 ms at the 95th percentile, excluding model and browser runs.
- The user receives run progress within two seconds of a new recorder or checkpoint event.
- Large evidence artifacts load progressively and do not block the finding summary.

### 21.5 Compatibility

P0 supports authorized browser-based products that work in the packaged Chromium runner. Unsupported browser features or native applications must be declared before setup and cannot silently degrade to a clean result.

## 22. Definition of done

The first complete release is done only when:

1. A new user can run the controlled fixture from software setup through human hold review using documented sample data.
2. GPT-5.6 proposes cited requirements, operates both named journeys, and repairs at least one seeded interface change.
3. The deterministic recorder—not model output—captures the fixture requests and canary matches.
4. A seeded conflict creates a verifiable receipt and a real, persisted **APPROVED → HOLD** event.
5. A repaired rerun produces **NOT_REOBSERVED_IN_NAMED_TESTS** and does not restore approval.
6. Untested, invisible, ambiguous, failed, and prompt-injection cases behave as specified.
7. All automated authority invariants and P0 acceptance tests pass.
8. The controlled evaluation reports every threshold, denominator, error, and model ablation.
9. No real student data, credentials, proprietary agreements, or real-vendor accusations exist in source, fixtures, logs, screenshots, or demo media.
10. Setup, architecture, security, privacy, limitations, sample data, OpenAI usage, Codex collaboration, and evaluation instructions are documented.
11. A judge can access a hosted or packaged test path without reconstructing the product.
12. The product description and demonstration use the bounded claims in this PRD.

## 23. Fixed decisions

These decisions may change only through an explicit PRD revision:

- The product is named **Pactwire**.
- The selected track is **Education**.
- The primary user is a district student-data privacy officer.
- P0 tests browser-based school software in an authorized synthetic tenant.
- The district's signed DPA, not a generic public privacy policy, supplies the reviewed requirements.
- GPT-5.6 assists with requirement proposals, interface exploration, and journey repair.
- Deterministic instrumentation supplies observed facts.
- A person confirms executable rules and destination identity.
- Pactwire may automatically move **APPROVED → HOLD** only for a witnessed conflict or persistent loss of previously required visibility.
- Pactwire never automatically creates or restores **APPROVED**.
- A clean sampled run never means safe or compliant.
- The demonstration uses a controlled fictional application or an explicitly authorized tenant.

## 24. Open implementation decisions

The following require architecture or product decision records during implementation:

1. Default evidence-retention period and secure deletion policy.
2. Credential handoff design for products with multifactor authentication.
3. Exact retry policy before required visibility loss creates a hold.
4. Production object-storage and encryption-key provider.
5. Domain-ownership evidence accepted for human confirmation.
6. Which product-change signals should schedule a rerun.
7. Integration contract for a district's real procurement or filtering system.
8. Which DPA requirement patterns are safe to make machine-testable in the first library.
9. Deployment topology for districts requiring local or district-controlled execution.
10. Copy and workflow review by education privacy and legal professionals before a real pilot.

Open decisions must not weaken the fixed authority, evidence, and synthetic-data rules.

## 25. Principal risks

| Risk | Consequence | Product response |
| --- | --- | --- |
| The model adds little beyond deterministic replay | Technological thesis and hackathon differentiation fail | Run the ablation early and honor the kill rule |
| Client-side observation misses server-side behavior | False assurance | Bound every finding to named visible tests and elevate invisible paths |
| Agreement language is not safely executable | False conflict or legal overreach | Human confirmation, non-executable rules, needs-review state |
| Domain ownership is misidentified | Wrong accusation | Human-confirmed registry and unknown destination state |
| District cannot create an authorized synthetic tenant | Central workflow cannot run safely | Do not run; use the controlled fixture until authority exists |
| A hold has no operational consequence | Product becomes dashboard theater | Persist a real state record and design an external integration contract |
| Prompt injection changes the runner's objective | Secret exposure or harmful action | Enforce scope beneath the model and test adversarial pages |
| Evidence retention creates a new privacy risk | District or vendor data exposure | Synthetic-only P0, minimization, encryption, access control, retention policy |
| Users read “not observed” as “safe” | Dangerous false reassurance | Prohibit pass/compliance language and validate comprehension |
| Controlled fixture is mistaken for market proof | Unsupported impact claim | Separate mechanism, workflow, and pilot validation in all materials |

## 26. Evidence and capability sources

- [OpenAI Build Week rules](https://openai.devpost.com/rules)
- [OpenAI Build Week overview](https://openai.com/build-week/)
- [GPT-5.6 Sol model reference](https://developers.openai.com/api/docs/models/gpt-5.6-sol)
- [OpenAI Responses API guidance](https://developers.openai.com/api/docs/guides/migrate-to-responses)
- [OpenAI computer use guide](https://developers.openai.com/api/docs/guides/tools-computer-use)
- [OpenAI file input guide](https://developers.openai.com/api/docs/guides/file-inputs)
- [OpenAI structured outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs)
- [OpenAI evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices)
- [Utah EdTech App Data Collection and Sharing investigation](https://schools.utah.gov/studentdataprivacy/files/Utah%20EdTech%20App%20Data%20Collection%20and%20Sharing%20-%202023-25%20Investigation.pdf)
- [Pactwire authoritative recommendation](../research/recommendation.md)
- [Focused novelty audit](../research/reviews/edtech-behavior-novelty.md)
- [Final adversarial decision](../research/reviews/final-second-pass-decision.md)
- [Model-native leverage screen](../research/model-native-leverage.md)
