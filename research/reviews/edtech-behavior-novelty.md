# Focused novelty audit — contract-to-behavior procurement gate for school apps

Research snapshot: 2026-07-19.

## Verdict

**RESHAPE. Do not advance the concept as an automated compliance gate.** Advance only the narrower **district DPA behavior-regression tripwire**: an authorized district replays named student and teacher journeys in a synthetic tenant, deterministically records what those journeys exposed, and puts an existing approval on hold when a new run produces a witnessed contradiction or loses required observability. A human privacy officer or counsel owns the procurement decision.

This is a real, consequential problem and the proposed mechanism can change an institutional state rather than produce a plan. It is not a new technical category. Utah and Internet Safety Labs have already demonstrated almost the exact manual causal loop, while research systems already automate policy-to-flow consistency and current K–12 products already monitor policy changes, DPAs, approval, and blocking. The remaining whitespace is the combination of **district-specific contract + authorized role-specific live journey + planted field-level canaries + replayable behavioral regression receipt**.

- **Hard disposition:** RESHAPE
- **Standalone new-category verdict:** **No.** It could be a credible standalone procurement-assurance service, but the evidence currently supports a differentiated product layer or an eventual Lightspeed/ISL/AppCensus-class feature, not a category claim.
- **Education track fit:** Natural. The buyer and authority holder are a district privacy/technology office, and the protected population is students.
- **Rubric ceiling after the reshape:** **14/16** — Technological Implementation 4, Design 4, Potential Impact 4, Quality of the Idea 2.

## The claim being audited

A district creates a synthetic student/teacher tenant containing unique, non-child canary values. GPT-5.6 computer-use agents exercise representative live workflows. Local browser instrumentation or a proxy records destinations and canary propagation. GPT-5.6 reconciles the observations against the district's DPA and the vendor's policies with exact citations, returning bounded evidence states. A later product or policy change triggers the same journeys again; a newly witnessed contradiction can move the district's approval to hold. The model never declares legal compliance.

The useful causal claim is not “AI reads privacy policies.” It is:

> A district can replace vendor-controlled promises and stale one-time review with repeatable, contract-specific observations of what its own authorized synthetic users caused the product to transmit.

That claim is causally aligned with the documented failure. The novelty claim needs substantial narrowing.

## The predecessor that prevents a broad novelty claim

The August 2025 [Utah State Board of Education/BYU/Internet Safety Labs investigation](https://schools.utah.gov/studentdataprivacy/files/Utah%20EdTech%20App%20Data%20Collection%20and%20Sharing%20-%202023-25%20Investigation.pdf) is not merely adjacent evidence; it is the strongest baseline and a direct predecessor.

The investigators:

- aggregated more than 3,000 apps in use and selected 100 for investigation;
- used LEA-provided credentials where required and otherwise created accounts that mimicked children under 13, avoiding real child data;
- recorded network traffic, local storage, request/response fields, destination ownership, and first- versus third-party transfers;
- spent about 15 minutes exercising each web service, including available assignments, tests, quizzes, profile edits, and user-interface paths;
- compared observed data elements with DPAs, contracts, and policies;
- classified results into apparent agreement, apparent violation, and cases requiring legal expertise;
- worked with vendors to reconcile discrepancies and recommended continuing objective testing.

The report found at least one contractually unlisted data element in 44 of the 85 tested apps with SDPC-based DPAs. That is compelling evidence that the verification gap is real in this tested set; it is not a national prevalence estimate. The report also explicitly says legal actions and next steps belong to people with legal expertise and positions of authority.

The proposed product therefore does not invent behavior-versus-contract testing, synthetic child accounts, authenticated journey testing, network evidence, bounded interpretation, or procurement relevance. It attempts to turn that labor-intensive investigation into a repeatable district control.

## Current substitute map

| Substitute | What it already does | Residual difference, if any |
|---|---|---|
| [Internet Safety Labs](https://internetsafetylabs.org/) and its Utah work | Independent empirical website/mobile-app safety testing, network-behavior measurement, audits, labels, and vendor reconciliation. | The concept would let one district replay its own contract and tenant configuration after changes instead of waiting for a research snapshot or external audit. |
| [AppCensus](https://appcensus.io/) | Real-time mobile-app scans on virtual/live devices, third-party and SDK attribution, data-transfer analysis, version-change analysis, minor-protection testing, and remediation monitoring. | Public materials are publisher/mobile oriented; the proposed wedge is buyer-owned, district-DPA-specific evidence from authorized school-role journeys. |
| [POLICHECK](https://research.ibm.com/publications/actions-speak-louder-than-words-entity-sensitive-privacy-policy-and-data-flow-analysis-with-policheck) and [PurPliance](https://research.samsung.com/research-papers/Consistency-Analysis-of-Data-Usage-Purposes-in-Mobile-Apps) | Automated comparison of observed application data flows with natural-language privacy-policy disclosures, including receiving entity and stated purpose. | A district DPA, authenticated education tenant, approval workflow, replayable journey, and institution-owned evidence receipt are product-context differences—not a new core analysis primitive. |
| [PriAgent](https://ojs.aaai.org/index.php/AAAI/article/view/37135) and [AudAgent](https://arxiv.org/abs/2511.07441) | LLM/agent-based privacy-policy formalization, runtime or code-level evidence correlation, explainable findings, and in AudAgent's case continuous real-time auditing. | They target Android code or AI-agent runtime rather than district procurement, but they eliminate “LLMs reconcile policy and behavior” as a novelty claim. |
| [CanaryTrap](https://arxiv.org/abs/2006.15794) | Plants account-specific honeytokens to detect misuse of data shared with third-party apps. | Journey-scoped field canaries tied to a DPA clause and a captured request would be a useful application of the technique, not a new canary technique. |
| [Common Sense Privacy](https://privacy.commonsense.org/resource/evaluation-framework) and [1EdTech TrustEd Apps](https://www.1edtech.org/certification/data-privacy) | Structured policy review, exact policy references, privacy rubrics, certification, directories, and self-assessment. | They principally evaluate disclosures and policies, not the district tenant's observed behavior. |
| [Lightspeed Insight](https://www.lightspeedsystems.com/products/lightspeed-digital-insight/) | Discovers actual app use, alerts on policy changes with detailed revisions, automates reviews, centralizes approvals and DPAs, and can block risky apps through its connected filter. | It publicly claims policy/usage monitoring rather than planted-data flow verification against a district-specific DPA. It already owns the surrounding workflow the concept would need. |
| [Linewize EdTech Manager](https://www.linewize.com/hubfs/US%20-%20Product%20Data%20Sheets/US%20-%20Linewize%20-%20Product%20Sheet%20-%20EdTech%20Insights.pdf) | App inventory and usage visibility, third-party safety status alerts, DPA management, and compliance workflow. | Same product-distribution pressure as Lightspeed; the remaining delta is direct behavioral evidence. |

No primary source located in this audit claims the entire remaining combination. That is **composition whitespace**, not clean-slate category whitespace.

## What is genuinely different and causally useful

The narrow mechanism creates five useful deltas over common district practice:

1. **Policy evidence becomes behavior evidence.** A DPA statement is paired with a captured request, destination, timestamp, role, journey, and planted field value.
2. **Generic reputation becomes district-specific evidence.** The run uses the district's purchased tier, tenant settings, student/teacher roles, and actual signed DPA rather than a consumer edition or generic score.
3. **A snapshot becomes a regression control.** The same named journeys can run after a vendor release, policy revision, tenant-setting change, or renewal.
4. **Sensitive observation becomes synthetic.** Canaries identify propagation without putting a child's data into the test.
5. **A report changes operational state.** A new witnessed contradiction can place an existing approval on hold and route the evidence bundle to the authorized reviewer.

That is not planning theater: a difficult input produces reproducible external evidence and a bounded, reversible procurement state change. It also addresses a specific failure in the Utah investigation: some discrepancies can arise after an app or agreement changes, making one-time review stale.

## Fatal flaw in the original framing: observation is asymmetric

A black-box journey can **witness a contradiction**. It cannot prove that an app is contractually compliant.

The system cannot establish absence because:

- it observes only the roles, paths, account state, time, geography, feature flags, and tenant configuration exercised;
- it cannot see unexecuted branches or server-to-server onward sharing;
- a canary may be hashed, encoded, aggregated, transformed, or split before transmission;
- native apps, certificate pinning, proprietary secure browsers, or encrypted channels can make payloads unobservable—the Utah report itself records secure-browser cases it could not test without a separate legal agreement;
- a destination may be a permitted processor, an impermissible third party, or both under different contractual purposes; endpoint ownership alone does not resolve that legal/functional role;
- an app can behave differently for test accounts, paid education editions, public pages, ages, or delayed jobs.

Therefore, **“supported” is an unsafe output label** if it can be read as “the contract is supported” or “the app passed.” Exact citations do not cure incomplete observation. An automated green approval would convert missing evidence into false assurance.

The reshaped evidence states should be:

- **Witnessed contradiction:** a captured, replayable observation conflicts with a human-confirmed contract obligation.
- **Observed consistent in named scope:** every observable event from these exact journeys mapped to the reviewed obligation set; this is not a compliance finding.
- **Not exercised:** an obligation had no corresponding approved scenario or the scenario did not reach it.
- **Not observable:** the run reached the scenario, but the instrumentation could not inspect the relevant behavior.

Only a new witnessed contradiction, an evidence regression, or loss of required observability should automatically move **approved → hold**. Nothing should automatically move **hold → approved**. That asymmetry is the safety property.

## Is GPT-5.6 structural?

**Conditionally, for coverage and contract authoring—not for proof or enforcement.**

GPT-5.6's computer use, image understanding, long context, structured output, and tool calling can make two previously expensive pieces more tractable:

- traverse semantically meaningful, authenticated workflows across heterogeneous school SaaS without hand-coding every first exploration;
- turn a long DPA, policy, product tier, and role description into proposed obligation-to-scenario mappings with exact source spans for human confirmation.

The deterministic layer must own canary generation, browser/network capture, request hashing, destination resolution, evidence storage, run diffing, and approval-state rules. The model may propose a mapping or explain an observation; it may not invent a packet, declare a legal violation, or grade its own coverage.

GPT-5.6 is **not structural unless an ablation proves it**. Once a journey is approved, a recorded Playwright-style script plus the same proxy and rules may replay it more reliably and cheaply. If a conventional recorder lets a privacy officer author equivalent journeys with equal coverage, or if deterministic policy templates outperform model extraction, the model is an ornamental setup assistant. The defensible architecture is likely **model discovers and repairs journeys; deterministic scripts replay them**.

The computer-use agent also creates a new attack surface. The audited site is untrusted input and could contain prompt injection. The test browser must have no child data, email, district admin session, broad network access, or useful credentials beyond the synthetic tenant; tool calls and destinations must be allowlisted; the model should receive only the minimum screenshots and contract excerpts required for the run.

## Institutional authority and adoption

The authority chain is unusually plausible for a high-stakes concept:

- the district is a contracting party and controls its local approved-app list;
- the district can create or request an authorized test tenant and synthetic identities;
- the district can integrate a hold with SSO, procurement, or filtering controls;
- a privacy officer, counsel, or other designated official can interpret the contract and contact the vendor.

The product and model have no legal authority. Deployment also requires written authorization for the traffic inspection and automated journeys. The Utah investigators limited testing to their own networks and devices, used provided credentials with permission, and reserved uncertain findings for legal experts. The product needs the same boundary. A district cannot assume that possession of a login authorizes penetration testing, TLS bypass, or testing of a vendor's production infrastructure.

This authority fit makes the concept more adoptable than an outsider-facing “privacy score,” but distribution is difficult: Lightspeed and Linewize already sit in the app-approval workflow, while ISL and AppCensus already have the specialist knowledge and scanning credibility. A standalone must prove materially broader authorized coverage or materially lower review effort, not merely present a nicer report.

## Strongest baseline

The honest baseline is not a spreadsheet or a vendor questionnaire. It is:

1. the Utah/ISL manual protocol for authorized role-based exploration, traffic capture, DPA comparison, and expert escalation;
2. a deterministic browser recorder/replayer plus DevTools/HAR or proxy capture and canary matching; and
3. the current Lightspeed-style approval, DPA, change-alert, and block workflow.

The concept earns a model-native claim only if it finds materially more contract-relevant behavior per expert hour than that baseline while preserving the baseline's evidentiary precision.

## Decisive experiment

Run a blinded, pre-registered comparison on a benchmark of browser-based school SaaS tenants built or explicitly authorized for testing.

### Corpus

- At least 20 applications or instrumented app variants.
- Student and teacher roles, paid/public tier differences, settings changes, delayed requests, and conditional feature paths.
- At least 40 seeded cases spanning permitted collection, plaintext canary disclosure, encoded/hashed canaries, first/third-party destinations, ambiguous contract language, unobservable transport, and server-side-only forwarding.
- Human privacy experts establish the obligation mapping and ground truth before evaluators see system output.

### Arms

1. **Manual Utah-style audit:** trained tester plus privacy reviewer.
2. **Deterministic baseline:** human-recorded journeys, browser instrumentation/proxy, canary matcher, and reviewed rules.
3. **GPT-5.6 system:** agent-discovered journeys and contract-to-scenario proposals using the exact same deterministic evidence and decision layer.

After initial runs, silently introduce version and tenant-setting changes and rerun all approved journeys.

### Primary measures

- precision and recall of **witnessed contradictions** within the instrumentable benchmark;
- unique contract-relevant paths exercised per expert hour;
- human minutes to author, approve, repair, and review a journey;
- replay success and evidence-hash reproducibility across five runs;
- rate at which the system correctly returns **not exercised** or **not observable** instead of a reassuring result;
- seeded regressions detected before an approval remains active;
- prompt-injection containment and proof that no non-synthetic data left the sandbox.

### Advance threshold

Advance the reshaped product only if the GPT arm maintains at least 95% precision on witnessed contradictions, detects at least 85% of instrumentable seeded contradictions, doubles contract-relevant path coverage per expert hour over the deterministic arm, cuts human journey-authoring/repair time by at least half, and never emits an unbounded compliance conclusion. Then confirm the result on at least five independently authorized real products against a human ISL-style audit.

If the GPT arm does not materially beat the deterministic recorder, **kill the model-native product claim**. If both automated arms routinely miss condition-dependent or transformed flows, retain the system only as a narrow regression tripwire, not a procurement gate.

## Three-minute demo

The demo is unusually legible if it shows one causal spine:

1. A district privacy officer imports a short DPA whose reviewed clause permits a student identifier only for the service and bars disclosure to an analytics recipient.
2. The system provisions a synthetic teacher and student with distinct canary values, then shows two named, approved journeys: teacher assigns work; student submits it.
3. GPT-5.6 operates the unfamiliar interface while the local evidence layer captures requests. The viewer watches one canary appear in a request to a disallowed test destination.
4. The result shows the exact DPA span, role, action, request field, destination, screenshot, timestamp, and replay hash. It says **witnessed contradiction**, not “illegal” or “noncompliant.”
5. The app's district status visibly changes from **approved** to **hold**, with the privacy officer as the next authority.
6. A fixed version reruns the same journey. The result says **not re-observed in these two journeys**; only the human reviewer can restore approval.

Use a controlled test app or an explicitly authorized partner tenant. Publicly accusing a real vendor based on a hackathon black-box run would undermine the product's evidentiary discipline.

## Rubric ceiling

| Criterion | Ceiling | Why it can reach that ceiling | What prevents a confident score now |
|---|---:|---|---|
| Technological Implementation | **4/4** | Cross-product computer use, role-specific journey discovery, contract extraction, sandboxing, deterministic canary/network evidence, replay, and state integration form a deep system. | GPT-5.6 must beat a recorder/replayer ablation; model-generated findings cannot be the oracle. |
| Design | **4/4** | A complete journey can move from contract and synthetic tenant through external evidence to a reversible hold and expert review. | The language and UI must preserve asymmetric evidence and make untested/unobservable paths prominent. |
| Potential Impact | **4/4** | The Utah investigation establishes a consequential verification gap, a large app surface, constrained district capacity, and observed contract discrepancies. | General prevalence and procurement adoption remain unproven; authority and vendor authorization are required. |
| Quality of the Idea | **2/4** | District-specific continuous regression receipts are a useful and coherent recombination. | Utah/ISL already proves the manual loop; POLICHECK/PurPliance/PriAgent/AudAgent cover policy-flow analysis; current K–12 suites cover the surrounding approval workflow. |
| **Total ceiling** | **14/16** | Strong possible product and demo. | Differentiated integration, not category-shaping novelty. |

## Final decision

The problem is real, the causal mechanism is real, and the product would do more than generate paperwork. The original concept nevertheless overstates what black-box testing can establish and sits on unusually direct prior art.

Preserve only this proposition:

> **For a district privacy officer responsible for a signed DPA, replay authorized synthetic student/teacher journeys after meaningful changes, produce tamper-evident witnesses of any newly observed contract contradiction, and automatically hold—but never approve—the app pending human review.**

That is a defensible, high-impact product wedge with a strong three-minute demonstration. It is not yet evidence of a new category, and it should not be selected on novelty grounds unless the decisive experiment shows that GPT-5.6 creates a large coverage-per-expert-hour delta over deterministic journey recording.
