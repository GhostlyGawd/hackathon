# OpenAI Build Week: judge and evidence lens

_Research snapshot: 2026-07-19. This document evaluates how ideas and demos should be judged; it does not propose or endorse a product idea._

## Epistemic rules

This review separates three kinds of claim:

- **Explicit**: stated in the live OpenAI Build Week page, Devpost rules, submission requirements, or host announcements.
- **Derived**: a practical implication of an explicit rule. It is not an additional rule or a claim about a judge's private preference.
- **Analogy, low weight**: a descriptive pattern in a small sample of other AI-hackathon winners. Different contests have different rubrics, so this cannot establish what will win Build Week.

The [official rules](https://openai.devpost.com/rules) say the sponsor may use multiple panels, peer review, automated analysis, or a combination; listed judges can change. Therefore, optimizing for a named person's imagined taste would be unsound. The durable target is the written rubric.

## Executive read

1. **There is a viability gate before scoring.** A project first has to fit the theme and reasonably use the required technology. A strong concept that cannot demonstrate that fit can fail before the four criteria matter.
2. **The four scored criteria are equally weighted.** Technological Implementation, Design, Potential Impact, and Quality of the Idea each carry the same formal weight.
3. **Technological Implementation is still strategically important.** It is the first tie-break criterion, and a working, non-trivial implementation is also implicated by the viability and submission requirements.
4. **The project must be legible without a live judge test.** Judges may rely only on the description, images, and video. The submission package is not collateral around the product; it is one of the primary ways the product is evaluated.
5. **The host explicitly rejects model-first ideation.** Its guidance says to begin with a real problem and use GPT-5.6 because that problem calls for it.
6. **There is no published overall grand-prize category.** The rules list first- and second-place prizes separately for each of the four tracks. Track fit matters; there is no evidence that one track is intrinsically favored.

## 1. Exact judging constraints

### Formal competition structure

| Constraint | What the official materials establish | Consequence for evaluation |
|---|---|---|
| Submission deadline | July 21, 2026 at 5:00 p.m. Pacific. | Materials and access must be valid before the deadline. |
| Stage One | Pass/fail on baseline viability: reasonable theme fit and reasonable use of the required APIs/SDKs. | Treat theme/technology fit as a gate, not points that can be offset elsewhere. |
| Stage Two | Four equally weighted criteria. | Use equal numerical weights; do not quietly privilege novelty or polish. |
| Tie-break | Compare tied entries on the criteria in listed order, beginning with Technological Implementation, then continue in order. | When total scores are equal, stronger implementation is formally advantaged. |
| Possible judging process | The sponsor may use one or more panels and may include expert, peer, or automated analysis. Listed judges may change. | Do not assume every named judge reviews every entry. Make evidence machine- and human-legible. |
| Tracks | Apps for Your Life; Work and Productivity; Developer Tools; Education. | Select one best-fit track and make the fit obvious. |
| Prize pools | One first place and one second place are listed for each track; each project is eligible for one prize. | Compare an entry primarily against credible peers in its selected track. |

The four official criteria are:

1. **Technological Implementation** — depth and skill of Codex use, genuine effort, and working non-trivial code.
2. **Design** — a complete, coherent, runnable product experience rather than only a technical proof of concept.
3. **Potential Impact** — a credible and specific real problem and audience, plus demonstrated solution fit.
4. **Quality of the Idea** — creativity, novelty, and meaningful difference from existing concepts.

These definitions and the two-stage process come directly from the [judging section of the official rules](https://openai.devpost.com/rules). OpenAI's own [Build Week page](https://openai.com/build-week/) summarizes the same four dimensions and says strong entries thoughtfully use GPT-5.6 and Codex while clearly communicating the problem, solution, and approach.

### Required project and evidence package

The [official rules](https://openai.devpost.com/rules) and [submission announcement](https://openai.devpost.com/updates/45282-openai-build-week-submissions-are-open-plugin-launch) require:

- A working project built with Codex and GPT-5.6, in exactly one of the four tracks.
- Consistent operation on its intended platform and behavior matching the description and video.
- A project description explaining features and function.
- A public YouTube demonstration shorter than three minutes. Judges need not watch beyond three minutes. Audio must explain what was built and how both Codex and GPT-5.6 were used.
- A public repository with relevant licensing, or a private repository shared with the two specified judging addresses.
- A README with setup/run guidance, sample data where necessary, the Codex collaboration story, important human decisions, and the contribution of GPT-5.6 and Codex.
- The `/feedback` Session ID for the thread where most core functionality was built.
- For a plugin or developer tool: installation instructions, supported platforms, and a test path that does not require rebuilding from source, such as a hosted demo, sandbox, or test account.
- Free, unrestricted judge access to a working site, demo, or test build through the judging period. Judges are nevertheless not required to test it.
- If a project predates the submission window, clear separation of prior work from meaningful new work; only the new work is evaluated. Commit history or timestamped sessions can supply evidence.
- Authorization and license compliance for third-party SDKs, APIs, data, and open-source components.

The July 18 [host update](https://openai.devpost.com/updates/45371-tuesday-last-minute-tips) clarifies that GPT-5.6 need not be the only model used, but it must be used for a part of the project that the entrant can identify. That is clarification, not permission to make its use ceremonial.

### Date discrepancy to recheck

The Devpost rules currently list judging through August 5, while the [OpenAI event page](https://openai.com/build-week/) shows July 22 through August 7. This does not affect idea scoring, but any operational plan that depends on the end of judge access should recheck the live rules. The rules themselves state that official rules, the hackathon website, and sponsor updates control over plugin output.

## 2. What makes a demo legible and memorable

### Explicit host guidance

The host has said all of the following:

- Start with the problem rather than the model; the strongest builds solve something real and use GPT-5.6 because the problem requires it.
- A clear three-minute video should show the product working and explain both Codex and GPT-5.6 usage.
- The video is likely the clearest window into the build and deserves product-level testing.
- Repositories should be testable, with clean instructions and sample data.
- Entrants should understand AI-generated code because judges inspect repositories.
- A submission description should be edited into the builder's own voice; generic AI-written copy weakens credibility.

Those points appear in the [Build Week resources and updates](https://openai.devpost.com/updates), especially the [halfway guidance](https://openai.devpost.com/updates/45362-openai-build-week-halfway-there-where-are-you) and [last-minute guidance](https://openai.devpost.com/updates/45371-tuesday-last-minute-tips).

### Derived demo pattern

The most defensible demo structure is a **single causal spine**:

> specific actor and consequential moment -> difficult real input -> visible system work -> changed state or artifact -> outcome delta -> boundary or recovery

This is a derived heuristic, not a formal script. It makes every scored criterion observable in one sequence.

| Demo move | What it makes legible | Minimum proof |
|---|---|---|
| Name one actor and triggering event | Potential Impact | Who is stuck, at what moment, and what goes wrong today. |
| Show the current input or constraint | Impact and idea quality | A representative artifact, state, or task—not merely a narrated claim. |
| Run one end-to-end path | Design | A coherent task completes in the actual product. |
| Expose consequential model/tool work | Technological Implementation | Tool actions, transformations, decisions, or state changes that matter to the result. |
| Land on a visible outcome | All four criteria | A changed record, generated artifact, executed action, resolved contradiction, or measurable comparison. |
| Show one boundary, verification, or recovery state | Implementation and Design | How the system handles uncertainty, failure, permissions, or a bad input. |
| Tie Codex/GPT-5.6 to the hard part | Technological Implementation | What was accelerated, what still required human judgment, and why the model was appropriate. |

### The restatement test

After one viewing, a reviewer should be able to complete this sentence without product jargon:

> “For **[actor]** facing **[specific event]**, it turns **[difficult input/current work]** into **[observable outcome]** by **[distinct mechanism]**.”

If the only memorable sentence is “it uses GPT-5.6 to help with X,” the problem, mechanism, or demonstration is still under-specified.

### Low-weight winner check

Three recent Devpost winner pages from other AI competitions provide only a small descriptive check:

| Project | Observable demo-shaped loop on its primary page | What can cautiously be learned |
|---|---|---|
| [EarthLink AI](https://devpost.com/software/earthlink-ai), 2026 first place overall | A natural-language geographic request triggers location search, spatial filtering, environmental computation, map mutation, comparison rendering, and explanation. | The model's contribution is visible as product state and domain computation, not only prose. |
| [DataLive](https://devpost.com/software/datalive), 2025 multimodal winner | A CSV moves through profiling/cleaning, executable code generation, a rendered plot, and optional plot interpretation. | A bounded input-to-artifact loop is easy to inspect and retell. |
| [BlokAIsia](https://devpost.com/software/blokaisia), 2025 games first place | A player creates an asset, inserts it into a working city simulation, and sees downstream economic or citizen effects. | AI is integrated into a coherent system with visible consequences rather than attached as a separate chat surface. |

Shared observation: each page can state a concrete input, system action, visible artifact, and downstream effect. This is correlation in a tiny, self-reported sample under different judging rules—not evidence that similar subject matter or interfaces will win Build Week.

## 3. Anti-patterns likely to score poorly

### Gate or eligibility risks

- The project does not clearly fit one track or use Codex/GPT-5.6 in a meaningful, identifiable part of the work.
- The product is not runnable, does not behave as depicted, or cannot be accessed by judges.
- The YouTube video is unavailable, lacks the required audio, or depends on content after the three-minute mark.
- A private repository is not shared correctly, or the README/test path is missing.
- A pre-existing project presents old functionality as new or cannot distinguish work completed in the submission window.
- A developer tool requires a judge to rebuild or reconstruct the environment despite the explicit no-rebuild test-path requirement.
- Third-party data, media, or code lacks authorization or compatible licensing.

### Scoring risks grounded in the rubric

| Anti-pattern | Likely scoring damage |
|---|---|
| A prompt wrapper whose main novelty is its system prompt or branding | Weak Technological Implementation and Quality of the Idea. |
| “AI for everyone who does X” with no specific actor, event, or costly failure | Weak Potential Impact. |
| A feature montage with no complete task | Weak Design; the viewer cannot verify solution fit. |
| An architecture diagram narrated over an unproven product | Claimed implementation substitutes for demonstrated implementation. |
| Model output that is merely displayed, with no state change, verification, or action | The demo may read as a technical proof of concept rather than a product. |
| Novelty that disappears when the model name is removed | Weak Quality of the Idea and likely model-first framing. |
| Claims of accuracy, safety, productivity, learning, or impact that are neither measured nor demonstrated | Weak Potential Impact; possibly weak Design when the claim is central to the task. |
| Breadth purchased by leaving core paths brittle | Weak Design and implementation despite a longer feature list. |
| The model or another agent grades its own success with no external evidence | Circular evidence; it does not demonstrate the claimed outcome. |
| Generic AI-written name and description, or unexplained generated code | Host guidance explicitly flags both as credibility problems. |

The practical failure mode is **theater**: narration, agent traces, plans, or impressive-looking activity that never proves a changed outcome for the stated actor. The rubric repeatedly asks whether the product works, is coherent, solves the demonstrated problem, and differs from existing concepts.

## 4. Legitimate lenses from the named judges' public remits

These are stress-test questions derived from public roles. They are not predictions of scores or private preferences.

| Judge | Publicly established remit | Legitimate stress-test lens | What not to infer |
|---|---|---|---|
| Thibault Sottiaux | OpenAI lists him as **Head of Product & Platform**. An [OpenAI Forum event](https://forum.openai.com/public/events/codex-is-for-everyone-why-codex-matters-beyond-code-fa40puy7wi) says he leads Codex. | Does the experience hold together as a product, and is Codex collaboration substantive and inspectable rather than ceremonial? | Do not infer that Developer Tools is favored or that a project must resemble an OpenAI product roadmap. |
| Kath Korevec | OpenAI lists her as **Member of Product Staff**. A recent [public event bio](https://www.linkedin.com/posts/resend_were-thrilled-to-welcome-kath-korevec-to-activity-7477421685059715072-5o3s) says she works on Codex and focuses on smoother, easier product use; this is secondary evidence. | Can a user understand, enter, complete, and recover from the core journey with little friction? Is the Codex story connected to the shipped experience? | Do not assign her a preferred track or assume her prior work defines the judging standard. |
| Tara Seshan | OpenAI lists her as **Member of Product Staff**. Her [public profile](https://www.linkedin.com/in/tarstarr) describes a founder/product-manager/general-manager background. | Is the product opinionated about the actor, priority, and tradeoff? Does the demonstrated solution fit the stated problem? | Do not infer a preference for work software, finance, climate, or any former employer's product patterns. |
| Leah Belsky | OpenAI lists her as **VP of Education**. OpenAI's education work emphasizes learning outcomes, teacher/institution needs, responsible adoption, and AI that deepens rather than shortcuts learning. | For an education claim, does the product increase learner or educator agency and demonstrate a learning/teaching outcome rather than merely produce answers? Are classroom or system constraints real? | Do not assume she reviews only Education entries or that non-education tracks are disadvantaged. |
| Peter Steinberger | OpenAI lists him as **Member of Technical Staff, Clawfather**. In his [own public account](https://steipete.me/posts/2026/openclaw), he says his remit is bringing agents to everyone, including making one usable by a non-expert family member, with safety and openness in view. | Does the software actually act, remain understandable to a non-expert, and acknowledge safety/authority boundaries? Does it feel built and tested rather than narrated? | Do not infer that an entry must be an agent, local-first, open source, playful, or similar to OpenClaw. |

For Leah Belsky's lens, the strongest primary support is OpenAI's [Learning Accelerator](https://openai.com/global-affairs/learning-accelerator/) and [K–12 educator skills initiative](https://openai.com/index/k-12-educators-practical-skills/). Both center real educator/system needs, thoughtful use, access, responsibility, and deeper learning rather than answer substitution.

The safest use of this table is adversarial review: ask every finalist to survive all five lenses. Do not change the official criterion weights or track selection based on a biography.

## 5. Internal 0–4 evaluation instrument

This is an internal operationalization of the four official criteria, not a published judge scorecard. Scores are equal-weighted for a maximum of 16.

### Stage Zero: pass/fail gates

An evaluator must answer **yes** to all before scoring:

1. Is the selected track a natural fit, explainable in one sentence?
2. Is there a working/runnable product rather than only a design, plan, or technical experiment?
3. Is Codex used substantially in building the project, with a primary `/feedback` session and an inspectable collaboration story?
4. Is GPT-5.6 used in an identifiable, relevant part of the work?
5. Can the product and its central claim be demonstrated in under three minutes?
6. Can a judge access the repository and a no-friction working test path?
7. If work predates the window, is new work clearly separated and evidenced?

If any answer is no, record the blocker rather than compensating with a high score elsewhere.

### A. Technological Implementation

- **0 — Absent:** no working implementation or no credible required-technology use.
- **1 — Trivial:** a thin prompt/API wrapper; most complexity is asserted; repo or demo does not establish understanding.
- **2 — Functional:** core path works and includes some non-trivial engineering, but model/tool use is shallow, brittle, or weakly evidenced.
- **3 — Skilled:** appropriate model/tool architecture, meaningful Codex collaboration, inspectable non-trivial code, and a reliably demonstrated difficult path.
- **4 — Exceptional:** the core mechanism depends on deep, well-chosen model/tool capabilities; implementation is robust, observable, tested at meaningful boundaries, and the builder can explain important decisions and generated code.

Evidence required: live path, repository locations, tests or validation, Codex decision trail, identified GPT-5.6 contribution, and one handled boundary/failure.

### B. Design

- **0 — Absent:** not runnable or no coherent user path.
- **1 — Proof of concept:** isolated capability works, but there is no complete product experience.
- **2 — Usable core:** the primary happy path completes, with visible gaps, rough transitions, or weak recovery.
- **3 — Coherent product:** end-to-end journey, understandable states, useful output, and reasonable setup/recovery all work together.
- **4 — Complete and deliberate:** coherent primary and failure paths, strong information hierarchy, appropriate feedback/controls, and a polished experience whose form clarifies the mechanism.

Evidence required: one uninterrupted task, start and finish states, error/uncertainty handling, and no hidden manual intervention presented as automation.

### C. Potential Impact

- **0 — Absent:** no identifiable audience or real problem.
- **1 — Generic:** broad audience and aspirational benefit with no credible problem evidence or demonstrated fit.
- **2 — Plausible:** specific actor and problem, but severity/frequency evidence or solution-to-outcome proof is thin.
- **3 — Credible:** concrete actor/event, credible evidence of cost or recurring failure, inadequate current workaround, and a demo that changes the relevant outcome.
- **4 — Compelling:** important recurring problem, strong external or first-party evidence, precise beneficiary and mechanism, measurable delta, and honest treatment of limitations, safety, or adoption constraints.

Evidence required: actor, triggering event, existing workaround, cost/failure, source quality, demonstrated changed outcome, and a metric that is not generated by the model grading itself.

### D. Quality of the Idea

- **0 — Indistinguishable:** direct clone or commonplace feature with no material differentiation.
- **1 — Wrapper:** familiar “AI for X” framing whose novelty is mostly the model or interface.
- **2 — Differentiated packaging:** a useful combination or verticalization, but current substitutes address most of the same job.
- **3 — Distinct:** a non-obvious problem insight and mechanism create a demonstrably different user capability or workflow.
- **4 — Category-shaping:** the central insight and mechanism remain novel after removing model branding, unlock something existing concepts do not, and survive a concrete comparison with the strongest substitutes.

Evidence required: closest alternatives, overlap, meaningful difference, why that difference matters to the outcome, and what would falsify the novelty claim.

### Scoring record

For each criterion, record:

- **Score (0–4)**
- **Confidence (low / medium / high)**
- **Observed evidence** from the demo, repository, or cited problem research
- **Missing evidence** that would move the score
- **Strongest counterargument**

Then record:

- **Total: /16**, with equal weights
- **Stage Zero:** pass/fail and blocker if failed
- **Track-fit sentence**
- **One-sentence restatement** of actor, event, transformation, outcome, and distinct mechanism
- **Tie-break note:** compare Technological Implementation first only when totals tie, mirroring the official rule

### Calibration rules

- Score what is demonstrated now, not the roadmap.
- A “4” requires evidence, not superlatives.
- Do not count visual polish twice under Design and Quality of the Idea.
- Do not count model complexity as impact; impact requires a changed human or organizational outcome.
- Do not count an activity trace as implementation unless the activity produces and verifies consequential state.
- Preserve disagreement between reviewers. Average scores only after recording each reviewer's evidence and counterargument independently.

## Bottom line

The written rules favor a rare combination: **real problem, distinct mechanism, working non-trivial code, and a complete experience that proves the outcome quickly**. None of the four can be substituted by storytelling about the other three. The strongest selection process should therefore reject both “important problem, generic wrapper” and “impressive agent, unclear problem” before either reaches finalist status.
