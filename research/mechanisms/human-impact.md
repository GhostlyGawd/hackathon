# Human-impact causal mechanism tournament

Research snapshot: 2026-07-19. This round covers six high-evidence surfaces in Education, Apps for Your Life, and Work and Productivity. It generates mechanisms, not product names, and deliberately ignores build-time feasibility.

The bar is stricter than “use AI to help.” A mechanism must change an incentive, the timing of a consequential decision, the provenance available to the weaker party, or observable human behavior. It must preserve the authority of registrars, educators, employers/payroll administrators, consumer-reporting agencies, clinicians, and insurers rather than silently replacing them with a model.

## Competitive facts that constrain the search

Current public product and policy pages establish that several obvious shapes are already occupied:

- Khan Academy already describes Khanmigo as a tutor that uses hints and questions rather than completing work, and in May 2026 reported measuring **next-item correctness without Khanmigo** as an independent-transfer outcome. A “tutor that withholds answers” or an immediate follow-up item is therefore not white space. [Khanmigo guidance](https://support.khanacademy.org/hc/en-us/articles/13860282793869-What-are-the-Community-Guidelines-for-Khanmigo), [Khan Academy's current evaluation account](https://blog.khanacademy.org/how-khan-academy-is-building-a-better-ai-tutor-our-most-recent-learnings/)
- Turnitin Clarity records drafting, paste events, AI-chat use, and process playback as “proof of process.” More process telemetry is not mastery evidence and is a crowded, surveillance-prone direction. [Turnitin Clarity student guide](https://guides.turnitin.com/hc/en-us/articles/36982699236877-Getting-Started-with-Turnitin-Clarity-for-Students)
- Transferology currently reports institution-evaluated course matches, misses, and unevaluated “maybes”; MyPath2ASU provides institution-specific, major-linked pathways. Common App still distinguishes unofficial pre-application guidance from a registrar's official evaluation. The residual gap is not catalog matching but a comparable, authoritative commitment before deposit. [Transferology](https://transferology-support.collegesource.com/article/51-how-to-use-will-my-courses-transfer), [MyPath2ASU](https://admission.asu.edu/apply/transfer/MyPath2ASU), [Common App transfer guidance](https://www.commonapp.org/transfer/)
- DOL offers a worker timesheet and recommends workers keep their own records. Employer time systems already advertise audit histories, approvals, and tamper-evident records; ChronoSeal is an especially close current example. A personal time tracker or ordinary audit log is not a category. [DOL recordkeeping](https://beta.dol.gov/policy-regulations/pay-benefits/wages-hours/recordkeeping), [ChronoSeal](https://chronoseal.eu/)
- Tenant-screening disputes are generally opened after adverse action. TransUnion describes source verification and correction; CFPB says an investigation generally has 30 days and that the landlord need not preserve the original housing opportunity. Better dispute prose does not fix that timing. [TransUnion dispute process](https://www.transunion.com/client-support/rental-screening-disputes), [CFPB adverse-action guidance](https://www.consumerfinance.gov/ask-cfpb/what-should-i-do-if-my-rental-application-is-denied-because-of-a-tenant-screening-report-en-2105/)
- CMS now requires specific prior-authorization denial reasons for covered payers and, beginning principally in 2027, APIs that expose requirements and exchange requests and responses. Appeal generators and provider-side denial-management products already draft, track, learn from outcomes, and advertise upstream prevention. The residual health-insurance opportunity must occur before patient harm and must differ from provider revenue-cycle optimization. [CMS-0057-F summary](https://www.cms.gov/newsroom/fact-sheets/cms-interoperability-and-prior-authorization-final-rule-cms-0057-f), [Claimable](https://www.getclaimable.com/), [Orbion's claimed feedback loop](https://www.orbionhealth.com/)

Vendor pages above prove only that a substitute is offered and how it describes itself, not that it works. This was a bounded public scan, not a patent, procurement, or private-product search; “no exact substitute found” is not a nonexistence claim.

## Evaluation convention

Each mechanism is stated as:

> Because the system does **M**, the user no longer has to do **W**, which changes outcome **O**, measurable by **K**.

“External ground truth” means an observation the model did not author: an independently scored transfer task, an educator-authored validator, a registrar-signed degree audit, signed source events, an adjudicated correction, or a payer/clinician decision. If no such observation is available, the valid output is **unknown**, not a confident estimate.

---

## 1. Assisted performance versus independent learning

The controlled evidence supports a bounded claim: unrestricted assistance can raise immediate performance while reducing later unassisted performance in the studied setting. The intervention therefore must measure what happens **after assistance is gone**, not how polished the assisted work looks.

### AP-1 — Capability escrow

**Mechanism.** Treat completion of an AI-assisted task and evidence of capability as two different states. The learner can use any permitted assistance and finish the immediate task. From the assistance trace and task structure, the system proposes which cognitive operations may have been offloaded. After a teacher-configured delay, it presents one near-transfer and one far-transfer performance event drawn from a teacher-approved generator or validated item bank. “Capability settled” is issued only from the independent result; the original task can remain complete even when capability is unknown or not yet demonstrated.

This is not a tutor. It need not generate an answer, restrict help, expose the learner's prompt history to an instructor, or judge the polished artifact.

> Because the system **separates assisted task completion from delayed independent capability settlement**, the learner no longer has to **infer learning from the fact that the assisted task went well**, which changes **illusory competence into an observed transfer result**, measurable by **near-transfer, far-transfer, delayed retention, and confidence-calibration deltas against a no-escrow baseline**.

- **Named-substitute gap:** Khanmigo's next-item correctness is an immediate, same-platform transfer signal. Existing learning modes change how the assistant responds. Capability escrow is tutor-agnostic, delayed, includes far transfer, and changes the status object from “completed” to “completed / capability unsettled / capability settled.” The gap is meaningful but narrow.
- **External ground truth:** Deterministic answers or executable consequences for bounded domains; teacher-authored rubrics and blinded human scoring for open domains. GPT-5.6 may propose the skill decomposition and transfer candidates but may not certify mastery.
- **Authority and data:** The learner or school controls the assistance receipt. An educator approves objectives, delay, accommodations, validators, and stakes. Only the minimum offloaded-operation summary should leave the learner's device; raw prompts are not required for the educator-facing result.
- **Affected-user validation:** Preregister a comparison with learners, including learners who use assistive technology or AI as an accommodation. Measure delayed near/far transfer, retention, confidence calibration, time-on-task, anxiety, and subgroup effects. Practice completion and satisfaction are secondary only.
- **Under-three-minute state change:** A learner completes a polished solution with assistance; the interface explicitly shows “task complete, capability provisional.” A previously scheduled transfer event is opened; an independent action either settles the capability or leaves it unknown. The visible object changes without an authorship score or narration.
- **Failure and abstention:** If there is no valid independent transfer item, if the objective is underspecified, or if accommodations make the comparison invalid, the system says “capability not measured.” Failure on one probe is not a disciplinary conclusion.
- **GPT-5.6 structural leverage:** Long-context reasoning over the task, assistance events, objective, and prior performance; counterexample discovery to produce genuinely different transfer cases; structured output for an inspectable claim-to-probe map; and independent agents to challenge whether a probe merely repeats the original surface form. The scoring path remains external.
- **Why it may still be a feature:** An LMS, Khan Academy, or an AI assistant can add delayed transfer checks and provisional mastery states. A standalone category exists only if the cross-tool settlement object and evaluation protocol become portable and more valuable than an embedded feature.

### AP-2 — Calibration stake

**Mechanism.** Before closing an AI-assisted task, the learner privately forecasts the probability that they can solve a defined related task without help after a delay. A proper scoring rule settles a non-grade stake—choice of next practice, recovery of learning time, or access to optional challenge material—against independent performance. The product rewards accurate self-knowledge, not bravado or abstaining from help. It does not generate an answer and does not disclose the forecast to a teacher by default.

> Because the system **makes a private prediction about future independent performance settle against a real later observation**, the learner no longer has to **trust the feeling of fluency produced by assistance**, which changes **uncalibrated confidence into behavior informed by measured uncertainty**, measurable by **Brier-score improvement, voluntary practice choices, delayed transfer, and persistence**.

- **Named-substitute gap:** Confidence ratings and reflection prompts exist, while tutor guardrails control answer delivery. The difference is a longitudinal, properly scored commitment tied to a later independent event rather than a reflection form or an assistant refusal.
- **External ground truth:** The same independent validators required by AP-1. The model cannot decide whether its own forecast was justified.
- **Authority and data:** Learner-owned forecast, educator-approved task family and stakes, no grade or discipline use. A school must not reinterpret low confidence as low ability.
- **Affected-user validation:** Compare forecast calibration and subsequent practice choices with ordinary confidence prompts. Co-design stakes with learners so that disability, test anxiety, and risk tolerance are not punished.
- **Under-three-minute state change:** The learner predicts 90% after an assisted success; a delayed variant produces an incorrect independent result; the calibration receipt visibly changes and the learner selects additional practice. The product does not need to show an AI response.
- **Failure and abstention:** No stake when a task is not comparable, the learner declines, or the outcome cannot be scored independently. Never turn an inaccurate forecast into misconduct evidence.
- **GPT-5.6 structural leverage:** It maps heterogeneous assistance into candidate latent operations and searches for transfer cases that break superficial pattern matching. A deterministic scoring rule, not GPT-5.6, settles the forecast.
- **Why it may still be a feature:** The core may be a small metacognitive mechanic inside AP-1 or an LMS. The “stake” can read as gamification rather than a new capability and may optimize score calibration without improving learning.

### Pairwise decision: AP-1 over AP-2

AP-1 directly changes the false causal proxy—assisted completion no longer implies learning—and has an outcome the cited experiment makes meaningful. AP-2 more sharply targets the finding that learners did not perceive the decrement, and it is the cleaner answerless intervention, but its effect on learning is indirect and its incentive can distort behavior. Keep AP-2 as a component experiment; advance AP-1.

---

## 2. Submission quality versus mastery

The safe target is not authorship. The target is whether an institution can support a specific capability claim with an observation independent of the submitted artifact.

### SM-1 — Executable evidence contract

**Mechanism.** Before an assignment is released, the educator specifies the learning claims and what external observations could falsify each claim. GPT-5.6 adversarially attempts the assignment with AI and identifies claims the final artifact cannot establish. The educator then signs a two-channel contract: the artifact can earn credit for the product it is, while mastery credit can only be settled by predeclared observable consequences embedded in normal future work—code tests, simulation decisions, source-to-claim moves, lab measurements, or blinded human scoring. The system stores the evidence boundary, not an authorship probability.

> Because the system **compiles each learning claim into a predeclared, externally observable evidence contract**, the educator no longer has to **treat artifact polish or process telemetry as proof of mastery**, which changes **a grade based on a proxy into a capability claim with a visible support boundary**, measurable by **agreement with independent performance, dangerous false-mastery rate, teacher review time, and student contestability**.

- **Named-substitute gap:** Turnitin Clarity captures process; assessment-redesign guidance tells instructors to test prompts against current models; emerging assessment platforms promise rubric-backed performance. The gap is an executable contract whose evidence source is declared **before** submission and whose “unsupported” state survives even when the artifact earns a high mark.
- **External ground truth:** Educator-authored validators, physical/simulation consequences, or blinded scorers. The model may red-team the assignment and propose observations but cannot award mastery.
- **Authority and data:** Educator owns the learning objective and evidence rule; learner sees and can contest it in advance. No keystroke history, hidden monitoring, or AI-use inference is required.
- **Affected-user validation:** Teachers and students jointly inspect whether the contract matches the intended objective. Validate false mastery and false non-mastery across disciplines and accommodations; separately measure teacher workload and whether students alter learning behavior.
- **Under-three-minute state change:** A polished AI-capable submission satisfies the product rubric, but two capability claims remain unsupported. The learner performs a predeclared simulation action; one claim settles and one remains unknown. The artifact is never labeled “AI.”
- **Failure and abstention:** If a learning objective has no defensible observable consequence, the contract must expose that assessment-design gap. Open-ended judgment stays with named human scorers.
- **GPT-5.6 structural leverage:** Independent adversarial agents search for shortcut strategies and counterexamples; long context joins assignment, rubric, past work, and objective; structured output produces a claim-observation graph. This leverage is real only if the final validator is independent.
- **Why it may still be a feature:** This can be absorbed into an LMS or assessment authoring suite. If the “contract” only produces different quiz questions, it is ordinary assessment generation and fails the tournament.

### SM-2 — Randomized mastery audit

**Mechanism.** At course start, the learner and educator see a cryptographically committed sampling policy: a small random subset of capability claims made by ordinary submissions will later be re-observed in brief, accessible performance events during normal class work. The event is not an oral defense and does not ask the learner to explain authorship; it asks them to manipulate a system, solve an isomorphic problem, select evidence, or create a bounded artifact. Sampling rather than universal re-examination makes independent evidence scalable and changes the incentive across all submissions.

> Because the system **randomly re-observes a predeclared sample of claimed capabilities in independent performance**, the institution no longer has to **retest every student or trust every take-home artifact**, which changes **unscalable verification into bounded assessment assurance**, measurable by **teacher minutes per validated claim, false-mastery discovery, learner burden, and subgroup fairness**.

- **Named-substitute gap:** Assignment-grounded written quizzes and oral checks already exist; random program-level sampling is also established for assessment research. The difference is a student-visible, claim-level assurance protocol integrated with AI-permitted coursework, not a quiz generator.
- **External ground truth:** Same as SM-1, with the sample seed and validators committed before seeing individual outcomes.
- **Authority and data:** Institution sets stakes and sampling rate with accommodations and appeal. Sampling cannot be targeted by model suspicion, writing style, disability, language, or AI-use telemetry.
- **Affected-user validation:** Measure whether sampling changes misconduct, learning, anxiety, and teacher burden without disparate selection or failure. Student governance is necessary because an “audit” can feel punitive even when random.
- **Under-three-minute state change:** A cryptographic seed selects one of five claims; a 30-second practical action settles it; the course assurance state changes from “artifact observed” to “sample externally verified.” No answer is generated.
- **Failure and abstention:** Invalid or inaccessible probes are void, not failures. A sampled miss is evidence about the claim, not proof of misconduct or authorship.
- **GPT-5.6 structural leverage:** It can generate and adversarially diversify candidate performance events, but educator approval and external scoring are mandatory. Random selection and commitment are deterministic.
- **Why it may still be a feature:** The core is an assessment policy with software support. It could be a mode in an LMS, and cryptographic commitment may be ceremony if ordinary transparent sampling earns the same trust.

### Pairwise decision: SM-1 over SM-2

SM-2 changes incentives and scales better, but it risks recreating surveillance and high-stakes spot testing. SM-1 changes the epistemic object itself: an artifact and a mastery claim become separate, and unsupported claims stay visibly unsupported. Advance SM-1. Its strongest form can share a settlement layer with AP-1.

---

## 3. Transfer-credit truth before commitment

Better inference cannot make a nonbinding answer authoritative. The mechanism must cause the receiving institution to commit earlier or shift the cost of being wrong away from the student.

### TR-1 — Binding degree-offer exchange

**Mechanism.** A student submits one verified transcript, intended major, start term, and relevant constraints. GPT-5.6 reconciles catalogs, articulation records, residency rules, and degree requirements into a proposed requirement-level plan for each participating institution. It is explicitly a request, not a prediction. Each receiving registrar returns a digitally signed, versioned degree offer stating which requirements are satisfied, which remain, the expected semesters under stated assumptions, every unresolved item, and an expiration/event that triggers reevaluation. Institutions compete on comparable signed offers before the student pays a deposit.

> Because the system **turns transcript and major evidence into a comparable request that the receiving institution must sign, qualify, or decline before deposit**, the student no longer has to **infer degree applicability from course matches and unofficial advice**, which changes **post-commitment surprise into pre-commitment institutional accountability**, measurable by **offer-to-final-audit agreement, unresolved items disclosed before deposit, semesters/cost changed by later deviations, and response time**.

- **Named-substitute gap:** Transferology has evaluated matches and “maybes”; MyPath2ASU is a strong institution-specific pathway; Common App says only registrar evaluation is official. None of those public pages describes a cross-institution exchange of comparable, signed, major-specific remaining-degree offers before deposit.
- **External ground truth:** Registrar signature at offer time and the later official degree audit. GPT-5.6 does not award a credit.
- **Authority and data:** Official transcript, catalog/program version, declared major, residency and minimum-grade constraints, registrar/department authority for substitutions, and a signed change policy. An unsigned institution is shown as “no binding offer,” not ranked by a model estimate.
- **Affected-user validation:** Transfer students, registrars, department evaluators, financial-aid advisors, and community-college advisors must validate both meaning and decision use. Prospectively measure consequential false assurance and whether earlier offers change enrollment, borrowing, or time-to-degree.
- **Under-three-minute state change:** One transcript produces three proposed plans. One school signs a three-semester offer with two explicit unknowns; one signs four semesters; one declines to commit. The student changes from comparing nominal accepted credits to comparing authoritative remaining paths. A catalog change visibly invalidates only the affected clause rather than the whole answer.
- **Failure and abstention:** No signature means no certainty. Changed major, failed prerequisite, expired catalog, residency change, or discretionary exception is displayed as a scoped invalidation. The model may not silently fill a registrar's nonresponse.
- **GPT-5.6 structural leverage:** Programmatic tool calling joins transcript, course equivalencies, program rules, prerequisites, and catalog versions; long-context reasoning produces a requirement-level claim graph; independent agents challenge omissions and hidden prerequisite chains before the registrar sees the request. The authoritative act remains the signature.
- **Why it may still be a feature:** Common App, CollegeSource, an SIS vendor, or a state transfer network could add this. The defensible category is the multi-institution offer protocol and network, not the transcript parser.

### TR-2 — Degree-plan deviation bond

**Mechanism.** A participating institution attaches a limited financial guarantee to its signed offer. If the final official evaluation or required path deviates for a reason not listed in the offer and not caused by a disclosed student change, the institution supplies tuition credit, waives the unexpected course, or funds the extra course. GPT-5.6 reconciles the offer and later audit into a disputed clause, but a named human adjudicator decides eligibility.

> Because the system **prices and escrows the institution's own uncertainty**, the student no longer has to **bear the entire cost of an inaccurate pre-enrollment representation**, which changes **cheap vague guidance into an incentive for accurate early evaluation**, measurable by **bonded-offer adoption, covered deviations, resolution time, and unexpected student cost shifted back to institutions**.

- **Named-substitute gap:** Transfer admission guarantees generally guarantee admission, not major-level degree applicability. Elgin Community College currently offers a narrow sending-institution tuition refund when approved credits are refused under specified conditions; that proves the mechanism is possible but also means “transfer guarantee” is not novel. The residual gap is a receiving institution's guarantee of its own requirement-level offer. [ECC transfer guarantee](https://catalog.elgin.edu/student-resources/transfer-process/transfer-guarantee/)
- **External ground truth:** Signed offer, final registrar audit, actual course requirement and charged cost, plus human adjudication.
- **Authority and data:** Institution or regulated risk partner must hold the obligation; the model cannot issue insurance or decide a dispute. Exact exclusions must be readable before deposit.
- **Affected-user validation:** Students, registrars, general counsel, financial-aid staff, and consumer-protection experts. Measure whether institutions respond by improving accuracy or by narrowing eligibility and excluding high-risk students.
- **Under-three-minute state change:** A signed three-semester offer is compared with a later four-semester audit; the system isolates the undisclosed clause and releases a tuition credit after human confirmation.
- **Failure and abstention:** Ambiguous causation, student-initiated major changes, or missing authoritative documents route to adjudication. No automatic claim of breach.
- **GPT-5.6 structural leverage:** It maps semantic requirement changes across catalog versions and evidence, preserving provenance. The financial incentive and authority—not the model—do most of the causal work.
- **Why it may still be a feature:** This is primarily an institutional policy or insurance contract and has weak model-native necessity. Narrow guarantees already exist, and risk-bearing is a regulated, capital-dependent business.

### Pairwise decision: TR-1 over TR-2

TR-2 attacks institutional incentives more directly but fails the model-native screen more often and can cause risk selection. TR-1 creates the missing authoritative object while preserving explicit unknowns, and GPT-5.6 materially lowers the cost of producing and reviewing that object. Advance TR-1; treat a limited deviation remedy as a future adoption lever, not the initial mechanism.

---

## 4. Hourly-pay evidence asymmetry

The safe system can establish provenance and repeated discrepancies. It cannot infer that a mismatch is unlawful, intentional, or “wage theft.”

### PW-1 — Bilateral pay-event receipts

**Mechanism.** Every pay-affecting event—posted schedule, punch, manager edit, break deduction, rate change, tip allocation, correction—emits a tamper-evident receipt into both employer and worker custody. A text such as “stay until 11” or a photographed schedule can become a **proposed** event, but it remains unverified until the responsible party acknowledges it. Reconciliation runs before payroll closes; mismatches are contested at the event level rather than reconstructed from a final paystub.

> Because the system **gives both parties contemporaneous, signed custody of every pay-affecting event and reconciles them before close**, the worker no longer has to **reconstruct an employer-controlled calculation after payday**, which changes **late allegation into early event-level correction**, measurable by **pre-pay discrepancies resolved, unacknowledged edits, correction time, and payroll reruns avoided**.

- **Named-substitute gap:** DOL's timesheet is worker-entered; mainstream time systems and ChronoSeal advertise audit trails. The residual difference is bilateral custody across schedule, informal direction, time clock, and payroll—not simply an employer-accessible log. The scan found close adjacency, so the gap is modest.
- **External ground truth:** Cryptographic receipt signatures, source-system events, worker/manager acknowledgments, payroll output, and eventual corrected/adjudicated outcomes. A receipt proves what was recorded, not what law requires.
- **Authority and data:** Employer integrations are needed for authoritative events; workers retain an export independent of employment access. Union contracts and legal pay rules remain outside automatic truth unless encoded and approved by qualified authorities.
- **Affected-user validation:** Hourly workers, payroll administrators, worker centers, unions, and wage-and-hour counsel across tipped, split-rate, piece-rate, and multilingual settings. Measure retaliation concerns and whether workers can actually access/understand the receipt.
- **Under-three-minute state change:** A manager edits an eight-hour shift to six. Both parties receive the event receipt; reconciliation blocks silent close, the worker contests, and payroll corrects before payday. No legal label appears.
- **Failure and abstention:** Unintegrated, unsigned, or cash events remain “worker asserted” or “unverified.” The system never converts phone location or a text into authoritative work time without confirmation.
- **GPT-5.6 structural leverage:** Multimodal inspection and tool calls normalize schedules, messages, paystubs, and time events into a provenance graph; counterexample search finds events that do not reconcile. Signatures and arithmetic remain deterministic.
- **Why it may still be a feature:** Employee-visible edit history is a natural payroll/timeclock feature, and current vendors already market close variants. Employer participation is both the authority solution and the adoption barrier.

### PW-2 — Worker-governed private cohort reconciliation

**Mechanism.** Each worker can reconcile their own records locally. The system then performs privacy-preserving comparison of **transformation patterns**, not raw wages: for example, “a signed no-break shift repeatedly receives a 30-minute deduction” or “the same rate change appears after the same manager edit.” Nothing is labeled illegal. A pattern becomes visible to participants only after a minimum cohort threshold, and source evidence is disclosed to a chosen worker advocate, union, or payroll contact only with each participant's consent. This turns isolated, easily dismissed discrepancies into corroborated evidence without requiring workers to expose pay to one another.

> Because the system **privately detects repeated pay-event transformations across consenting coworkers and releases evidence only after a safe threshold**, each worker no longer has to **decide alone whether an opaque mismatch is idiosyncratic or repeated**, which changes **isolated weak evidence into a worker-governed corroborated case**, measurable by **repeated patterns independently confirmed, advocate review time, payroll corrections, false escalations, and participant/retaliation safety**.

- **Named-substitute gap:** DOL-Timesheet, OverPay, AuditPay, and current pay-audit apps focus on individual reconstruction. WageWatch's July 2026 listing explicitly mentions workers who want collective action, so the broader category is already emerging; the residual mechanism is thresholded, privacy-preserving, worker-governed pattern corroboration rather than an individual violation detector. [WageWatch listing](https://play.google.com/store/apps/details?id=com.wagewatchapp.wagewatch)
- **External ground truth:** Source receipts/paystubs, independently verified repeated transformations, payroll correction, DOL/advocate adjudication, or settlement. Cohort repetition is evidence of recurrence, not illegality.
- **Authority and data:** Workers authorize local extraction and each disclosure. A worker organization or payroll authority reviews escalated evidence. Strong encryption, small-cell suppression, deletion, and a threat model against employer discovery are prerequisites.
- **Affected-user validation:** Paid partnership with worker centers/unions and workers in precarious employment; do not recruit only salaried technologists with sample stubs. Measure comprehension, false pattern rate, organizer time, language access, retaliation exposure, and whether group evidence changes actual correction outcomes.
- **Under-three-minute state change:** Two private imports remain isolated and reveal nothing. A third consenting worker produces the same signed-event-to-paystub transformation; the state changes to “threshold met,” participants choose an advocate, and a source-cited pattern packet—not an accusation—is released.
- **Failure and abstention:** Small cohorts, heterogeneous pay rules, weak source provenance, or a re-identification risk remain private and unknown. No automatic employer contact, public accusation, or legal conclusion.
- **GPT-5.6 structural leverage:** Programmatic tool calling filters and joins heterogeneous private records; long context reconciles rate rules, schedules, and edits; independent agents search for alternative benign explanations before a thresholded pattern is presented. Privacy aggregation and thresholding must be deterministic and independently audited.
- **Why it may still be a feature:** This could live inside WageWatch, a union app, or worker-center case management. Network effects are severe, and the same cohort comparison that creates power also creates an unusually dangerous retaliation target.

### Pairwise decision: PW-2 over PW-1

PW-1 is preventive and easier to interpret, but current time systems are close and employer participation leaves the stronger party in control. PW-2 more directly changes the asymmetric evidence and bargaining structure and can begin from worker-held records. It also has the higher safety burden. Advance PW-2 only with worker-organization governance; otherwise advance neither.

---

## 5. Tenant-screening contestability

The decisive defect is often temporal: correction rights can be real while the unit disappears. Neither mechanism below declares a record accurate or a renter eligible.

### TS-1 — Contestable housing-decision window

**Mechanism.** Participating landlords and screening firms use a decision state machine. A materially adverse report cannot move directly to final denial. It first enters a short “contestable” state in which the applicant receives the exact report, the material entries, and a source-verification route; the unit or an equivalent-unit remedy is reserved for the stated window. The applicant can contest identity or currency, the CRA/source makes the authoritative correction, and the landlord reruns its own decision. The model organizes the interaction but never decides eligibility or accuracy.

> Because the system **pauses final adverse action and preserves the housing opportunity while the authoritative source verifies a material dispute**, the renter no longer has to **win a correction after the unit is gone**, which changes **a nominal right into a usable pre-loss remedy**, measurable by **pre-final corrections, same/equivalent units restored, time in contested state, false holds, and landlord participation**.

- **Named-substitute gap:** CFPB rights and CRA portals provide post-adverse-action disputes; portable reports can move review earlier but do not universally bind the landlord or preserve a unit. The missing state is an enforceable pre-final window, not another report viewer.
- **External ground truth:** CRA investigation result, source court/credit record, landlord's rerun decision, and lease outcome.
- **Authority and data:** Landlord must commit the unit/remedy; CRA/source controls correction; applicant controls consent. Legal counsel must define the window, adverse-action interaction, fair-housing requirements, and what “equivalent” means.
- **Affected-user validation:** Renters with adjudicated screening disputes, fair-housing groups, legal aid, landlords, and CRAs. Measure privacy, application delay, disparate impact, landlord avoidance, and whether a corrected report actually restores housing.
- **Under-three-minute state change:** A wrong-person eviction materially changes a score. Instead of “denied,” the application enters “contested / unit held”; the court source returns a mismatch, the CRA signs a correction, and the landlord reruns the application.
- **Failure and abstention:** If a landlord or CRA does not participate, the system cannot claim the opportunity is preserved. Unresolved disputes stay unresolved; it must not tell the applicant the record is false.
- **GPT-5.6 structural leverage:** It can reconcile multimodal reports, source records, notices, and identity attributes; tool calls can route the exact contested item; independent agents can search for alternative identity matches. The authoritative state changes come from the CRA and landlord.
- **Why it may still be a feature:** This is principally a contractual/regulatory state machine for application platforms. GPT-5.6 lowers coordination cost but is not the reason a unit is held.

### TS-2 — Item-level screening lineage receipt

**Mechanism.** A landlord may consume a screening recommendation only if every material item carries a signed lineage receipt: source, collection vendor, retrieval date, person-match basis, disposition/version, legal age window, and which landlord criterion used it. GPT-5.6 normalizes heterogeneous provenance and searches for contradictions, but an untraceable item is marked “unusable/needs verification,” not false. The mechanism changes evidence provenance at decision time rather than accelerating a later dispute.

> Because the system **requires material screening items to carry source- and match-level provenance before they influence a decision**, the renter no longer has to **reverse-engineer how an opaque recommendation was produced**, which changes **uncontestable scoring into item-level accountable evidence**, measurable by **lineage coverage, wrong-person/outdated items caught before adverse action, verification time, and false exclusion of valid records**.

- **Named-substitute gap:** An adverse-action notice identifies the reporting company, and TransUnion publicly lists some data vendors; neither public flow supplies an applicant with an item-level machine-readable chain from source and match to landlord criterion.
- **External ground truth:** Signed vendor/source assertions, court/credit records, CRA correction outcomes, and landlord decision logs.
- **Authority and data:** Screening firms and source vendors must emit the receipt; landlord criteria must be explicit; applicants require minimization and secure access. The model has no authority to exclude a record—policy or a named reviewer does.
- **Affected-user validation:** Same partnerships as TS-1, with special testing for common names, sealed/expunged records, identity theft, and racial/disability disparate impact.
- **Under-three-minute state change:** An opaque “reject” recommendation expands into three signed items; one public-record match lacks sufficient person-match provenance and the application changes to “verification required” before landlord action.
- **Failure and abstention:** Missing provenance produces “unverified,” not “inaccurate.” The interface must not expose sensitive irrelevant records or imply that a fully traceable record is fair or legally usable.
- **GPT-5.6 structural leverage:** Distributed evidence reconciliation, multimodal inspection, and contradiction search over heterogeneous source schemas. A deterministic schema and signatures carry the trust.
- **Why it may still be a feature:** It is a compliance/provenance feature natural to a CRA or property-management platform, and regulatory standards could absorb it. Without issuer participation it cannot be truthful.

### Pairwise decision: TS-1 over TS-2, but neither nominated

TS-2 makes contestability cheaper but does not preserve the lost opportunity. TS-1 attacks the actual harm by changing finality and timing. However, TS-1's causal power comes from the landlord/CRA covenant, not GPT-5.6, and affected-user plus legal validation is non-negotiable. Keep it as a strong policy/product hypothesis, not a top OpenAI-native nominee.

---

## 6. Health-insurance denial before care is lost

The current market already automates appeal drafting, denial tracking, and provider-side prevention. A mechanism must either close an acknowledged evidence loop before final denial or make an adjudicated reversal prevent recurrence. It may never infer coverage or medical necessity.

### HD-1 — Pre-denial evidence handshake

**Mechanism.** Before a payer finalizes a denial for missing or insufficient documentation, it issues a structured, criterion-level request. GPT-5.6 maps that request to candidate chart evidence but asks the authorized clinician to attest, correct, or decline each fact. The payer then signs which artifacts were received and considered and either requests another item, approves, or supplies its own specific reason. The patient does not shuttle ambiguous requests between organizations.

> Because the system **requires provider-attested evidence and payer acknowledgment to meet before a documentation denial becomes final**, the patient no longer has to **discover after denial that existing evidence was unseen or unmapped**, which changes **an open-loop handoff into a closed pre-decision exchange**, measurable by **documentation denials avoided, acknowledged evidence latency, repeat requests, final decision time, and unsafe mapping errors**.

- **Named-substitute gap:** CMS's 2027 API direction already includes documentation requirements, requests/responses, and specific reasons; CoverMyMeds and other authorization networks are adjacent. The residual is criterion-to-source acknowledgment of **evidence considered**, not mere electronic transmission. It is a narrow and regulation-sensitive gap.
- **External ground truth:** Signed clinician attestation, source EHR artifact, payer receipt/decision, and later review. The model cannot decide that a note meets coverage criteria.
- **Authority and data:** Provider and payer integrations, patient authorization, current plan/policy version, HIPAA-grade controls, and named clinical/benefit reviewers.
- **Affected-user validation:** Patients/caregivers, prior-authorization staff, clinicians, patient advocates, payers, and benefits counsel. Measure delayed care and patient burden, not only provider revenue or faster packet completion.
- **Under-three-minute state change:** Payer requests six weeks of therapy; the system locates a signed note, clinician attests the exact fact, payer acknowledges receipt, and the case changes from “denial pending—missing evidence” to a real payer decision.
- **Failure and abstention:** No signed clinical source means the fact remains missing. Conflicting notes route to clinician review. No coverage advice or direction to delay/proceed with care.
- **GPT-5.6 structural leverage:** Tool calling across policy, EHR, claim, and payer endpoints; long-context claim-to-evidence mapping with artifact citations; independent critique for missing or contradictory evidence. Human signatures close the loop.
- **Why it may still be a feature:** It is a likely extension of mandated prior-authorization APIs, EHRs, or existing networks, and drug/non-drug rules differ. Integration and institutional responsiveness may dominate model reasoning.

### HD-2 — Appeal-derived regression gate

**Mechanism.** Every closed appeal or external review becomes a versioned institutional error case: the initial decision conditions, evidence actually considered, final authoritative outcome, and reason for reversal. Before the same payer's future initial denial is finalized, independent agents search for cases that are materially similar **and** cases that defeat the similarity. A supported match does not approve coverage; it creates a mandatory human-review gate that asks the payer to distinguish the new case from its own prior reversal. The resulting signed distinction or correction becomes the next ground-truth event.

> Because the system **turns authoritative reversals into semantic regression cases that challenge similar future denials before release**, patients no longer have to **repeatedly discover the same institutional failure through separate appeals**, which changes **appeal outcomes from dead-end case closures into a prevention feedback loop**, measurable by **repeat reversals for the same reason, initial-denial correction before patient notification, mandatory-review precision, care-delay days, and subgroup effects**.

- **Named-substitute gap:** Claimable says it learns patterns from past cases to improve appeals; provider revenue-cycle platforms advertise denial-pattern feedback into future submissions. CMS requires aggregate metrics and specific reasons. The residual is payer-side or regulator-visible use of **authoritative reversals as pre-denial regression gates**, not provider-side claim scrubbing or a trend dashboard. No exact public claim was found in the bounded scan, but payer-internal systems are opaque.
- **External ground truth:** Closed insurer appeals, binding external reviews, court/regulator decisions where applicable, exact policy versions, and the new named human review. Similarity is not ground truth.
- **Authority and data:** Payer or regulator participation; deidentified case access with a re-identification threat model; policy/version lineage; clinical and benefits-review authority. A patient-facing app alone cannot impose the gate.
- **Affected-user validation:** Patients/caregivers, clinicians, advocates, payer medical directors, external reviewers, regulators, privacy experts, and groups disproportionately denied. Evaluate whether the gate reduces repeated harmful denials without encouraging policy gaming or extra review delay.
- **Under-three-minute state change:** A closed case shows “denied, then reversed because existing skilled-care evidence was overlooked.” A new proposed denial enters; one agent finds the semantic match, another finds a material difference, and a named reviewer must either distinguish it with cited evidence or correct it before release. The patient sees a real changed decision state, not an appeal letter.
- **Failure and abstention:** Low-quality, stale-policy, or non-comparable cases do not trigger. A match never asserts entitlement. Conflicting precedent is shown as disagreement and routed to expert review; emergency care cannot wait for the system.
- **GPT-5.6 structural leverage:** This is the strongest human-impact use of long-context longitudinal state, independent adversarial search, counterexample discovery, and programmatic joins across policy versions and case evidence. The model creates the missing feedback loop but a human authority makes the decision.
- **Why it may still be a feature:** Denial-prevention platforms already claim outcome feedback, so the technical shape can be absorbed. The differentiator depends on imposing the gate on the payer rather than optimizing provider submissions, which creates a buyer-incentive and data-access problem larger than the software.

### Pairwise decision: HD-2 over HD-1, but hold below the top three

HD-1 is tractable in the direction regulation already moves, which also makes it likely to become an incumbent feature. HD-2 has a genuinely new feedback loop and the strongest GPT-5.6 leverage, but the payer-side buyer is weak, private appeal data may be inaccessible, and public competitors already use outcome feedback on the provider side. Preserve HD-2 as a high-upside reserve. It advances only if a payer, regulator, or patient-advocacy data partner confirms that reversals are not already converted into pre-denial semantic regression cases.

---

## Cross-surface comparison

Ratings are directional, not a weighted average. **High authority friction** means the mechanism needs a powerful institution to change behavior; it is not a low score disguised as a feature.

| Mechanism | Evidence fit | Residual substitute gap | External truth | GPT-5.6 structural role | Authority friction | Demo state change | Main reason it is only a feature |
|---|---|---|---|---|---|---|---|
| AP-1 Capability escrow | Strong, direct controlled outcome | Medium-low | Strong in bounded domains | Strong | Low-medium | Excellent | Khanmigo/LMS can add delayed transfer settlement |
| AP-2 Calibration stake | Strong mechanism, indirect impact | Medium | Strong in bounded domains | Medium | Low | Excellent | A metacognitive mechanic inside AP-1 |
| SM-1 Executable evidence contract | Strong logical failure, narrower prevalence | Medium | Strong if predeclared | Strong | Medium | Excellent | LMS/assessment authoring mode |
| SM-2 Randomized mastery audit | Strong logical fit | Low-medium | Strong if precommitted | Medium | Medium | Excellent | Assessment policy with software support |
| TR-1 Binding degree-offer exchange | Strong triangulated problem | Medium-high | Excellent: registrar signature/final audit | Strong for proposal/reconciliation | High | Excellent | Common App/CollegeSource/SIS network feature |
| TR-2 Deviation bond | Strong problem, incentive hypothesis untested | Medium | Excellent | Weak-medium | Very high | Excellent | Policy/insurance contract, narrow precedent exists |
| PW-1 Bilateral pay-event receipts | Strong event, causal share undermeasured | Low-medium | Strong provenance | Medium-high | High | Excellent | Time/payroll systems already have close audit trails |
| PW-2 Private cohort reconciliation | Strong event, direct pattern hypothesis untested | Medium-high | Good with adjudication | Strong | Medium | Excellent | Union/pay-audit app feature; network and retaliation risk |
| TS-1 Contestable decision window | Strong mechanism, weak denominator | High | Excellent if CRA/landlord participate | Medium | Very high | Excellent | Contract/regulation does the causal work |
| TS-2 Lineage receipt | Strong mechanism, weak denominator | Medium | Strong provenance | Medium-high | Very high | Excellent | CRA compliance/provenance feature |
| HD-1 Evidence handshake | Strong | Low | Excellent if integrated | Strong | Very high | Excellent | CMS APIs and authorization networks are converging on it |
| HD-2 Appeal-derived regression gate | Strong | Medium, uncertain due private systems | Excellent if closed-case data exists | Exceptional | Very high | Excellent | Denial-prevention suites already claim adjacent learning loops |

## Nominations: at most three

### 1. Capability settlement protocol — combine AP-1 and SM-1

**Category thesis:** AI-era learning needs a settlement layer. An assisted artifact can be complete immediately, but a capability claim remains provisional until a delayed, independently scored transfer event settles it. The learner does not surrender raw prompt history, the model does not infer authorship, and the system does not need to withhold answers.

This unifies the strongest controlled problem evidence with the strongest safe assessment mechanism. It also yields the clearest three-minute story: the same polished submission can produce “task complete / capability unknown,” followed by an observable independent action that settles or does not settle the claim.

**Why nominate despite incumbents:** Khan Academy's current next-item measurement proves that independent transfer is becoming a serious product metric, but it is immediate and tied to one tutor. Turnitin's process capture proves that institutions are otherwise moving toward surveillance-prone proxies. A portable, privacy-preserving distinction between artifact completion and delayed capability settlement is a larger product thesis than either.

**Decisive falsifier:** If educators and learners see no value in a portable provisional/settled capability object beyond an LMS's ordinary mastery feature—or if validated far-transfer probes cannot be generated without prohibitive expert work—it is a feature, not a category.

### 2. Worker-governed private cohort reconciliation — PW-2

**Category thesis:** Individual pay auditing does not correct evidence asymmetry when the employer controls official records. Worker-governed, privacy-thresholded comparison can turn repeated transformations across separate pay records into corroborated evidence without declaring a legal violation or exposing everyone's wages.

It visibly changes power and evidence, not prose. The strongest demo does not say “AI found wage theft”; it shows that two isolated mismatches reveal nothing, a third independently sourced repetition crosses a safe threshold, and workers—not the model—choose whether an advocate receives the cited evidence.

**Why nominate despite emerging apps:** Current worker timesheets and paycheck auditors mostly reconstruct an individual case. WageWatch's explicit collective-action positioning means speed matters for novelty, but the privacy-preserving transformation-pattern mechanism and worker-governed release are materially different from an individual detector.

**Decisive falsifier:** If worker organizations say cohort comparison creates unacceptable retaliation/re-identification risk, if coworkers cannot supply comparable source records, or if corroborated patterns do not shorten adjudication or correction, do not build it.

### 3. Binding degree-offer exchange — TR-1

**Category thesis:** Transfer marketplaces compare institutions before commitment, but they compare nonbinding course equivalencies. A degree-offer exchange uses model reasoning only to lower the cost of a requirement-level proposal; the receiving institution must sign, qualify, or decline it. The product's value is earlier authority and comparable uncertainty.

This is the cleanest mechanism for solving the authority fatal flaw rather than hiding it. Its state change is memorable: “97% course match” becomes a signed number of remaining semesters, named unresolved requirements, and an expiration clause—or an honest refusal to commit.

**Why nominate despite pathways:** MyPath2ASU shows institution-specific pathways are valuable, while Common App's own guidance confirms the official/unofficial divide. The residual category is a multi-institution market in authoritative remaining-degree offers, not another estimator.

**Decisive falsifier:** If registrars cannot or will not issue time-bounded pre-deposit commitments even when the model reduces review work, there is no independent product. The problem remains real but is not software-addressable without policy change.

## Reserve, not discarded

**HD-2 appeal-derived regression gate** is the highest-upside reserve because its feedback loop is unusually model-native and can prevent harm before the patient receives a denial. It is held below the nominations only because current denial-management vendors already claim adjacent outcome-to-prevention loops and the necessary payer-side data and enforcement authority are least accessible.

**TS-1 contestable housing-decision window** is the strongest answerless Apps mechanism and the cleanest intervention on timing. It is held because a landlord/CRA covenant produces most of the value; GPT-5.6 is useful but not structurally indispensable.

## What must happen before product ideation

For each nominee, one affected-user and one authority-side interview must test the decisive falsifier before interface ideation:

1. learners and educators: would “completed but capability unsettled” change behavior without becoming surveillance or a second grade?
2. worker center/union and hourly workers: can private cohort evidence be gathered, understood, governed, and acted on safely?
3. registrar/transfer staff and transfer students: can a scoped, expiring, requirement-level pre-deposit signature be operationally and legally meaningful?

The winner should then be chosen on observed willingness to change behavior, not on which mechanism makes the most cinematic prototype.
