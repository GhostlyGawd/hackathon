# Executable forks: evidence, novelty, and falsification audit

Research snapshot: 2026-07-19.

## Verdict

**RESHAPE.** The underlying problem is real, the comparison experience could be excellent, and the mechanism has a clean causal spine. The broad claim is not novel enough: current products already combine variants, parallel isolated work, live previews, selection, and persistent preferences in adjacent ways. Replit Agent 4 is especially close. Active preference learning and executable requirements prototyping also establish the conceptual ancestry.

The defensible residual is much narrower:

> When a coding agent encounters one material, reversible, behavior-level ambiguity that is cheaper to experience than to describe, it constructs exactly two controlled, runnable counterfactuals from the same repository state; the owner chooses by completing the same journey in each; the system then compiles that choice into a versioned behavioral decision and an externally checkable regression contract.

That is an **executable clarification protocol** inside a developer tool. It is not yet evidence for a revolutionary new ADE, and it does not solve general agent oversight.

## The mechanism under audit

The proposed intervention is not plan comparison, generic “give me three options,” competitive code generation, or a second model reviewing the first. It has six defining constraints:

1. The trigger is a **material product-intent ambiguity discovered during implementation**, not a user request for variants.
2. The ambiguity must be **reversible** and must admit two meaningfully different observable behaviors.
3. Two agents start from the same commit in isolated worktrees or sandboxes and vary **one disputed behavior while holding explicit invariants constant**.
4. The owner receives the same seeded live journey for both branches, in randomized neutral order, and can choose A, B, or neither.
5. The selected behavior becomes a durable, inspectable decision record plus an executable behavioral check; it is not stored only as chat memory.
6. The losing branch is discarded. Only the selected branch receives normal code review and merge treatment.

This scope matters. If the product generates aesthetic alternatives on demand, it is already an incumbent feature. If it asks the model to decide which branch is “better,” it recreates the truth problem. If it forks for objective correctness questions, it doubles code without producing an oracle.

## Is the problem real?

### Evidence that agents guess under underspecification

The existing developer-tools atlas gives the general oversight problem high confidence: experienced developers report planning, monitoring, and post-hoc verification work when delegating to coding agents, while larger AI-enabled change batches are associated with slower review and lower delivery stability. The safe claim is burden, not that all agent code is worse. Sources: [human-oversight study](https://arxiv.org/abs/2606.05391), [Microsoft developer study](https://www.microsoft.com/en-us/research/publication/to-copilot-and-beyond-22-ai-systems-developers-want-built/), and [DORA](https://dora.dev/ai/gen-ai-report/).

More specific 2026 evidence supports the ambiguity failure:

| Evidence | What it establishes | What it does not establish |
|---|---|---|
| [UnderSpecBench](https://arxiv.org/abs/2607.02294) reports that 55.8–67.8% of evaluated agent runs violated at least one action boundary across underspecified DevOps tasks. | Completion-oriented agents often act on an unstated target, intent, or blast radius instead of safely resolving it. | Its tasks concern operational action boundaries, often with objective safe actions. It does not show that implementing two product behaviors is the best remedy. |
| [Orchid](https://arxiv.org/abs/2604.21505) finds that ambiguous requirements degrade code-generation performance, produce functionally divergent implementations, and are not reliably detected or resolved autonomously. | One prompt can support materially different code, and strong generation does not imply ambiguity awareness. | Function-level benchmarks are not full product work, and divergence alone does not mean either version is worth showing to a user. |
| [Ask or Assume?](https://arxiv.org/abs/2603.26233) reports a 69.4% resolve rate for an uncertainty-aware multi-agent clarification scaffold versus 61.2% for its single-agent baseline on an underspecified SWE-bench variant. | Proactive ambiguity detection and targeted questions can improve outcomes. | It is evidence for the cheaper **ask** baseline, not for executable forks. |
| [ClarifyCodeBench](https://arxiv.org/abs/2607.00711) reports that code-generation ability and clarification ability are decoupled and that performance drops as ambiguities accumulate. | Intent elicitation is a distinct capability that deserves its own gate and evaluation. | It does not validate binary live comparisons or durable behavioral contracts. |
| [SAGE-Agent / ClarifyBench](https://aclanthology.org/2026.findings-acl.2028/) uses expected value of perfect information to select questions and reports better ambiguity coverage with fewer questions than prompting baselines. | A principled system can decide when asking is valuable and avoid redundant questions. | Its uncertainty is over tool parameters, not experiential product behavior. It is a strong baseline the fork mechanism must beat. |
| [Asuka-Bench](https://arxiv.org/abs/2606.05920) evaluates underspecified web tasks through deployed, browser-rendered behavior and multiple rounds of feedback. | Rendered behavior can carry requirement information that a one-shot prompt misses. | The “user” in the benchmark is an LLM and the work is sequential refinement, not actual owner preference elicitation. |

The problem statement therefore survives:

> Product owners cannot completely specify behavior before seeing it, while coding agents are optimized to continue and can silently turn one plausible interpretation into a large change.

The evidence does **not** yet support the stronger statement that owners generally prefer reviewing two implementations, or that doing so reduces total oversight.

### The precise oversight slice this could change

General oversight includes planning, progress monitoring, correctness review, security review, integration review, and intent verification. Executable forks touch only one slice: **recovering an owner-authoritative product-policy choice that is difficult to express prospectively but easy to recognize in use**.

They do not establish:

- functional correctness outside the demonstrated journey;
- security, privacy, accessibility, or performance;
- what end users want;
- consensus among multiple stakeholders;
- whether the selected implementation is maintainable;
- whether a third, ungenerated behavior would be better.

Calling this “the solution to agent oversight” would be false. Calling it “a way to replace one abstract clarification exchange with a controlled behavioral experiment” is supportable.

## Closest current products and prior mechanisms

### Product collision map

| Product | Current capability | Collision with executable forks | Residual difference |
|---|---|---|---|
| [Replit Agent 4](https://replit.com/blog/introducing-agent-4-built-for-creativity) | Generates multiple UI variants on an infinite canvas, supports parallel agent tasks in isolated environments, shows progress before merge, and applies the selected design to production code. Replit also demonstrated multiple full landing-page variants and selection of a favorite. Its docs distinguish live artifact previews from lighter mockups. | **Very high.** “Generate options, compare, select, apply” inside a build-and-run environment is already a flagship feature. Isolated branch execution is also present elsewhere in the same product. | Replit describes user-invoked design exploration, not automatic detection of a material semantic ambiguity; its documented variants are primarily UI/design directions rather than controlled full-stack behavioral counterfactuals; selection is not documented as producing a versioned behavior contract and regression test. Sources: [launch](https://replit.com/blog/introducing-agent-4-built-for-creativity), [Agent 3 to 4](https://replit.com/blog/whats-changed-agent3-to-agent4), and [PM prototype guide](https://replit.com/blog/pm-guide-using-ai-to-build-prototypes). |
| [Figma's agent](https://www.figma.com/solutions/variation-generator/) and [Figma Make](https://help.figma.com/hc/en-us/articles/31304412302231-Explore-Figma-Make) | Generates multiple variants in parallel, keeps them in shared context, supports team comparison, and turns designs into interactive prototypes or web apps. | **High at the interaction level.** Side-by-side generated alternatives and collaborative choice are already explicit product primitives. | Figma is design-first. The documented variation flow concerns layout, style, theme, and responsive design, not isolated production-repository implementations that differ on one semantic behavior and compile the choice into a test. |
| [v0](https://v0.app/docs/api/platform/reference/chats/fork) | Forks a chat from any version, exposes runnable preview URLs and screenshots, associates chats with Git branches, and supports structured multiple-choice question resolution. | **High at the primitives level.** A developer can already fork, implement alternatives, preview them, and answer a structured question. | The workflow is manually composed. The documented API does not discover one high-value ambiguity, enforce a controlled single-variable contrast, run identical journeys, or persist the choice as a repository-level behavior contract. |
| [Acepe](https://acepe.dev/) | Runs Codex and other coding agents locally in parallel, captures canonical transcripts and diffs, and supports checkpoints and session/file reversion. | **Medium.** It supplies the local ADE, parallelism, review, and reversibility substrate. | It is a general agent cockpit, not an active intent-elicitation mechanism. |
| [pm7Code](https://pm7.codes/) | Runs several agents in one local workspace, asks structured multiple-choice questions, shows neighbor-agent opinions, includes a browser preview, and stores portable project preferences and conventions. | **Medium-high.** Text choice, alternative opinions, live preview, agent switching, and durable preferences are already combined in one ADE. | It does not document generating two controlled runnable implementations for one ambiguity or compiling the observed choice into an executable regression contract. |

The nearest incumbent language is unusually damaging to a broad novelty claim. Replit explicitly frames variants as useful when the user wants comparable options instead of one answer. Figma explicitly sells variation generation to avoid manually rebuilding the same design several ways. A pitch centered on “two versions you can choose between” will sound like a narrower implementation of products judges can already see.

### The mechanism also has established intellectual ancestry

- Requirements prototypes have long been used to expose ambiguity through experience. [Automated Prototype Generation from Formal Requirements Models](https://arxiv.org/abs/1808.10657) is one implementation lineage; the general practice predates LLMs.
- Programming by example already treats ambiguity as a choice among multiple programs consistent with partial evidence and uses active user interaction to disambiguate. Microsoft describes ranking and active-learning approaches in its [Programming by Examples overview](https://www.microsoft.com/en-us/research/publication/programming-examples-applications-ambiguity-resolutions-approach/).
- Pairwise trajectory choice is a standard preference-learning primitive. [CRED](https://arxiv.org/abs/2507.05458) generates counterfactual environments and diverse trajectories specifically to elicit informative rankings. [APRICOT](https://portal.cs.cornell.edu/apricot/) similarly combines active preference learning with constrained planning.
- Persisting human corrections as version-controlled agent rules is also emerging. A small 2026 preprint, [Self-Improving AI Coding Agents Through Accumulated Behavioral Rules](https://arxiv.org/abs/2607.13091), reports converting accepted review feedback into persistent rules. Its evidence is limited, but it narrows the novelty of “the agent remembers the choice.”
- Behavior-driven development and executable acceptance tests already make decisions durable. The novel burden is not storing an assertion; it is selecting the rare ambiguity for which an **executable contrast is a lower-cost query than words** and creating a fair contrast without contaminating objective quality.

### Honest novelty boundary

The following claims do not survive:

- “the first ADE that runs multiple implementations”;
- “the first way to compare generated variants”;
- “the first coding environment to ask users to choose”;
- “the first system to retain user preferences”;
- “the first use of executable prototypes to clarify requirements.”

The narrow claim that remains plausible, but is not proven by a market scan, is:

> A coding-agent harness that automatically chooses **executable pairwise comparison as the clarification modality**, constructs a controlled full-stack behavioral contrast, and turns the owner's observed selection into a testable repository contract.

That is a useful composition of known primitives. It is not a clean new category yet.

## Does it reduce total human oversight?

### Attention ledger

| Work | Single implementation + review | Text clarification | Executable fork |
|---|---|---|---|
| Detect ambiguity | Usually implicit or late | Agent must detect it | Agent must detect it and judge that execution is worth its cost |
| Human clarification | Often deferred into review and rework | Owner interprets an abstract question and predicts consequences | Owner performs two concrete journeys and chooses |
| Machine implementation | One branch, possibly wrong | One branch after answer | Two branches, intentionally divergent |
| Human behavior inspection | One implementation, then possibly a correction | One implementation | Two bounded journeys |
| Correctness review | Chosen change | Chosen change | Still required for the chosen change; loser must not require code review |
| Rework after wrong intent | Potentially high | Lower if the question was understood | Potentially lowest for experiential choices |
| Durable intent | Usually transcript/spec | Answer may remain in chat | Explicit decision plus executable contract |

Executable forks reduce oversight only when all of these are true:

1. The owner can recognize the desired behavior faster and more reliably than they can describe it.
2. The behavioral difference is material enough that a wrong guess would cause meaningful rework.
3. Both versions can be produced and validated without asking the owner to review two diffs.
4. Objective invariants are held constant, so the owner is not unknowingly choosing between “preferred but broken” and “less preferred but correct.”
5. The choice persists and actually prevents later re-litigation.
6. The trigger is rare. A product that forks on every interesting decision converts ambiguity into option debt.

It increases oversight when the agent presents superficial variations, frames a false binary, changes multiple dimensions, makes the owner test two large surfaces, or forks where one targeted question would do. The compute is not the core issue; the scarce resource is owner attention.

### Required fork gate

The product needs an explicit gate rather than a prompt instruction such as “show alternatives when useful.” A candidate fork is admissible only if:

- **authority:** the current owner is entitled to decide this product behavior;
- **subjectivity:** no external standard, deterministic oracle, or repository precedent already resolves it;
- **materiality:** the interpretations produce a consequential user-visible state difference;
- **reversibility:** neither branch causes irreversible external effects;
- **contrastability:** exactly one disputed behavior can vary while shared invariants remain fixed;
- **experiential advantage:** answering by use is predicted to require less human effort than a targeted textual question or micro-prototype;
- **boundedness:** two branches and one journey are sufficient; the system can offer “neither” without silently choosing a third interpretation;
- **persistence value:** the decision is likely to recur and can be represented as a stable behavioral constraint.

The default must be **do not fork**. Ask a question when words are enough. Use a static mockup when behavior is not the issue. Run a deterministic test when correctness is externally defined. Escalate to user research when the owner is not the end user's proxy.

## Exact causal chain

1. **Observe:** GPT-5.6 reads the request, relevant repository history, tests, decision records, and current running behavior.
2. **Localize:** it emits one structured ambiguity object: competing interpretations, affected actors and states, owner authority, reversibility, materiality, and why existing evidence does not decide it.
3. **Select the query modality:** a deterministic policy compares ask, mock, execute, or abstain. Only the execute path reaches the fork workflow.
4. **Freeze invariants:** the harness records a base commit, seed data, journey steps, objective checks, and the single behavioral dimension allowed to differ.
5. **Construct counterfactuals:** two independent GPT-5.6 coding agents receive the same base and invariants but opposite interpretation contracts. They work in isolated sandboxes or worktrees.
6. **Reject invalid contrasts:** deterministic build, test, accessibility, security, state, and diff-scope checks ensure both branches satisfy the shared invariants. If either fails, there is no user choice yet.
7. **Run the same journey:** a browser runner resets both environments to identical state. The owner interacts with neutrally labeled A and B in randomized order. The interface highlights only externally observed state transitions, not model rhetoric about trade-offs.
8. **Settle intent:** the owner chooses A, B, or neither. The model does not vote. “Neither” returns to clarification and records no preference.
9. **Compile the decision:** the harness writes a versioned decision record containing scope, selected observable behavior, rejected counterfactual, provenance, supersession rules, and an executable journey assertion derived from the selected state transition.
10. **Integrate:** the selected branch enters normal review and merge; the losing worktree is destroyed. Future changes must pass the behavior contract or explicitly request that the owner supersede it.

The changed causal chain is narrow but real:

```text
underspecified request
  -> silent model guess
  -> large implementation
  -> owner discovers wrong intent in review
  -> explanation + rework

becomes

underspecified request
  -> one high-value ambiguity detected
  -> controlled runnable A/B
  -> owner observes the consequence and chooses
  -> choice becomes an executable constraint
  -> one implementation proceeds with intent already settled
```

The mechanism earns its keep only if the second path consumes less **active human attention** over the whole cycle.

## Demonstration that would prove the mechanism rather than the UI

### Scenario

The user asks an agent to improve editing for a published automation. The request does not say whether saving an edit should immediately alter the live automation or create a draft that requires a separate publish action. Both policies are coherent, affect real user state, and are owner-authoritative.

### Three-minute causal spine

1. Show the request and the current published automation. The system marks exactly one unresolved behavior: what `Save` means after publication.
2. Show the fork receipt: same base SHA, same seeded workflow, same invariants, one allowed difference.
3. Two GPT-5.6 agents implement in parallel:
   - A: `Save` updates the live automation immediately and records the revision.
   - B: `Save` creates a draft; `Publish` is required to alter the live automation.
4. The owner opens the same automation, changes the same rule, and presses `Save` in both neutrally labeled environments. A live-status panel makes the different external state undeniable.
5. The owner selects B. The tool discards A, promotes B, and creates a decision such as “edits to published automations are draft-gated” plus an end-to-end assertion that the live revision remains unchanged after `Save` and changes only after `Publish`.
6. A follow-up agent request accidentally attempts immediate-live save behavior. The persisted contract fails, the agent repairs the change, and the test passes. This last beat proves the product changed future work; without it, the demo is only variant theater.

The memorable moment is not two preview windows. It is the selected observed behavior becoming a constraint that stops a later regression.

## External truth boundary

The owner click is authoritative only for a bounded product-policy preference. It is not a correctness oracle.

| Claim | Truth source |
|---|---|
| “The owner wants draft-gated publication” | The owner's explicit A/B/neither selection, with version and scope. |
| “Both branches preserve current behavior outside the disputed transition” | Existing independent tests plus deterministic state comparisons. |
| “The selected branch is secure, accessible, performant, and maintainable” | Independent scanners, tests, standards, and human review—not the preference click. |
| “End users will prefer this” | Actual user research or production experiment, not the owner or GPT-5.6. |
| “This decision remains valid forever” | Nothing. The record must support explicit supersession and expiry or scope changes. |

The behavioral test is not circular in the same way as model self-review because the value judgment comes from the owner observing an external state transition. It can still become tautological if the agent writes an assertion that merely snapshots its own DOM. The durable contract must name a user action, a domain state before and after, and an invariant whose observation is independent of model prose.

Sensitive or irreversible actions are out of scope. The comparison environments must use synthetic or sandboxed data and must not send messages, charge cards, alter production, rotate credentials, or invoke other external effects.

## GPT-5.6: structural role and ablation risk

Official documentation positions [GPT-5.6 Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol) as the frontier model for complex professional work and lists a 1.05-million-token context window, structured outputs, function calling, hosted shell, Apply Patch, computer use, MCP, and tool search through the Responses API. Those capabilities make the complete loop plausible:

- inspect a large repository and history before claiming ambiguity;
- emit a typed ambiguity and invariant contract;
- implement two nontrivial branches rather than two screenshots;
- use shell and Apply Patch in isolated environments;
- drive the same browser journey and reason over visual plus domain state;
- compile the selected state transition into a repository artifact and executable check.

GPT-5.6 should generate ambiguity hypotheses and execute counterfactuals. It must **not** supply the preference label, correctness oracle, sandbox isolation, state reset, merge policy, or evidence receipt. Those belong to the human and deterministic harness.

The model is central to the workflow but not uniquely necessary. Any sufficiently capable coding-and-computer-use model could attempt it. A hackathon submission should therefore demonstrate a GPT-5.6-specific capability ablation rather than say “we use the newest model”:

- full-repository ambiguity localization versus prompt-only detection;
- one agent producing both branches sequentially versus independent same-base branches;
- text-only comparison versus GPT-5.6-driven runnable, state-instrumented journeys;
- no persisted contract versus the follow-up regression caught by the selected contract.

If two templated prompts plus `git worktree add` produce the same result, GPT-5.6 is decorative. If a smaller or older model matches ambiguity precision, controlled-difference quality, and contract correctness, the product may still be useful, but its GPT-5.6-native hackathon case weakens.

## Category or feature?

### As proposed: feature

“Run two branches and let me choose” is an ADE feature. Replit, Figma, v0, Acepe, and pm7Code already own most of its visible primitives. It is easy for an incumbent with branch, preview, and agent infrastructure to absorb. Wrapping it in a local IDE shell does not create a category.

### Reshaped product thesis: executable intent elicitation

The stronger framing is a protocol and evidence layer that can plug into Codex, existing IDEs, or ADEs:

- selects the least-cost clarification modality;
- constructs controlled behavioral counterfactuals only when justified;
- records reproducible comparison receipts;
- compiles human choices into portable behavior contracts;
- tracks scope, conflicts, supersession, and later regressions across agents.

Its persistent artifacts—not the split-screen interface—would be the potential category primitive:

- `intent-decisions/*.yaml` for authority, scope, selected behavior, rejected counterfactual, and supersession;
- `journeys/*.spec.ts` for externally observable state transitions;
- fork receipts binding base SHA, seed state, invariants, and branch deltas;
- an intent graph that detects when a future request conflicts with an earlier owner-set behavior.

Even this remains exposed to platform absorption. Defensibility would have to come from a validated ambiguity benchmark, a cross-agent contract format, and evidence that the modality router reduces attention—not from owning an editor.

## Decisive experiment

Do not advance this on demo appeal. Run a preregistered, within-subject comparison against the strongest current substitutes.

### Conditions

Use the same repository, model, objective invariant suite, and product owner in three randomized conditions:

1. **Structured clarification:** an uncertainty-aware agent asks one optimized textual multiple-choice or free-response question, approximating SAGE/v0/pm7Code.
2. **Lightweight variants:** the agent shows plans or interactive mockups, approximating Figma/Replit design exploration without two production implementations.
3. **Executable forks:** the audited mechanism, including same-base isolation, neutral identical journeys, selection, and a persistent behavioral contract.

Include two task classes:

- **tacit but recoverable intent:** the participant privately knows the desired behavior before the run, allowing intent-alignment accuracy to be measured independently;
- **preference formed through use:** the participant reasonably cannot settle the decision until experiencing consequences, allowing decision confidence, later reversal, and rework to be measured without pretending a hidden answer existed.

Include unambiguous and objectively resolvable control tasks. A good router should almost never fork them.

### Primary measures

- active human attention from initial request to accepted implementation;
- intent-faithful first acceptance on the recoverable-intent tasks;
- wrong-intent rework and decision reversal after a delayed second look;
- objective invariant pass rate and defects in the selected branch;
- fork-trigger precision, false-positive fork rate, and “neither” rate;
- number of behavioral dimensions that unintentionally differed between A and B;
- recurrence of the settled ambiguity in a later change with and without the persisted contract.

### Advance rule

Advance only if executable forks, against the **better** of the two baselines:

1. reduce median active owner attention by at least 25%;
2. improve intent-faithful first acceptance or delayed wrong-intent rework by at least 20%;
3. remain non-inferior on objective defects and invariant pass rate;
4. keep false-positive forks on control tasks below 10%; and
5. show that the persisted contract prevents a later seeded regression materially more often than ordinary transcript/project memory.

The thresholds are product hypotheses to preregister, not facts established by the literature.

### Kill rule

Kill the direction as a standalone product if any of these occur:

- structured text questions are equally accurate with less owner attention;
- lightweight interactive mockups capture the same preference without full implementation;
- owners inspect or review both diffs, causing total attention to rise;
- the ambiguity detector frequently forks unimportant or objectively decidable questions;
- A and B differ on multiple uncontrolled dimensions, so the choice is uninterpretable;
- “neither” is common because the agent frames false binaries;
- selected contracts mostly snapshot the current implementation and fail to prevent later semantic regressions;
- Replit Agent 4's native flow matches the result in a direct head-to-head test.

## Final assessment

| Dimension | Assessment | Confidence |
|---|---|---|
| Problem existence | **High.** Agent oversight and ambiguity-driven guessing are well supported. | High |
| Software-addressable causal share | **Medium.** Executable comparison can settle a narrow class of experiential product choices. | Medium |
| Total oversight reduction | **Unproven.** It can either compress clarification or double the surface the owner must inspect. | Low-medium |
| Novelty | **Low as an ADE feature; medium-low as a controlled behavioral clarification protocol.** | High on incumbent collision; medium on market completeness |
| GPT-5.6 leverage | **Potentially high in execution, not in truth.** The model can inspect, branch, implement, and operate; the owner and harness must judge. | Medium-high |
| Demonstrability | **High.** The A/B state transition and later contract-caught regression form a strong causal demo. | High |
| Category potential | **Not yet.** It is a feature until cross-agent portable contracts and measured attention reduction create a protocol layer. | High |
| Absorption risk | **Very high.** Replit already owns the nearest visible workflow and infrastructure. | High |

**Tournament disposition: RESHAPE, then falsify.** Keep it as a serious experimental reserve because it has a better human interaction than plan theater and a truthful external boundary. Do not select it as the leading “revolutionary local ADE” idea on novelty alone. The research must first show that executable clarification beats both one good question and one cheap interactive mockup on total human attention.
