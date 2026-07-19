# Independent divergent mechanism search

Research snapshot: 2026-07-19.

This pass used only the tournament method, the model-native leverage screen, and the four raw problem atlases. It deliberately did not consult the contradiction clustering, judge review, or other reviewers. The purpose is divergence and falsification, not a product recommendation.

## Selected problem surfaces

The track-specific numeric scores are not treated as commensurate because different researchers produced them. Selection instead favors direct evidence of a recurring failure, a two-sided contradiction, a costly current workaround, an externally checkable outcome, and a causal role for model-native reasoning.

| Priority | Problem surface | Track | Evidence judgment | Why it survives this pass |
|---:|---|---|---|---|
| 1 | Assisted performance does not establish independent capability | Education | **A** for high-school mathematics; scope beyond that setting is unproven | A preregistered field experiment found better assisted work but worse unassisted performance. The contradiction is unusually sharp and the outcome can be measured without asking a model to grade itself. |
| 2 | A patient must reconstruct the case against an insurance denial | Apps for Your Life | **A** | Representative survey evidence shows foregone care and abandonment; administrative evidence shows a large gap between initial and appealed decisions. The event has deadlines, fragmented evidence, and an authoritative external outcome. |
| 3 | Low-friction AI contribution makes open-source trust expensive | Developer Tools | **A/B, provisional** | A large mixed-methods study, platform action, and maintainer reports point to a current sustainability failure. The contradiction preserves two valuable goods: openness and finite human attention. |
| 4 | An hourly worker sees the pay result but cannot reconstruct the calculation | Work and Productivity | **B** | Enforcement recovery establishes consequential scale and the record asymmetry is explicit in labor rules. A discrepancy can be checked against records and an executable pay calculation. |
| 5 | Transfer-credit truth arrives after the enrollment decision | Education | **B** | National and current institutional evidence support material credit loss and late evaluation. The contradiction is between decision-time certainty and institution-time authority. |
| 6 | Machinists receive lossy or contradictory representations of design intent | Work and Productivity | **B** | NIST documents the mechanism and models a large burden. The transformation can be shown as an ambiguity found before material is cut and checked against signed engineering intent or inspection. |
| 7 | Individually acceptable agent changes create repository-level interaction risk | Developer Tools | **B, provisional** | Two very large but recent preprints support a repository-level effect distinct from one-change review. It remains in the search because the failure is measurable in real builds and interactions. |
| 8 | Adding legitimate MCP tools can reduce an agent's end-to-end performance | Developer Tools | **B-, provisional** | Microsoft Research provides primary empirical support and a crisp capability-versus-dependability contradiction. User prevalence and economic urgency remain the weakest of the eight. |

The strongest excluded surfaces are not dismissed as unreal. Medication reconciliation and tenant-screening errors are consequential but create unusually difficult clinical or legal authority boundaries; disaster reconstruction and prior authorization risk collapsing into document-packet automation; generic incident, CI, handoff, accessibility-scanning, and tutoring shapes are crowded. Those exclusions should be revisited if independent reviews find a uniquely non-authoritative, externally verified mechanism.

## 1. Assisted performance versus independent capability

Evidence basis: [Education cards 1–2](../raw/education-problems.md). The target outcome is not a better-looking assignment. It is transfer: can the person make the relevant decision or perform a related task without the system doing the cognitive work?

### 1.1 Withdraw assistance at the cognitive boundary

> Because the system identifies the next cognitive operation the learner must perform and exposes only the smallest hint that preserves that operation, the learner no longer has to equate task completion with learning, which changes assisted completion into independent transfer, measured by performance on delayed, unassisted isomorphic tasks.

- **Required inputs and authority:** The task, a teacher-authored competency map or rubric, the learner's attempted steps, prior attempts, and a bank of externally scored transfer tasks. The system may choose and withhold scaffolds; it may not issue grades, disciplinary judgments, or a final answer on the learner's behalf.
- **Visible demo state change:** A learner asks for the solution. Instead of producing it, the system marks the precise unresolved operation, requests one observable step, gives a bounded hint after an error, then removes help on a structurally similar problem. State moves from `assisted success / capability unknown` to `unassisted transfer observed` or `not yet observed`.
- **External ground truth:** Deterministically scored answers where possible; otherwise a blinded teacher rubric. The primary evaluation is a delayed transfer test comparing unrestricted-answer, fixed-hint, no-assistance, and adaptive-withdrawal conditions.
- **Likely failure:** The inferred cognitive boundary may be wrong, the friction may cause abandonment, a learner may obtain the answer elsewhere, or the task may require accommodations that look like “extra assistance” but are necessary access. The system must not treat speed or refusal as lack of ability.
- **Why GPT-5.6 is structural:** The hard part is longitudinal latent-skill inference from semantically different attempts and generation of a minimal, context-specific scaffold—not answer generation. Persisted reasoning and a large context can maintain the evolving skill hypothesis; structured output can bind each hint to a rubric operation. A fixed knowledge tracer is the necessary non-model baseline, and GPT-5.6 is not justified if it cannot improve delayed transfer over that baseline.

### 1.2 Search for the minimum disambiguating probe after a submission

> Because the system constructs a new micro-task whose outcome separates competing explanations of how the submitted work was produced, the educator no longer has to infer mastery from polish or authorship signals, which changes artifact-based grading into evidence of specific understanding, measured by agreement between probe performance and later independent assessment.

- **Required inputs and authority:** The submitted artifact, assignment objective, course materials, version history when voluntarily available, and teacher-specified skills. The system may propose and administer a short probe; the educator retains grading authority and the learner sees the claimed skill being checked.
- **Visible demo state change:** Two equally polished submissions initially have `mastery unresolved`. For each, independent search paths identify a different high-information probe. One learner can repair a deliberately altered premise and explain the consequence; the other cannot. The interface records the observation and provenance rather than an “AI probability.”
- **External ground truth:** Teacher-scored probe behavior, later proctored or authentic performance, and inter-rater agreement. A held-out study tests whether probes predict future performance better than artifact quality, detector scores, and random oral questions.
- **Likely failure:** A short probe can be noisy, anxiety- and language-sensitive, gameable, or inaccessible. Adaptive questions can encode bias. It should contribute evidence, never become an automatic misconduct finding.
- **Why GPT-5.6 is structural:** Counterexample discovery over the exact artifact, curriculum, and alternative reasoning paths requires long-context semantic comparison; independent agents can search for different explanations before synthesis. The model does not grade its own probe: human or deterministic outcomes do. If a fixed question bank is equally predictive, the model-native claim fails.

### 1.3 Demonstrate a capability handoff instead of generating an answer — cross-track mechanism

This mechanism deliberately combines three apparently separate failures: a student submitting polished work, a frontline worker signing that safety instruction was received, and a developer accepting agent-generated code without retaining a causal model.

> Because the system converts an artifact or instruction into a branching, domain-grounded situation in which the human must make the consequential decisions while the system withholds those decisions, the institution no longer has to treat submission, attendance, or green CI as evidence of human capability, which changes proxy completion into an observed capability handoff, measured by correct action in independently validated simulations and later real tasks.

- **Required inputs and authority:** The artifact (assignment, safety procedure, or code change), authoritative constraints (curriculum rubric, OSHA/site procedure, or repository behavior), a deterministic simulator or safe sandbox, and explicit identity/consent rules. The system may stage scenarios and record actions; a teacher, safety officer, or maintainer defines pass conditions and owns any consequence.
- **Visible demo state change:** The same mechanism ingests a lockout procedure and an agent-authored code change. It does not explain either one. It changes a parameter, presents a realistic branch, and asks the human to act. The safety trainee selects the safe sequence; the developer predicts the affected subsystem and repairs a sandboxed fault. State changes from `artifact delivered` to a provenance-backed map of `capability demonstrated / unresolved`.
- **External ground truth:** A safety officer's validated scenario outcomes, repository tests and runtime observations, teacher rubrics, and later on-the-job or unassisted transfer. The model's narrative is never the oracle.
- **Likely failure:** Simulation validity may be weak; surveillance could chill learners or workers; disability and language access can be mistaken for lack of competence; employers could weaponize incomplete evidence. High-stakes use requires co-design, appeal, data minimization, and a strict ban on autonomous discipline.
- **Why GPT-5.6 is structural:** The reusable loop is multimodal semantic inspection plus counterexample generation across artifacts that do not share a schema, followed by bounded execution in a simulator. GPT-5.6 supplies the domain-sensitive branching; external tools supply observable truth. This directly challenges the assumption that the model should answer—the model's valuable act is deciding what not to do for the human.

## 2. Reconstructing the case against a health-insurance denial

Evidence basis: [Apps card 1](../raw/apps-for-your-life-problems.md). All three mechanisms stop short of coverage, legal, or clinical advice. They create contestable evidence and procedural state; the insurer, clinician, regulator, or court remains authoritative.

### 2.1 Close a criterion-to-evidence graph

> Because the system turns each cited denial ground and applicable plan criterion into a provenance-backed state of `supported`, `contradicted`, `missing`, or `authority unclear`, then retrieves only the evidence needed to close open states, the patient no longer has to reconstruct the insurer's case by reading every record, which changes an opaque denial into a bounded contestable record, measured by unresolved criteria, time to a complete appeal packet, and independently adjudicated appeal outcome.

- **Required inputs and authority:** The denial/EOB, plan language and current policy, clinical notes, orders, codes, prior correspondence, deadlines, and patient-authorized read access to payer/provider sources. Sending a request or filing anything requires explicit patient approval; clinical facts require clinician confirmation.
- **Visible demo state change:** A denial begins as one paragraph. The system splits it into three criteria, links two to exact plan and chart spans, marks one required fact absent, requests that fact from an authorized source, and changes only that node to `supported` when a signed record arrives. The result is a state transition, not a summary letter.
- **External ground truth:** Exact source spans and document signatures, clinician confirmation, insurer acknowledgment receipts, and the real appeal determination. Retrospective evaluation uses closed cases with blinded benefits specialists.
- **Likely failure:** The governing policy may be inaccessible or changed, codes may be ambiguous, the denial rationale may be incomplete, and apparently missing evidence may never have existed. The system must show `unknown` rather than infer medical necessity.
- **Why GPT-5.6 is structural:** This requires distributed evidence reconciliation across long, heterogeneous, temporally inconsistent records and bounded tool calls to several authorized systems. Programmatic Tool Calling can join and validate results while retaining provenance. Simple retrieval or summarization is insufficient because the output is an evolving criterion state with externally witnessed transitions.

### 2.2 Run independent pre-mortems against the appeal

> Because independent reasoning paths search for different procedural, evidentiary, coding, and clinical ways an appeal could fail and convert each disagreement into an external check, the patient no longer has to discover missing grounds through another denial, which changes appeal preparation from one-sided advocacy into adversarially tested completeness, measured by pre-filing defects confirmed by authoritative sources and avoidable refiling or denial rates.

- **Required inputs and authority:** The closed evidence graph, exact plan terms, public rules, filing instructions, and access to clinician/billing staff for factual checks. Independent roles receive non-overlapping mandates and their disagreements remain visible. None can declare coverage.
- **Visible demo state change:** One path believes a treatment criterion is met, another finds that the cited note predates a required trial, and a procedural path finds a deadline mismatch. Rather than voting, the system opens two evidence requests. A clinician response resolves one; the other remains visibly uncertain and changes the filing strategy.
- **External ground truth:** Cited plan/rule text, signed provider facts, official filing requirements, blinded specialist review, and eventual insurer or regulator disposition. Success is not the model agreeing with itself.
- **Likely failure:** Multiple agents can share the same blind spot, fabricate pseudo-disagreement, or overload the user with edge cases. Each search scope and evidence source must be distinct, and the mechanism should stop when another check has lower expected value than filing.
- **Why GPT-5.6 is structural:** Multi-agent orchestration is justified only here as independent adversarial search across qualitatively different failure modes, followed by tool-backed checks. GPT-5.6's long context keeps the entire record available while role isolation preserves divergence. A checklist baseline is mandatory; if it finds the same confirmed defects, the multi-agent mechanism is theater.

### 2.3 Advance procedural state without pretending to know the answer

> Because the system maintains the case as a deadline- and receipt-backed state machine and executes only the next explicitly authorized evidence request or filing action, the patient no longer has to remember procedural posture across calls and letters, which changes silent abandonment into preserved appeal rights, measured by missed deadlines, acknowledged submissions, unresolved requests, and cases reaching an authoritative decision.

- **Required inputs and authority:** All correspondence, reliable timestamps, appeal rules, delivery receipts, user goals, and tightly scoped authority for drafting, calling, or submitting. Consequential actions require preview and approval; absence of an official receipt prevents a transition to `filed`.
- **Visible demo state change:** A case marked `denied / deadline in 11 days` cannot move to `appealed` merely because a letter was generated. After approval, a tool submits through the authorized channel; only an external receipt changes state to `filed / awaiting response`. A contradictory new letter reopens a specific state rather than producing another chat answer.
- **External ground truth:** Carrier timestamps, fax or portal receipts, case numbers, official correspondence, and the final determination. A rules engine validates deadline arithmetic after the model extracts the governing facts.
- **Likely failure:** Portals may not expose APIs, receipts can be ambiguous, state rules vary, and automation could file the wrong object. The safe default is a blocked state with a human escalation, not a guessed transition.
- **Why GPT-5.6 is structural:** Longitudinal state reasoning connects evolving, inconsistently worded artifacts across weeks; bounded tools can act under explicit authority. Deterministic state transitions and clocks remain the control plane. GPT-5.6 is warranted for semantic event extraction and contradiction detection, not for deciding coverage.

## 3. Open-source contribution volume versus maintainer attention

Evidence basis: [Developer Tools card DT-03](../raw/developer-tools-problems.md). These mechanisms do not classify “AI slop” or guess authorship. They seek low-cost external observations of project understanding, change behavior, and future maintenance risk while preserving a path for legitimate newcomers.

### 3.1 Ask for one falsifiable demonstration of repository understanding

> Because the system derives the single repository-specific prediction or repair task that most sharply distinguishes a maintained contribution from a superficially plausible patch, the maintainer no longer has to reconstruct every contributor's understanding before deciding where to spend review time, which changes first-pass review from prose inspection into a falsifiable observation, measured by maintainer minutes per ultimately accepted contribution and false deferral of good newcomers.

- **Required inputs and authority:** The pull request, repository history, contribution policy, relevant tests and issues, and maintainer-defined boundaries for a fair challenge. The contributor must see why the challenge is relevant and can answer, decline, or appeal; the result prioritizes review but cannot auto-close the contribution.
- **Visible demo state change:** Two plausible patches arrive. For one, the system identifies an undocumented lifecycle constraint from history and asks the contributor to predict a sandboxed behavior after a one-line configuration change. The submitted prediction and resulting execution either align or expose a concrete misunderstanding. State changes from `unknown review cost` to `specific claim demonstrated / unresolved`.
- **External ground truth:** Actual sandbox execution, repository tests, maintainer assessment, eventual merge/revert history, and later maintainer participation. Evaluation compares fixed checklists, random questions, and the adaptive challenge under a fixed review-time budget.
- **Likely failure:** Challenges can become hazing, privilege insiders, waste contributor effort, or reward test gaming. The task must be minimal, relevant to the submitted change, accessible, and optional; maintainers must monitor newcomer false-negative rates.
- **Why GPT-5.6 is structural:** Latent-intent recovery from issues, history, conventions, and the proposed change plus counterexample discovery yields a change-specific challenge. The model cannot certify the answer: real execution and maintainer judgment do. If repository rules can express the same check statically, the static check should replace it.

### 3.2 Stress the contribution with plausible future maintenance events

> Because the system generates project-grounded future changes that should be routine—such as a neighboring API evolution, configuration addition, or supported-platform variation—and executes the contribution against them, the maintainer no longer has to imagine all ways a locally correct patch could externalize future cost, which changes maintainability review into observed adaptation behavior, measured by failures on held-out historical changes and post-merge repair burden.

- **Required inputs and authority:** Repository history, release and migration patterns, architecture boundaries, supported environments, the proposed branch, and disposable sandboxes. The system may mutate only an isolated environment and must explain the historical basis of each scenario.
- **Visible demo state change:** A patch passes current CI. The system recovers three common evolution patterns from old releases, applies one unseen neighboring change, and the patch now breaks while the baseline adapts. The failure is shown as an actual build/runtime observation tied to a realistic maintenance event, not an AI review comment.
- **External ground truth:** Replayed historical changes held out from scenario generation, deterministic builds/tests, subsequent issue and revert data, and maintainer labels of scenario plausibility.
- **Likely failure:** Generated futures may be fanciful, encode outdated conventions, or punish deliberate architectural change. The output is evidence for discussion, not an accept/reject score, and scenario provenance must be inspectable.
- **Why GPT-5.6 is structural:** The nontrivial step is discovering semantic evolution patterns and synthesizing cross-file environment perturbations from long repository history; hosted shell and bounded tools then produce external observations. This is not ordinary unit-test generation: the intervention changes the surrounding project context, and success is measured against real future or withheld historical changes.

### 3.3 Buy the cheapest external fact that resolves reviewer disagreement

> Because independent searches assess project fit, behavioral correctness, maintenance burden, and user value from different evidence, then request or execute the minimum external observation that resolves their disagreement, the maintainer no longer has to give every plausible submission the same full first-pass review, which changes scarce attention allocation into evidence-directed review, measured by valid merges and avoided regressions per maintainer hour at a fixed newcomer acceptance rate.

- **Required inputs and authority:** The contribution, project roadmap and issues, code/history, CI access, and a capped sandbox budget. Each search role has a distinct evidence scope. The maintainer defines the utility trade-off and always controls closure, merge, and contributor-facing language.
- **Visible demo state change:** Four independent views agree that code compiles but disagree on whether a behavior duplicates a rejected design. Instead of averaging scores, the mechanism finds that replaying one old issue scenario will discriminate the claims, runs it, and updates the disagreement with a real result. The maintainer receives one decisive observation rather than four reviews.
- **External ground truth:** Tool execution, linked decisions/issues, maintainer action, later bug/revert data, and controlled measurements of time spent. Preserved disagreement is part of the record.
- **Likely failure:** Role separation can be fake, project documentation can be stale, and optimizing historical maintainer choices may entrench bias against new approaches. A “none of the available checks resolves this” state is required.
- **Why GPT-5.6 is structural:** Independent adversarial search plus Programmatic Tool Calling can identify and purchase a high-information observation across code, history, and runtime. The new feedback loop is experiment selection, not multi-agent commentary. A generic priority classifier is the baseline it must beat.

## 4. Hourly-pay discrepancy proof

Evidence basis: [Work card 3](../raw/work-and-productivity-problems.md). These mechanisms create a shared, auditable calculation and facts; they do not provide autonomous legal determinations.

### 4.1 Compile policy and events into an executable pay ledger

> Because the system converts wage policies, rates, schedules, time-clock events, approved edits, and pay-stub lines into a provenance-linked executable calculation, the worker no longer has to compare screenshots and totals by hand, which changes “my pay looks wrong” into a reproducible discrepancy, measured by agreement with payroll specialists and recovered or corrected amounts.

- **Required inputs and authority:** Pay policy, collective agreement where applicable, jurisdiction and effective dates, schedule/time-clock export, edit audit log, pay stub, and the worker's independently retained records. The model may extract candidate rules; a deterministic calculator executes them. No legal conclusion is automatic.
- **Visible demo state change:** A pay stub total appears plausible. The compiled ledger replays each shift, exposes a manager edit and a missed overtime transition, and lets the viewer change the disputed event to see the exact total update. Every number links to a source or an explicit assumption.
- **External ground truth:** Payroll specialist or labor-agency adjudication, signed time records, statutory test cases, and corrected payroll. Held-out cases compare the compiled calculation with hand-coded jurisdiction-specific calculators.
- **Likely failure:** Policies can be ambiguous, exemptions are fact-intensive, records can be forged or missing, and jurisdictional rules change. Any unsupported rule must block a final total or display a range.
- **Why GPT-5.6 is structural:** GPT-5.6 is needed, if at all, to reconcile heterogeneous prose, images, messages, and temporal records and emit a typed candidate rule set with source spans. Arithmetic and rule execution remain deterministic. If a payroll export plus conventional rules engine covers the case, that simpler system wins.

### 4.2 Intersect two parties' timelines without producing a verdict

> Because the system aligns worker-held and employer-held records into event-level claims and identifies the smallest disputed facts that explain the pay difference, the parties no longer have to argue from incompatible totals, which changes a broad allegation into a bounded set of confirmable events, measured by disputes resolved, time to resolution, and events remaining genuinely contested.

- **Required inputs and authority:** Worker screenshots/messages, employer schedule, clock and edit audit logs, pay calculation, source ownership, and rules for selective disclosure. Each party approves what it shares; the system cannot label either party deceptive.
- **Visible demo state change:** Two totals differ by $186. The mechanism shows that 31 of 33 events agree; one meal-break edit and one shifted rate explain the entire delta. When an authenticated edit log arrives, only one event changes state from `contested` to `confirmed`, leaving the other unresolved.
- **External ground truth:** Authenticated source-system logs, signed corrections, mediator or agency outcomes, and subsequent payment. Reconciliation quality is measured at event level, not by fluent explanation.
- **Likely failure:** The stronger party may refuse records, authentication may be unavailable, and a tidy timeline may conceal retaliation or systemic misclassification. Missing employer evidence must remain an asymmetry, not be imputed.
- **Why GPT-5.6 is structural:** Distributed evidence reconciliation must match semantically equivalent events across timestamps, screenshots, messages, and payroll terms while preserving provenance and uncertainty. Programmatic calls can join records at scale. A database join is the baseline and should replace the model when schemas already align.

### 4.3 Intercept the causal discrepancy before payroll closes

> Because the system maintains a longitudinal expected-pay state and tests each schedule, clock, rate, and approval change against that state before payroll finalization, the worker and payroll operator no longer have to discover discrepancies after money moves, which changes retrospective proof into pre-pay correction, measured by confirmed discrepancies corrected before payday and false interventions per payroll cycle.

- **Required inputs and authority:** Live or staged schedule/time-clock/payroll events, effective policies, employee consent, and a narrow authority to request confirmation—not to alter time or pay. Both parties see the exact causal event and source.
- **Visible demo state change:** A manager moves a shift across a week boundary. The expected-pay state falls despite unchanged hours; the system identifies the policy-sensitive transition and asks for confirmation before close. A verified correction restores the expected total, producing an observable prevented discrepancy.
- **External ground truth:** Final payroll, authenticated edits, worker confirmation, and subsequent correction records. A prospective pilot compares flagged cycles with matched historical cycles.
- **Likely failure:** Live access may be unavailable, expected pay may be wrong for exceptions, alerts may be ignored, and employers could misuse worker-side data. The system must cap interventions and expose every assumption.
- **Why GPT-5.6 is structural:** Longitudinal state reasoning can connect informal approvals and exception messages to structured time events; bounded tool execution can request confirmation at the causal moment. Deterministic payroll validation remains central, so model leverage disappears in clean standardized systems.

## 5. Transfer-credit truth before commitment

Evidence basis: [Education card 3](../raw/education-problems.md). A registrar's official evaluation remains authoritative. The mechanisms improve pre-decision evidence, expose uncertainty, and seek earlier binding facts; they cannot promise that credits will transfer.

### 5.1 Compile institutional prose into an executable degree audit

> Because the system extracts dated course, equivalency, residency, major, prerequisite, and aid rules into a source-linked executable model and applies the student's actual record, the student no longer has to translate “credit accepted” into “requirement satisfied” manually, which changes a vague transfer estimate into a reproducible degree-path claim, measured by agreement with later official audits and error bounds on remaining semesters and cost.

- **Required inputs and authority:** Official catalogs and articulation agreements with effective dates, program and residency rules, transcript and course descriptions, intended major, enrollment load, and an institution-provided test corpus if available. The model extracts candidate rules; a deterministic degree-audit engine evaluates them. Every result is marked unofficial until the registrar confirms it.
- **Visible demo state change:** Twenty-seven credits initially appear “accepted.” When major and sequencing constraints execute, only eighteen apply and one prerequisite creates an extra term. Clicking the result reveals the exact rule, date, and transcript item; changing majors re-executes the plan rather than asking for a new summary.
- **External ground truth:** Official registrar evaluations, archived policy versions, expert-coded degree audits, and the student's actual enrollment/graduation path. Held-out historical cases test rule extraction separately from execution.
- **Likely failure:** Policies may be unpublished, discretionary, stale, or internally inconsistent; course equivalence may require faculty judgment. The mechanism must produce ranges and `requires authority` states rather than false precision.
- **Why GPT-5.6 is structural:** Long-context semantic extraction is useful for converting heterogeneous prose, tables, PDFs, and course descriptions into typed rules with provenance. The calculation must remain deterministic. If an institution exposes a complete current degree-audit API, GPT-5.6 adds little and should not sit in the path.

### 5.2 Reveal which decision is fragile, not just which path looks cheapest

> Because the system searches for the smallest plausible policy, equivalency, schedule, or major-assumption changes that alter time-to-degree, then simulates those changes in the executable audit, the student no longer has to commit based on one brittle point estimate, which changes institution comparison into a resilience-aware decision, measured by calibration of predicted cost/time ranges against official outcomes.

- **Required inputs and authority:** Executable audits for candidate institutions, tuition and aid limits, course schedules, uncertainty labels, personal constraints, and registrar-confirmed facts. The system may explore counterfactuals; the student owns the values and final decision.
- **Visible demo state change:** Two institutions both show four remaining terms. Counterexample search finds that one plan becomes six terms if a single disputed course is rejected or offered off-cycle, while the other remains four to five. The visible state changes from a ranked list to a decision map showing which unresolved fact can reverse the choice.
- **External ground truth:** Later official evaluations, actual course availability, enrollment records, and calibration of predicted intervals. A simpler Monte Carlo simulation over manually encoded rules is the baseline.
- **Likely failure:** Generated counterfactuals can be implausible, tuition and schedules change, and a risk display can overwhelm rather than reduce decision cost. Only evidence-backed uncertainties should enter the search.
- **Why GPT-5.6 is structural:** Counterexample discovery can infer semantically meaningful failure modes from policy text and historical exceptions instead of perturbing numbers arbitrarily. Programmatic calls can evaluate many bounded scenarios. The model proposes plausible interventions; the deterministic audit supplies outcomes.

### 5.3 Close only the unknowns that can change the enrollment decision

> Because the system computes which unresolved equivalencies can change graduation time or aid exposure, gathers the minimum supporting evidence for those equivalencies, and maintains state through an authorized registrar response, the student no longer has to contact every office about every course, which changes late blanket evaluation into targeted pre-commitment certainty, measured by decision-sensitive credits officially resolved before deposit or enrollment deadlines.

- **Required inputs and authority:** The counterfactual audit, transcript, syllabi and learning outcomes, institution contact/appeal rules, deadlines, and the student's explicit authority to draft and send a pre-evaluation request. Only an official institutional response can change `unresolved` to `confirmed` or `rejected`.
- **Visible demo state change:** Of twelve uncertain courses, the system proves that ten cannot affect the graduation date. It requests evidence only for two pivotal courses, drafts two source-backed questions, sends after approval, and updates the degree path when a registrar's signed response arrives. The important change is fewer consequential unknowns, not more documents.
- **External ground truth:** Registrar or faculty determinations, message receipts, deposited/enrolled status, and eventual official audit. Evaluation includes the number of unnecessary requests avoided.
- **Likely failure:** Institutions may refuse pre-evaluation, responses may be nonbinding, and the optimization may miss a personally important non-time outcome. The student must be able to declare additional pivotal constraints.
- **Why GPT-5.6 is structural:** The loop combines semantic evidence assembly, counterfactual decision sensitivity, bounded communication tools, and longitudinal authority state. Pure workflow automation cannot decide which unknown is causally pivotal; a pure chat answer cannot obtain the authoritative state transition.

## 6. Lossy manufacturing design intent

Evidence basis: [Work card 4](../raw/work-and-productivity-problems.md). A licensed or responsible engineer remains the only authority that can release or revise design intent. Deterministic geometry, tolerance, CAM, and inspection tools remain the oracles for their respective computations.

### 6.1 Prove ambiguity by constructing two compliant but incompatible interpretations

> Because the system searches for two materially different manufacturing interpretations that both satisfy the visible model and drawing, then validates each with deterministic geometry and tolerance tools, the machinist no longer has to argue that a specification “looks ambiguous,” which changes latent ambiguity into a concrete pre-cut engineering decision, measured by confirmed ambiguities found before setup and avoided scrap or rework.

- **Required inputs and authority:** Native CAD/PMI, drawings, tolerance standards, material/process notes, machine and inspection capabilities, and read-only access to deterministic solvers. The system may generate interpretations in a sandbox; an engineer alone resolves intent.
- **Visible demo state change:** The source package initially appears releasable. The mechanism produces two rendered parts or tool paths that both satisfy the encoded constraints yet lead to incompatible assembly behavior. One engineer clarification eliminates an interpretation and changes the release state from `ambiguous` to `signed intent`.
- **External ground truth:** CAD/tolerance solver results, engineer disposition, CMM inspection, assembly fit, and later scrap/rework records. Seeded omissions and historical RFIs provide a benchmark.
- **Likely failure:** The search may invent impossible processes, misunderstand standards, or create noisy theoretical ambiguity with no functional consequence. Deterministic validation and a materiality threshold are mandatory.
- **Why GPT-5.6 is structural:** Original-detail multimodal inspection can jointly reason over visual geometry, annotations, prose standards, and process context; counterexample discovery proposes semantically distinct interpretations. GPT-5.6 never validates geometry itself—the solver and engineer do. Ordinary static checking is the baseline.

### 6.2 Propagate a released intent change through heterogeneous downstream artifacts

> Because the system identifies the semantic consequence of an approved design revision across CAM setup, inspection plan, supplier instruction, work order, and local copies, then verifies each affected artifact's revision state, the team no longer has to hunt for every representation manually, which changes a signed design change into synchronized executable intent, measured by stale affected artifacts at release and revision-caused nonconformances.

- **Required inputs and authority:** Approved revision and rationale, product lifecycle records, CAM and inspection artifacts, supplier/work-order documents, lineage metadata, and bounded read/write tools. The engineer approves the impact set; each owning system controls its update.
- **Visible demo state change:** A tolerance revision changes one feature. Static file lineage finds three descendants; semantic inspection finds a fourth inspection instruction with a different identifier. After owner-approved updates, each artifact changes from `possibly stale` to `verified against revision`, with execution or signature evidence.
- **External ground truth:** System revision IDs, successful CAM/inspection validation, owner signatures, shop-floor retrieval logs, and nonconformance records. Historical revision incidents test recall.
- **Likely failure:** Lineage can be absent, semantic similarity can overflag, proprietary formats can be unreadable, and automated edits can be dangerous. The safe output is an impact claim requiring owner validation, not silent rewriting.
- **Why GPT-5.6 is structural:** Distributed evidence reconciliation and latent-intent matching are needed when identifiers and schemas do not align across visual, textual, and structured artifacts. Programmatic Tool Calling can traverse authorized systems and verify state. A conventional PLM dependency graph is the baseline and should handle explicit lineage.

### 6.3 Recover recurring tacit constraints as falsifiable hypotheses

> Because the system mines prior RFIs, redlines, accepted parts, inspection failures, scrap causes, and engineer responses for recurring conditions absent from the formal package, then asks an engineer to confirm the smallest reusable constraint, the machinist no longer has to rediscover the same tribal rule through interruption or failed work, which changes tacit intent into an explicit versioned contract, measured by repeated RFIs eliminated and engineer-confirmed constraints that predict held-out dispositions.

- **Required inputs and authority:** Historical revisions, RFI answers, nonconformance and scrap records, accepted inspection results, part-family metadata, and engineer review. The system can propose a hypothesis with counterexamples; only an engineer can publish it into a standard or template.
- **Visible demo state change:** Five past jobs contain differently worded clarifications about a datum setup. The mechanism proposes one conditional constraint, finds a sixth case that would violate an overbroad version, and narrows it. An engineer signs the scoped rule, which then catches the same omission in a new package.
- **External ground truth:** Engineer approval, held-out RFI outcomes, inspection and scrap data, and recurrence after deployment. Rejected hypotheses remain visible to prevent relearning them.
- **Likely failure:** History can encode obsolete practice or survivorship bias, similar parts may have different functional intent, and workers may be blamed for undocumented rules. Provenance, effective dates, scope, and human authority are essential.
- **Why GPT-5.6 is structural:** Latent-intent recovery over long multimodal history plus adversarial counterexample search can turn repeated examples into a falsifiable conditional contract. A frequency miner is the non-model baseline; GPT-5.6 must add semantically correct scope, not merely summarize RFIs.

## 7. Repository-level interaction risk from agent changes

Evidence basis: [Developer Tools card DT-02](../raw/developer-tools-problems.md). The target is not whether one pull request passes review. It is behavior that emerges among changes, histories, and architectural assumptions no single contribution owns.

### 7.1 Search combinations in an empirical integration sandbox

> Because the system infers likely semantic overlap among concurrent or recent changes, selects high-information branch combinations and merge orders, and executes them in isolated repositories, the maintainer no longer has to assume that individually green changes compose, which changes repository integration from post-merge discovery into observed interaction behavior, measured by seeded and real interaction defects found per compute budget and post-merge regressions.

- **Required inputs and authority:** Candidate branches and recent merges, repository history, dependency and ownership metadata, existing tests, build/runtime access in disposable sandboxes, and a fixed experiment budget. The system cannot merge or rewrite production branches.
- **Visible demo state change:** Three changes pass alone. Semantic-overlap inference selects two of six possible pairs rather than testing blindly. One order passes and the reverse order corrupts a generated migration fixture. The repository state changes from three isolated green checks to one reproducible cross-change failure with the earliest divergent observation.
- **External ground truth:** Actual build, test, migration, and runtime results; seeded interaction faults; later post-merge incidents; and comparison with exhaustive combinations on smaller repositories.
- **Likely failure:** Existing or generated workloads may not expose the interaction, combination search can explode, and overlap inference can miss distant coupling. The output must report untested space explicitly.
- **Why GPT-5.6 is structural:** Programmatic Tool Calling can orchestrate bounded combination experiments and reduce their results; long-context semantic reasoning prioritizes interactions beyond static imports. External execution supplies truth. A dependency-only combinatorial scheduler is the baseline.

### 7.2 Turn each accepted change's assumptions into a longitudinal contradiction surface

> Because the system extracts falsifiable behavioral assumptions from the diff, issue, tests, review, runtime examples, and neighboring history and keeps them linked across later changes, the maintainer no longer has to remember why earlier local choices were safe, which changes architectural drift into an explicit contradiction at the change that introduces it, measured by confirmed assumption conflicts caught before merge and reduction in rediscovery during review.

- **Required inputs and authority:** Change intent, review discussion, tests, code/history, architecture decisions where available, and maintainer validation of consequential inferred assumptions. The system may propose or retire claims; it cannot silently make inferred intent normative.
- **Visible demo state change:** An earlier change carries a source-backed assumption that cache keys are tenant-local. Months later, a separately green optimization makes them process-global. The mechanism shows the exact claim collision and runs one targeted cross-tenant experiment. A maintainer then confirms, scopes, or rejects the old assumption.
- **External ground truth:** Maintainer confirmations, targeted execution, historical incident labels, and future changes that should or should not trigger. Evaluation separates retrieval of written rules from recovery of truly latent assumptions.
- **Likely failure:** Inferred intent can fossilize accidental behavior, flood maintainers with claims, or privilege the past over valid redesign. Every inferred contract needs provenance, confidence, scope, expiry, and an inexpensive reject action.
- **Why GPT-5.6 is structural:** Latent-intent recovery and longitudinal state reasoning across code, prose, behavior, and time make the contradiction surface possible. The claim becomes useful only when a real experiment or human authority resolves it. Static architecture rules are the baseline for explicit invariants.

### 7.3 Generate ecosystem changes, not more tests of the current change

> Because the system synthesizes plausible neighboring changes from repository evolution patterns and lets independent agents attempt them against the accepted change in a sandbox, the maintainer no longer has to wait for a future contributor to reveal the interaction boundary, which changes local correctness into evidence about evolvability, measured by failures on withheld historical evolutions and subsequent integration repair cost.

- **Required inputs and authority:** Long repository history, release/migration patterns, issue roadmap, accepted change, and bounded agent/sandbox access. Generated neighboring changes cannot enter the real repository; their basis and distance from observed history must be visible.
- **Visible demo state change:** A new abstraction passes all current tests. One independent path evolves a common configuration dimension; another adds a sibling implementation. Only the second exposes a hard-coded global assumption. The demo shows the actual future-change diff, failing behavior, and causal interaction—not a hypothetical review comment.
- **External ground truth:** Withheld real historical evolutions, deterministic builds/runtime, maintainer plausibility labels, and future merge data. Model-generated tests alone do not count.
- **Likely failure:** The futures may be unrealistic, expensive, or biased toward past change shapes; an intentionally narrow abstraction may be unfairly penalized. The mechanism reports a stress observation, never a generic maintainability score.
- **Why GPT-5.6 is structural:** Multi-agent divergence searches materially different evolution directions; long-context code reasoning creates coherent cross-cutting interventions; bounded execution makes the result falsifiable. Ordinary TDD tests a stated present contract, while this loop experimentally exposes unstated interaction contracts through changes to the surrounding ecosystem.

## 8. MCP tool-space interference

Evidence basis: [Developer Tools card DT-04](../raw/developer-tools-problems.md). This is the least validated surface in the set. A mechanism advances only if it predicts held-out failures in real user tasks, not merely produces a cleaner tool list.

### 8.1 Differentially minimize a failing tool composition

> Because the system replays a real failed task across controlled tool subsets, descriptions, and orderings and minimizes the configuration difference that changes the externally scored outcome, the developer no longer has to debug agent-tool composition by trial and error, which changes an anecdotal failure into a reproducible interference relation, measured by held-out task recovery, experiment count, and false attribution rate.

- **Required inputs and authority:** A reproducible task, model/client/version, tool schemas and responses, sanitized execution trace, deterministic success criteria, and isolated tool sandboxes. Experiments receive only task-scoped credentials and cannot affect production.
- **Visible demo state change:** A task succeeds with four tools and fails after a fifth legitimate tool is added. Programmatic experiments reduce dozens of possibilities to a collision between two descriptions, reproduce the wrong call, apply a minimal description/visibility change, and restore the same externally measured task outcome.
- **External ground truth:** Deterministic task completion, exact tool-call traces, side-effect assertions, repeated trials across seeds/model versions, and held-out tasks. The model being debugged cannot grade success.
- **Likely failure:** Behavior may be stochastic, replay may not match live state, minimization can mistake correlation for cause, and the result can overfit one prompt/model version. Confidence intervals and repeated interventions are required.
- **Why GPT-5.6 is structural:** Programmatic Tool Calling can orchestrate and reduce many behavioral experiments while retaining long task context. Semantic reasoning proposes high-information description and namespace interventions. Classical delta debugging is the strong baseline; GPT-5.6 must reduce experiments or expose semantic interference that subset minimization misses.

### 8.2 Expose authority and tools only when the task reaches the relevant state

> Because the system compiles the user's evolving intent into an inspectable capability-and-authority contract and reveals only the tools needed for the current state, expanding access only after an external outcome check fails, the agent no longer has to choose among every installed capability at every step, which changes maximal ambient tool space into staged dependable execution, measured by end-to-end task success, unnecessary tool exposure, wrong-tool calls, and blocked legitimate actions.

- **Required inputs and authority:** User goal, allowed sources/actions, tool metadata, task state, credential scopes, stopping rules, and independent outcome checks. The contract is shown to the user; expansion of consequential authority requires approval.
- **Visible demo state change:** A task begins with fifteen installed tools but only two visible read tools. After an authenticated record is found, the state permits one write tool; after a receipt confirms completion, that authority expires. In an A/B replay, the full tool set selects a semantically similar wrong action while staged exposure completes the task.
- **External ground truth:** Tool traces, permission denials, task-specific assertions, receipts, and repeated benchmark tasks. Evaluation includes cases where the hidden tool was actually necessary.
- **Likely failure:** Intent inference may hide a needed capability, repeated expansion can add friction, and a compromised model might manipulate the state description. A deterministic policy engine owns authority; the model only proposes the current semantic need.
- **Why GPT-5.6 is structural:** Latent-intent recovery and longitudinal state reasoning map a natural-language task into a changing minimal tool surface; tool search can load capabilities just in time. Static per-role tool sets are the baseline. The mechanism is unjustified if a fixed allowlist performs equally well.

### 8.3 Use isolated shadow plans as a canary before a consequential call

> Because independent execution planners receive deliberately different minimal tool views and a consequential action proceeds only when their predicted tool, arguments, and expected external state agree—or a harmless probe resolves the disagreement—the user no longer has to discover tool-space interference after side effects occur, which changes silent misselection into a pre-action observable conflict, measured by prevented wrong calls, false blocks, and agreement calibration against actual task outcomes.

- **Required inputs and authority:** The current task state, candidate consequential tools, isolated planner contexts, dry-run or read-only probes, expected postconditions, and a policy that defines which actions require canaries. Planners cannot execute the consequential action.
- **Visible demo state change:** With two similarly described tools present, one shadow plan selects a repository action and another selects an issue action. The system does not vote or explain away the conflict; it performs a read-only identity probe, resolves the namespace, and only then enables the intended call. The visible transition is `unsafe disagreement` to `externally resolved agreement`.
- **External ground truth:** Dry-run responses, resource identities, action receipts, rollback-free task assertions, and labeled historical near misses. The metric penalizes both missed dangerous disagreement and unnecessary blocking.
- **Likely failure:** Multiple planners can share the same confusion, extra calls add cost and latency, harmless probes may not exist, and agreement can still be wrong. High-impact actions should remain user-confirmed even after agreement.
- **Why GPT-5.6 is structural:** Multi-agent isolation is used to expose—not average away—semantic tool ambiguity, and bounded tool execution purchases an external fact when plans diverge. A deterministic namespace/type checker is the baseline; GPT-5.6 matters only for ambiguities that survive schema-level checks.

## Cross-mechanism observations

Several mechanisms converge on a deeper pattern without becoming the same product concept:

1. **Generate an experiment, not an answer.** The most defensible loops produce a probe, counterexample, sandbox intervention, or evidence request whose result is externally observable.
2. **Authority is a state transition.** A generated letter, inferred rule, or plausible explanation never changes consequential state. A receipt, signed decision, deterministic execution, or authorized human does.
3. **The model proposes; a different system observes.** Geometry solvers, build/runtime results, official audits, pay calculations, transfer tasks, authenticated records, and human authorities prevent circular self-grading.
4. **Uncertainty should cause targeted action.** The useful output is often the cheapest fact that would resolve a consequential disagreement, plus an explicit `unresolved` state if that fact is unavailable.
5. **The best short demonstration is before/after causality.** A hidden ambiguity becomes two incompatible valid parts; a green branch set becomes a reproducible interaction failure; an opaque denial becomes a criterion whose missing fact is retrieved; an assisted learner either transfers the skill unaided or does not.

## Most promising mechanisms from this independent pass

These are hypotheses to test, not a final ranking:

- **6.1, dual compliant manufacturing interpretations:** unusually visual, externally validated, and not reducible to a prompt or summary.
- **1.3, observed capability handoff:** a broad but coherent causal primitive that refuses to generate the consequential human decision; its major risk is validation and surveillance.
- **7.1, empirical cross-change interaction search:** directly instantiates the emerging repository-level problem and yields real runtime evidence; its evidence base is recent.
- **2.1 plus 2.3, denial evidence closure and receipt-backed procedural state:** severe, well evidenced, and causally complete, but high-stakes boundaries and fragmented access are formidable.
- **5.2 plus 5.3, transfer decision fragility followed by targeted authoritative closure:** it changes a pre-enrollment decision rather than merely summarizing policy; institutional cooperation is the critical unknown.
- **8.1, differential tool-composition minimization:** the cleanest GPT-5.6-native technical demonstration, but the weakest proven user urgency.

Every one should still be killed if its non-model or prompt-only baseline produces the same external state change, if a live competitor already closes the loop, or if representative users reject the authority and effort assumptions.
