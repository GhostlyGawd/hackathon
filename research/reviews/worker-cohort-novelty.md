# PW-2 audit: worker-governed private cohort pay reconciliation

**Audit date:** 2026-07-19
**Decision:** **RESHAPE. Remove PW-2 from the hackathon finalist set in its current form.** Preserve it as a partner-led product hypothesis, not a new category claim.

## Bottom line

PW-2 addresses a real problem, but its direct causal contribution is narrower than the current pitch implies. It can change a discrepancy from **one worker's hard-to-interpret record** into **a repeated pattern that a worker organization can review**. It cannot itself establish hours worked, decide that a deduction was unlawful, compel payroll correction, prevent retaliation, or recover wages. Those outcomes require source corroboration and an advocate, employer, agency, arbitrator, or court.

The strongest purported novelty—locally derived transformation patterns, thresholded cohort release, and worker-controlled disclosure—is a useful combination, but not a defensible new product category:

- The worker-led **Shipt Calculator** already used OCR on worker pay records, computed a counterfactual pay transformation, pooled contributions for organizing, and withheld some comparisons until both per-worker and metro-level sample thresholds were met.
- **FairFare** already combines worker-organization co-design, consented payroll ingestion, aggregate pay analysis, and organizer-facing evidence for advocacy.
- **Worker Info Exchange** already aggregates worker data into collective stores/data trusts for pay and working-condition analysis, union support, and litigation.
- **WageWatch** already compares schedules and paycheck images, flags automatic-break and other pay discrepancies, connects workers to legal help, and markets coworker joining for group or class claims.
- **Salary Confidential** already ships cryptographic invitations, batched threshold release, anti-triangulation information design, and equal access to results for contributors.

I did not find a deployed product that exactly matches *typed pay-event transformations across coworkers without centrally collecting raw wages*. That residual may be a valuable implementation feature. It is not enough to support “a revolutionary new category,” and the privacy layer is mostly secure aggregation/differential privacy plus labor-organizing governance rather than a new technical primitive.

## The exact outcome it changes

The honest causal chain is:

> heterogeneous worker-held records → candidate event normalization → deterministic reconciliation → privacy-tested recurrence signal → worker-approved advocate packet → external review → possible correction or recovery

PW-2 directly owns only the middle of that chain.

| Outcome | Does PW-2 cause it? | External truth or authority required |
| --- | --- | --- |
| A worker understands an apparent mismatch | Partly | Pay rule, schedule, time record, paystub, and arithmetic |
| Multiple records exhibit the same normalized transformation | Yes, if inputs are authentic and genuinely comparable | Independent source bundles plus deterministic matching |
| The pattern is safe to disclose | Not from a count threshold alone | Formal threat model, privacy proof/audit, organizer policy, and each worker's consent |
| A credible case reaches an advocate faster | Plausibly; this is the best product outcome to test | Worker-center or union workflow |
| The mismatch is a legal violation | No | Qualified advocate, agency, arbitrator, or court |
| Payroll is corrected or wages recovered | No, not without adoption and action | Employer/payroll authority, settlement, or enforcement |
| Retaliation is prevented | No | Legal protection, operational security, and organizational power |

The primary success metric should therefore be **time and evidentiary quality from first discrepancy to advocate-accepted cohort case**, followed by correction/recovery as a downstream outcome. “AI detected wage theft” would be an invalid claim.

## Substitute and prior-art audit

### 1. Shipt Calculator: the closest mechanism precedent

The peer-reviewed Shipt Calculator was built with worker organizers to audit a black-box pay change. It accepted screenshots, used OCR, gave workers individual feedback, pooled organizer data, and found that more than 40% of participating workers received an unannounced pay cut. Its `PAY` calculation compared actual pay with the former published formula—a concrete **input-to-output transformation**, not merely a raw salary average. It released personal analysis after ten shops and metro comparisons only when at least ten other workers were present. Workers could download or delete their records. See the [MIT project overview](https://www.media.mit.edu/projects/the-shipt-calculator-crowdsourcing-gig-worker-pay-data-to-audit-algorithmic-management/overview/) and the [CSCW paper](https://www.dcalacci.net/papers/Calacci%20and%20Pentland%20-%202022%20-%20Bargaining%20with%20the%20Black-Box%20Designing%20and%20Deplo.pdf).

This is direct prior art for four PW-2 claims: worker-led inquiry, document extraction, counterfactual pay transformations, and thresholded cohort comparison. Its central database and comparatively weak privacy design leave room for improvement, but cryptographically upgrading that architecture is a feature-level advance.

### 2. FairFare: collective evidence already changes organizing work

FairFare is a worker-organization-co-designed system for consented payroll ingestion and aggregate rideshare-pay analysis. It reports that its data informed bill language and organizer arguments; Colorado ultimately enacted fare-transparency requirements, although the paper appropriately does not claim the tool alone caused the law. The same research documents worker concern about platform retaliation, subpoenas, third-party data access, and the difficulty of recruiting enough participants. See the [FairFare paper](https://hci.princeton.edu/wp-content/uploads/sites/459/2025/05/FairFare.pdf).

FairFare is strong evidence that the intended causal mechanism—turn anecdotes into group evidence that organizers can use—is real. It is simultaneously evidence that PW-2 enters an established worker-data-collective field and inherits its trust, recruitment, and retaliation barriers.

### 3. Worker Info Exchange: data trusts, aggregation, and collective action

Worker Info Exchange explicitly seeks collective stores of worker data for evaluating pay, work allocation, and performance management; its privacy policy says it aggregates workers' data to give workers and unions collective insight into pay, working time, utilization, and work quality. It combines individual mandates/consent, data access, investigations, worker representatives, and strategic litigation. See [WIE's current model](https://www.workerinfoexchange.org/) and its [privacy policy](https://www.workerinfoexchange.org/privacy-policy).

This substantially occupies the governance thesis. “Worker-governed aggregation for bargaining and redress” is not white space. PW-2's narrower residual is automated discovery of repeated typed transformations without first centralizing raw records.

### 4. WageWatch: direct current product adjacency

WageWatch's July 2026 Play listing says it compares entered schedules and pay rates with paycheck photos; flags underpayments, missed overtime, and unpaid breaks; connects users to legal help; and lets coworkers explore group or class-action claims. Its listing also says the app collects personal and financial information and may share certain metadata with third parties. See the [current Google Play listing](https://play.google.com/store/apps/details?id=com.wagewatchapp.wagewatch).

PW-2 can still differ on local processing, pattern-level cohort corroboration, and worker-organization governance. It cannot credibly claim that individual reconciliation plus coworker escalation is new.

### 5. Salary Confidential: threshold release and anti-triangulation already ship

Salary Confidential is not a wage-theft product, but it is highly relevant mechanism prior art. It uses single-use cryptographic invitation tokens, releases responses in batches of three or more without timestamps, separates attributes to reduce triangulation, and gives contributors access to the same result. See its [privacy-by-construction product description](https://www.salaryconfidential.com/).

This defeats a broad novelty claim around “private worker cohort data becomes visible after a safe threshold.” The new object in PW-2 is a transformation signature rather than a salary statistic. That object may actually be *more* identifying because it can encode a specific manager, shift, location, date range, or pay-rule change.

## Is transformation-pattern comparison genuinely new?

**As a schema: somewhat. As a category or technical primitive: no.**

A transformation such as `worker-confirmed no-break shift → 30-minute deduction` is more actionable than “three workers were underpaid.” It preserves the hypothesized mechanism and can help an advocate distinguish a repeatable system behavior from heterogeneous individual complaints. That is the best idea inside PW-2.

But the full construction is composed of known pieces:

1. local document extraction and normalization;
2. deterministic reconciliation or counterfactual calculation;
3. private set/count intersection or secure aggregation;
4. minimum-cell suppression or differential privacy;
5. consent and worker-data-collective governance;
6. advocate-led group action.

Shipt already computed pay transformations and sample-thresholded comparisons. WIE and FairFare already pool worker data for collective evidence. Salary Confidential already uses thresholded, anti-triangulation disclosure. The residual novelty is the **typed transformation signature and its provenance-bearing case packet**. That is likely protectable product design and potentially useful IP, but it is not evidence of a new market category.

## GPT-5.6 necessity

**Verdict: useful, not necessary; currently a hackathon weakness.**

GPT-5.6 can do work that conventional payroll calculators handle poorly:

- reconcile multilingual and visually inconsistent schedules, texts, handwritten notes, paystubs, and policy documents;
- propose a common typed event schema across different payroll systems;
- cite the source span for each extracted field;
- search for benign alternative explanations such as different break policies, job codes, locations, or shift premiums;
- produce a minimal, redactable advocate packet from a long evidence history.

However, the Shipt Calculator demonstrated the core loop with OCR, a published formula, and ordinary software. Arithmetic, signature verification, thresholding, private aggregation, privacy budgets, and release policy must remain deterministic. A smaller extraction model or rules engine may be sufficient for many W-2 payroll formats. The valuable system behavior comes from **collective evidence and governance**, not from GPT-5.6.

There is also an unresolved architectural contradiction. “Records stay local” is incompatible with sending raw pay documents to a hosted GPT-5.6 endpoint. OpenAI says API inputs are not used for training by default, but standard API abuse-monitoring logs may retain customer content for up to 30 days; Zero Data Retention requires approval and changes feature availability. See [OpenAI's API data controls](https://platform.openai.com/docs/models/default-usage-policies-by-endpoint). A credible design must either:

- run non-model OCR/redaction locally and send only a minimal, de-identified candidate schema to GPT-5.6 under approved retention controls; or
- explicitly obtain consent for hosted processing and stop describing the reconciliation as local/private.

The first option is safer but further reduces GPT-5.6's necessity. Do not hide this tradeoff.

## Privacy and retaliation threat model

The proposed `k = 3` story is unsafe. A threshold is a release rule, not a privacy proof.

### Fatal or near-fatal risks

1. **Employer auxiliary knowledge.** The employer already possesses the roster, shifts, manager edits, and payroll events. A released pattern such as “three night-shift workers under manager X had a 30-minute deduction on July 12” may identify all three even if no wage is shown.
2. **Intersection and differencing attacks.** Repeated queries by location, week, manager, job code, or cohort can reveal who joined or which record changed. Threshold-crossing timing itself leaks participation.
3. **Small-cohort privacy/utility collision.** Useful workplace cohorts are often tiny. Adding enough noise or generalization to protect participants can erase the exact repeated transformation an advocate needs. NIST notes that stronger privacy degrades utility and that noise disproportionately affects small groups; in the extreme it is impossible to disclose an accurate one-person fact while protecting that person. See [NIST SP 800-226](https://doi.org/10.6028/NIST.SP.800-226).
4. **Secure aggregation is not output privacy.** Encryption or MPC can stop a coordinator from reading individual inputs, but it does not limit what an employer can infer from the released pattern. NIST distinguishes security/access control—who can access data—from differential privacy—what can be learned from outputs.
5. **Endpoints and metadata.** Phones, screenshots, push notifications, account recovery, invitation graphs, advocate communications, and cloud logs can expose organizing activity even if the aggregate computation is sound. FairFare's field work found that privacy and retaliation fears were already barriers to adoption.
6. **Sybil and poisoning attacks.** An employer, supervisor, or hostile participant can add fake records, probe whether a pattern is near threshold, or create a false recurrence. A document image is not proof of origin.
7. **Irreversible release.** A worker can delete a private contribution, but cannot retract a pattern already learned by other participants or an advocate. “Consent to each disclosure” needs a final synchronized release ceremony, not a settings toggle.
8. **Pattern mismatch and disparate error.** Different contracts, locations, job codes, exemptions, premiums, and break rules can make visually similar deductions legitimate or incomparable. The model may collapse meaningful differences and create a false group accusation.

Legal protection is necessary but not sufficient. The NLRB says covered employees may discuss wages and act together, and the Department of Labor prohibits retaliation for protected wage complaints, but DOL also recognizes that fear of retaliation chills reporting. See the [NLRB wage-discussion guidance](https://www.nlrb.gov/about-nlrb/rights-we-protect/your-rights/your-rights-to-discuss-wages) and [DOL retaliation guidance](https://www.dol.gov/agencies/whd/retaliation). A product should not promise that encryption prevents retaliation.

### Minimum safety bar

No deployment should proceed without all of the following:

- governance and threat-model ownership by a paid worker-center or union partner;
- prespecified queries and cohort definitions, not an open-ended pattern browser;
- an independently reviewed privacy design with a total query budget;
- user-level, not event-level, privacy accounting;
- minimum-cell suppression plus output generalization and anti-differencing controls;
- independent source authentication and poisoning resistance;
- no employer-facing discovery endpoint and no automatic employer contact;
- explicit pre-release consent from every contributor whose evidence enters a packet;
- an advocate-held decryption key and documented subpoena/device-compromise response;
- clear abstention when privacy and evidentiary utility cannot both be satisfied.

## External truth and affected-user authority

### Ground truth hierarchy

1. **Source facts:** original paystubs, contemporaneous time records, schedules, messages, CBA/policy versions, and immutable hashes. No single worker-held artifact automatically proves hours worked.
2. **Reconciliation truth:** deterministic arithmetic with a versioned rule and cited inputs. GPT output is a proposal, never the ledger.
3. **Recurrence truth:** independently sourced records pass the same canonical predicate after benign alternatives are checked. Recurrence does not prove illegality.
4. **Case truth:** a worker advocate or qualified attorney accepts, rejects, or requests more evidence.
5. **Outcome truth:** payroll correction, employer admission, agency finding, settlement, award, or judgment.

Model confidence and cross-agent agreement are not ground truth.

### Who must control what

- **Each worker:** collection, local inspection, correction of extracted facts, participation, and final disclosure consent.
- **Worker organization:** threat model, cohort/query definitions, privacy budget, release recipient, case workflow, and stop conditions.
- **Independent privacy reviewer:** verifies the protocol and attacks its releases using realistic employer knowledge.
- **Advocate/agency/court:** determines legal relevance or violation.
- **Employer/payroll authority:** makes a voluntary correction; otherwise enforcement supplies authority.

Without a worker organization as a co-owner—not a future “advisor”—the project has no legitimate product authority and should be killed.

## Strongest three-minute demo

The best demo is a **threshold plus adversary** story, not a wage-theft chatbot:

1. Three isolated synthetic worker vaults each ingest a different evidence bundle: schedule image, timeclock export, text exchange, and paystub.
2. GPT-5.6 proposes the same typed transformation—`confirmed no-break shift → 30-minute deduction`—with citations and an alternative benign explanation. A deterministic verifier accepts the arithmetic and source coverage but does not label it illegal.
3. Worker one and worker two contribute blinded signatures. The shared state remains `INSUFFICIENT COHORT`; no count, identity, or raw wage appears.
4. Worker three contributes. A naive `k = 3` release is deliberately attacked using a simulated employer roster. The system shows that manager/date detail would re-identify the cohort and **refuses the unsafe release**.
5. The protocol generalizes the public signal to a privacy-safe form. All three workers then approve a one-time encrypted release of the source-cited detailed packet to a worker-center key.
6. The visible final state is `ADVOCATE ACCEPTED FOR REVIEW`, not `WAGE THEFT PROVEN`. One forged fourth record is rejected to show provenance and poisoning resistance.

That demo is technically credible and ethically honest. It also reveals the candidate's problem: the memorable innovation is privacy engineering and governance around an already-known worker-data-collective workflow, with GPT-5.6 serving as an evidence normalizer.

## Decisive experiment

Run a pre-registered retrospective study with one worker center or union using closed multi-worker pay cases, followed by a prospective shadow-mode pilot. Compare ordinary individual intake against the cohort engine.

### Dataset and controls

- authentic, consented, closed-case evidence from multiple payroll systems;
- attorney/organizer adjudication made independently of model output;
- a mix of true repeated practices, legitimate heterogeneous rules, one-off errors, weak records, and forged/poisoned inputs;
- a realistic employer adversary given roster, schedule, payroll, manager, and location data;
- matched baseline using OCR/rules plus a human organizer, so GPT-5.6's incremental contribution is measured rather than assumed.

### Primary measures

- precision and recall of advocate-confirmed repeated transformations;
- organizer minutes from intake to a reviewable multi-worker case;
- false linkage of workers with legitimately different rules;
- re-identification success under realistic auxiliary information and repeated-query attacks;
- worker comprehension, willingness to participate, and willingness to release;
- advocate acceptance, requests for more evidence, payroll corrections, recovery amount, and time to correction;
- GPT-5.6 incremental lift over OCR/rules on extraction accuracy and organizer time.

### Precommitted kill criteria

Kill or fundamentally redesign if any of these occurs:

- privacy protection strong enough for the partner's threat model destroys useful small-cohort pattern detection;
- a realistic employer adversary can re-identify contributors materially better than the agreed bound;
- organizers do not trust the protocol enough to use its output, or workers will not contribute comparable records;
- it does not reduce organizer review time or improve advocate acceptance versus ordinary intake;
- GPT-5.6 adds no meaningful lift over OCR/rules or introduces unacceptable false grouping;
- corroborated patterns do not improve correction/adjudication outcomes.

This experiment, not another competitor scan or interface prototype, is the next decision point.

## Hackathon ceiling versus standalone viability

### Hackathon

**Ceiling: medium, with a high implementation score but a capped idea score.** Real MPC/differential privacy, adversarial testing, provenance, and a clean threshold-state demo could be impressive. The problem and human impact are strong. But judges can reasonably say:

- “This is WageWatch plus private coworker aggregation.”
- “The Shipt Calculator already did the worker-led counterfactual pay audit.”
- “Secure aggregation and minimum-cell release are established techniques.”
- “The model parses documents; worker organization and cryptography create the outcome.”

Without a real worker-organization partner and an external evaluation, a privacy/safety claim would look like theater. A synthetic demo can prove implementation behavior, not affected-user safety or impact. PW-2 therefore should not be the first-place bet from the current finalist pool.

### Standalone product

**Viability: plausible as infrastructure inside an existing worker organization; weak as a solo direct-to-worker startup.** A worker center, union, plaintiff-side practice, or worker-data trust already has trust, recruitment, case authority, and a reason to pool evidence. The transformation compiler could reduce intake cost and surface multi-worker cases earlier. As a consumer app, PW-2 faces a cold-start network, high-stakes security liability, expensive jurisdiction/rule maintenance, no authority to correct payroll, and the possibility that a single breach exposes organizing activity.

The best standalone position is therefore:

> a worker-organization-owned, privacy-audited **cohort evidence compiler** that turns consented individual records into typed, source-cited recurrence candidates for an existing case workflow.

That is narrower, more defensible, and more likely to help. It is also a B2B/NGO feature category, not the broad revolutionary product currently implied.

## Final decision

**RESHAPE.** Keep the typed transformation witness and adversarial privacy test. Drop the claims that thresholding makes disclosure safe, that the product detects wage theft, that raw records can stay local while GPT-5.6 reads them, and that worker-governed pay aggregation is white space.

For this hackathon selection process, **do not advance PW-2 unless a worker organization agrees to co-own the threat model and the candidate beats its decisive experiment**. On present evidence, its real-world value is more credible than its novelty, while its privacy and authority burdens are substantially higher than the pitch suggests.
