# Causal-history novelty and falsification audit

**Date:** 2026-07-19
**Question audited:** Whether a local-first developer environment should mine candidate companion-change obligations from repository history, promote them only after historical ablation/replay produces an observable behavioral consequence, preserve the result as an executable provenance-backed guard, and optionally prioritize high-information combinations of individually green agent changes.

## Verdict

**RESHAPE, then conditionally advance the narrow research hypothesis.** Do not present the broad ADE, repository-memory, co-change-mining, executable-contract, replay, or PR-gating ideas as novel. Every one of those components has close prior art. The only defensible residual claim I found is this promotion rule and artifact:

> A history-mined co-change hypothesis is not enforceable until a hermetic historical intervention shows **full change passes, semantic ablation fails, and restoration rescues the same external observation**; the system then preserves the minimal replayable witness, its scope, and its provenance as a future guard.

That is a potentially useful systems synthesis, not yet a demonstrated new category or algorithm. It earns an advance only if it produces **incremental catches beyond ordinary CI and materially fewer false alarms than co-change miners**. The optional search over combinations of green changes should be a separate experimental track, not part of the core novelty claim.

The strongest reason to be skeptical is an oracle paradox: if the test that exposes the ablation already runs on future pull requests, the new contract largely duplicates CI; if that observation is not independent, stable, and runnable later, the contract has no trustworthy enforcement oracle. The product has value only when it can turn a latent, expensive, historical, or otherwise absent observation into a cheaper durable witness that normal CI did not already provide.

## 1. Is the problem independently supported?

### Missed companion changes: yes, strongly

This is an old, independently observed maintenance problem rather than an invented agent-era problem.

- **ROSE** mined version histories to recommend related edits in the IDE two decades ago ([Zimmermann et al., *Mining Version Histories to Guide Software Changes*](https://www.cs.kent.edu/~jmaletic/cs63902/Papers/Zimmermann04.pdf)).
- **Microsoft Rex** mined file-level association rules, refined them with syntactic differences, and warned at commit/PR time when part of a correlated set was missing. Microsoft reports a 14-month deployment over 360 repositories and 4,926 suggestions on which engineers acted ([Microsoft Research](https://www.microsoft.com/en-us/research/publication/rex-preventing-bugs-and-misconfiguration-in-large-services-using-correlated-change-analysis/); [NSDI paper](https://www.usenix.org/system/files/nsdi20-paper-mehta.pdf)). Importantly, Rex explicitly says its evidence is “correlation, not causation,” and its operational true-positive label is developer action on the suggestion, not a separately measured behavioral failure.
- A recent PR-level research system combines historical co-change with static impact analysis and warns when an expected file is absent; its review of prior systems identifies ROSE, CHID, Diggit, CRITICS, and commercial missing-co-change alerts as antecedents ([*Enhanced code reviews using pull request based change impact analysis*](https://link.springer.com/article/10.1007/s10664-024-10600-2)).
- Current products already expose this workflow. **CodeScene** calls it temporal coupling and uses repository history to find hidden dependencies and expected coupled changes ([documentation](https://docs.enterprise.codescene.io/versions/3.3.8/guides/technical/temporal-coupling.html)). **CKB** advertises local deterministic PR checks, Git co-change analysis, a “co-changed file missing” warning, CI gates, and MCP integration ([product page](https://www.codeknowledge.dev/features/code-review)). Recently indexed **LaserOwl** documentation described an MCP plan-evaluation agent using co-change history and planned files; that product now redirects to a different product, Waypoint, so it is prior product evidence rather than a claim about its current offering ([current company page](https://www.laserowl.io/); [Waypoint](https://www.getwaypoint.dev/)).

These sources establish that undocumented correlated edits create real review and maintenance friction. They do **not** establish that file-level co-change is an invariant, that the omitted edit causes a defect, or that another alerting product is valuable. Rex's own wording and the low precision of unrefined deployment suggestions make that distinction central.

### Individually green changes that interact: yes, but much of the obvious solution already exists

- GitLab's merge-train documentation states the exact operational failure: merge requests can pass independently yet break when combined, so the train tests cumulative combinations ([GitLab](https://docs.gitlab.com/ci/pipelines/merge_trains/)). GitHub's merge queue similarly tests a queued pull request against the latest base plus earlier queued changes ([GitHub](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/incorporating-changes-from-a-pull-request/merging-a-pull-request-with-a-merge-queue)).
- **CooperBench** deliberately pairs logically compatible but overlapping or interdependent features from the same repository state. Its 652 tasks across 12 codebases and four languages provide expert-written implementations and tests; reported cooperative success is far below the corresponding solo task success, and a clean textual merge can still encode incompatible assumptions ([paper](https://arxiv.org/abs/2601.13295); [benchmark PDF](https://cooperbench.com/static/pdfs/main.pdf)).
- A June 2026 preprint analyzing roughly 930,000 agent-authored PRs reports substantial repository-level integration friction after controls. It is useful corroboration but remains a recent observational preprint, not causal proof ([preprint](https://arxiv.org/abs/2606.28235)).

Therefore the problem is supported. Generic batching, ordering, and testing of known queued changes are not white space. The narrower open question is whether semantic history can identify **non-obvious, non-prefix combinations** worth testing under a constrained sandbox budget.

## 2. Exact closest prior art

There is no single closest system for the whole proposal. The closest composite is **Rex/ROSE-style candidate mining + delta debugging/counterexample-based falsification + Software Change Contracts + a local PR gate**.

| Prior art | Exact overlap | Material difference from the proposed narrow mechanism | Novelty consequence |
|---|---|---|---|
| [ROSE](https://www.cs.kent.edu/~jmaletic/cs63902/Papers/Zimmermann04.pdf), [Rex](https://www.usenix.org/system/files/nsdi20-paper-mehta.pdf), [CodeScene](https://docs.enterprise.codescene.io/versions/3.3.8/guides/technical/temporal-coupling.html), CKB, Diggit, CHID | Mine repeated co-changes and warn when a related artifact is missing; some already operate in PRs/CI and show historical provenance. | They promote correlations statistically or heuristically; they do not require an ablation-failure-rescue witness against an external behavioral oracle. | Candidate discovery and future warnings are established. Behavioral qualification is the only possible wedge. |
| [CRITICS](https://tianyi-zhang.github.io/files/icse2015-critics.pdf) | Derives a change template from a diff and finds structurally similar locations that were not updated. | Static systematic-edit completeness, not longitudinal co-change plus behavioral replay. | “Find the missed edit” is not new; the source and validation method may be. |
| [Coming](https://arxiv.org/abs/1810.08532) and [DevReplay](https://arxiv.org/abs/2005.11040) | Detect or mine fine-grained change patterns from Git history; DevReplay can recommend/apply project-specific fixes. | Transform patterns, not cross-artifact obligations qualified by counterfactual behavior. | History-to-executable-pattern compilation is established. |
| [*Software Change Contracts* (ISSTA 2013)](https://www.jooyongyi.com/papers/ISSTA13.pdf) and its [extended treatment](https://abhikrc.com/pdf/TOSEM15.pdf) | Executable contracts describe intended behavioral/structural relations between old and new versions; dynamic and static checking compare versions. Contracts can live with versioned changes. | Contracts are authored specifications rather than automatically promoted history-mined co-change hypotheses. | **Do not claim or use “change contract” as a new term.** The exact name and cross-version executable concept are established. |
| [Delta debugging](https://www.cs.purdue.edu/homes/xyzhang/fall07/Papers/delta-debugging.pdf) | Repeated controlled tests isolate a failure-inducing input or change; produces a 1-minimal explanation under its test. | It does not infer a durable repository obligation or developer intent. | Ablating edits to isolate an observed failure is established. |
| [Daikon](https://plse.cs.washington.edu/daikon/pubs/invariants-tse2001-abstract.html), [held-out invariant validation](https://www.microsoft.com/en-us/research/publication/are-my-invariants-valid-a-learning-approach/), and [DICE](https://arxiv.org/abs/2103.15350) | Infer candidate invariants/specifications from observations, then use held-out executions or generated counterexamples to reject spurious candidates. | They infer program properties, not necessarily repository companion-change obligations or future PR gates. | “Mine, try to falsify, then retain” is established as a general method. |
| [Google mutation testing](https://research.google/pubs/state-of-mutation-testing-at-google/) and [commit-aware mutation](https://link.springer.com/article/10.1007/s10664-022-10138-1) | Perturb programs to ask whether tests distinguish changed behavior; commit-aware methods focus perturbations around a change. | A killed mutant establishes test sensitivity to a synthetic perturbation, not that two artifacts should co-change. | Mutation is a necessary baseline and an alternative explanation for apparent value. |
| [APX](https://apx.guide/), [ArchRails](https://archrails.io/), and [Mneme HQ](https://mnemehq.com/) | Local/BYOC deterministic enforcement, explicit executable architectural or semantic rules, provenance/receipts, MCP and CI workflows. | Their rules are declared or curated; they do not discover and behaviorally qualify co-change obligations from history. | Local-first, provenance, architecture rules, and deterministic gates are product features, not novelty. Vendor claims are self-described, not independent validation. |
| [Mneme](https://mnem.dev/) | Synthesizes decisions and recurring patterns from Slack, PRs, and tickets with source provenance and surfaces them to coding agents. | Memory/context rather than a hermetically replayed executable guard. | Cross-source repository memory and provenance are occupied territory. |
| [CoAgent/MTPO](https://arxiv.org/abs/2606.15376) | Coordinates concurrent agents sharing live state using ordered transactions, filtered reads, speculative writes, notifications, repair, and undo/reorder mechanisms. | It controls live execution and aims for serializable outcomes; it does not mine historical obligations or compile replay witnesses. | If the project becomes generic multi-agent concurrency control, this work erases the claimed wedge. |
| GitHub/GitLab merge queues and merge trains | Test combined queued changes in a controlled order using the real CI suite. | Usually test queue prefixes, not semantically selected arbitrary or distant subsets; do not learn latent obligations. | Ordinary green-change composition is already solved to the extent CI and queue order expose it. |
| [CooperBench](https://arxiv.org/abs/2601.13295) | External ground truth for interacting feature changes and multi-agent cooperation. | Benchmark, not a preventive mechanism. | It is the best ready-made test bed for the optional combination-ranking claim. |

**Closest single research/production antecedent:** Rex for the core mining-to-warning workflow.
**Closest current product cluster:** CodeScene/CKB and the earlier LaserOwl framing.
**Closest antecedent for the proposed output:** Software Change Contracts.
**Closest antecedent for the proposed qualification step:** delta debugging plus counterexample-guided specification mining.

I found no primary source in this focused audit that requires the complete automatic pipeline—history-mined co-change candidate, hermetic semantic ablation, external-oracle failure, restoration rescue, then promotion of that exact witness into a future PR guard. That is an evidence-bounded search result, not a patent or freedom-to-operate opinion. It supports only a **combination-level** novelty claim.

## 3. What is actually new, if anything?

Potentially new as an integrated mechanism:

1. **Behavioral qualification as a hard promotion boundary.** History may propose a rule, but frequency, an LLM judgment, developer acceptance, or a passing replay cannot promote it. Only a reproducible intervention and rescue can.
2. **A durable witness artifact.** The promoted artifact should contain the historical snapshot, semantic edit group, ablated variant, oracle and inputs, pass/fail/rescue observations, environment, scope, confidence limits, and source provenance—not merely “files A and B usually change together.”
3. **Explicitly local validity.** The artifact says “edit E was necessary for outcome Y under snapshot S and workload W,” with expiry/revalidation, rather than silently turning historical convention into a global rule.
4. **Incremental-oracle compilation.** If the system can minimize an expensive or previously non-CI historical scenario into a cheap future check, it creates protection ordinary CI did not contain. This is the most plausible product value.

Not new:

- mining Git/PR history, co-change recommendation, missing-file warnings;
- generating or replaying change patterns;
- mutation, ablation, delta debugging, or falsifying inferred invariants;
- executable cross-version contracts;
- deterministic architecture rules, receipts, provenance, local execution, MCP integration, or CI gating;
- sandboxes, agent memory, merge queues, or testing cumulative combinations.

The proposal should therefore be named around **counterfactually witnessed obligations** or **historical behavioral witnesses**, not “change contracts,” “causal contracts,” a generic “agent governance layer,” or a revolutionary ADE. Its scientific claim is a qualification policy; its product claim is reduced false alarms plus newly durable checks.

## 4. Does counterfactual replay establish causality?

It establishes a narrow causal fact only under demanding conditions.

If the exact historical full change passes, removing one semantically coherent edit is the only intervention, the same external workload then fails, restoring that edit rescues the outcome, and the result repeats in a hermetic environment, there is interventional evidence that the edit was necessary for **that measured outcome in that snapshot**. This is stronger than temporal correlation.

It does **not** establish:

- the original developer's intent;
- that two files or concepts must always change together;
- that the edit is the unique or minimal acceptable remedy;
- that an alternative implementation would fail;
- that the relation remains valid after architecture or dependency changes;
- that passing the selected oracle means the system is correct;
- a general causal relationship between the artifacts.

Several details are required to avoid overclaiming:

- Use a semantic hunk/edit group, not arbitrary file deletion. An ablated version may otherwise be an impossible intermediate program.
- Require **pass → fail → rescue**, repeated runs, flake classification, and negative-control ablations. A single pass/fail pair is weak evidence.
- Record exact toolchain, dependencies, services, data, feature flags, and inputs. “Same repository commit” is not “all else held constant.”
- Keep an `unreplayable`/`unknown` result. Dependency rot, unavailable services, nondeterminism, secrets, and data drift must not be converted into negative evidence.
- Scope and expire witnesses. Interactions can be non-monotonic; a one-minimal delta is not necessarily the only cause, and later changes can legitimately invalidate it.
- Keep the behavioral oracle independent of candidate generation. PR prose, repeated co-change, an LLM's judgment, and the test added by the candidate cannot all serve as both hypothesis source and proof.

The honest language is **“counterfactual witness of observed necessity under S/W”**, not “causal proof,” “repository truth,” or “invariant.”

## 5. Strongest feasible evaluation with external ground truth

The decisive experiment is not whether the system can rediscover co-change. It is whether qualification yields **more real omitted-change defects caught per developer interruption than the closest baselines, beyond the full existing CI suite**.

### Dataset and leakage boundary

1. Select mature, reproducibly buildable repositories and choose a chronological cutoff. Candidate mining may see only commits, PR metadata, issues, and tests available before the cutoff.
2. Construct a held-out set from real issue-linked fixes, regressions, rollbacks, and partial/incomplete fixes after the cutoff. Prefer externally curated real-fault corpora such as [Defects4J](https://github.com/rjust/defects4j) and [BugsInPy](https://github.com/soarsmu/BugsInPy), then add repository-specific incidents whose initial CI was green but a later acceptance or production workload exposed the missing companion change.
3. Keep acceptance tests, later regression tests, incident outcomes, and maintainer labels hidden from candidate mining and guard synthesis. They are the evaluator, not training evidence.
4. SWE-bench Verified can supplement issue-level episodes, but it should not be the sole authority: it is a human-filtered 500-task set, and OpenAI now reports it no longer uses it for frontier evaluation after finding remaining test/specification problems ([original Verified methodology](https://openai.com/index/introducing-swe-bench-verified/); [2026 audit](https://openai.com/index/why-we-no-longer-evaluate-swe-bench-verified/)).

### Positive and negative episodes

For a real accepted multi-artifact fix:

1. Recreate the parent snapshot.
2. Apply the complete fix and confirm the hidden external oracle passes.
3. Remove one semantically coherent candidate companion edit while retaining the rest.
4. Count a positive obligation only if the hidden oracle fails reproducibly and restoring the omitted edit rescues it.
5. Include matched negatives: frequent co-change pairs with no hidden behavioral effect, unrelated edits with similar file distance/churn, intentional one-sided deviations, generated mutants, and alternative valid implementations.

This design provides an actual behavioral label rather than treating co-change frequency or developer compliance as ground truth. Maintainer adjudication should separately label whether the guard captures intended behavior and whether an alternative satisfying implementation should pass.

### Baselines

Compare under the same history cutoff and alert budget:

- ROSE/Rex-style association rules;
- CodeScene/CKB/LaserOwl-style co-change thresholds;
- PR co-change plus call/dependency impact analysis (CHID-like);
- static call/data/config dependency impact;
- Daikon/specification mining;
- standard and commit-aware mutation testing;
- full existing CI, with no added guard;
- an oracle-minimization-only baseline that creates regression tests without history-mined co-change.

The last two are essential. They reveal whether the benefit comes from causal-history mining or simply from running/generating more tests.

### Primary metrics

- held-out real omission defects caught;
- **incremental catches not already caught by unchanged full CI**;
- precision/recall and recall at a fixed alert budget;
- false blocks and alerts per PR;
- future predictive validity of promoted witnesses;
- alternative-valid-implementation acceptance;
- reproducible replay coverage and explicit abstention rate;
- witness flake, staleness, expiry, and maintenance rates;
- sandbox executions and wall-clock/compute per incremental catch.

Run a prospective shadow deployment after the retrospective study. Generate warnings silently, freeze them before outcomes, and have maintainers blind-rate genuine omissions, acceptable alternatives, and useless alerts. Only then test blocking behavior.

### Separate evaluation for high-information combinations

Use [CooperBench](https://cooperbench.com/static/pdfs/main.pdf), whose expert implementations and tests provide external interaction ground truth. For small candidate pools, exhaustively run all pairs/subsets to reveal the complete interaction set, then compare:

- semantic-history ranking;
- static-dependency ranking;
- merge-queue prefix order;
- random ranking;
- exhaustive testing as the ceiling.

Measure interaction failures found per sandbox execution and missed interactions under a fixed budget. Success requires finding non-prefix interactions earlier than these baselines. Do not claim generic concurrency control; [CoAgent/MTPO](https://arxiv.org/abs/2606.15376) and merge queues already occupy that problem.

## 6. Fatal flaw

**Oracle laundering and redundancy.** The system risks laundering “the repository's current tests noticed this” into “history proved a durable causal invariant.”

- If the qualifying oracle already runs unchanged on every future PR, then the omitted companion edit already fails CI; the new guard adds explanation or speed, not protection.
- If the oracle is the test added in the same historical patch, candidate and validation share an origin and can encode the same mistaken assumption.
- If the oracle is an unavailable production incident, flaky integration environment, or unreproducible external service, there may be no durable future checker.
- If a historical observation is frozen indefinitely, accidental behavior becomes policy and legitimate redesigns are blocked.
- Replayability creates survivorship bias: easy pure-code episodes are promoted, while configuration, distributed state, migrations, external APIs, and data-dependent failures—the high-value cases—become `unreplayable` and disappear from the evidence.

This is fatal to the current claim unless the artifact preserves an **independent, reproducible, scoped future oracle** and the evaluation reports incremental catches beyond CI. A textual rule or file-pair gate does not solve it. The strongest reshape is to make **preserving/minimizing the historical behavioral witness** the product, with co-change mining merely one way to propose where to look.

## 7. Advance, reshape, or kill

### Decision: RESHAPE

Advance this formulation to an evidence experiment:

> Mine hypotheses broadly; enforce nothing from frequency alone. Promote only a scoped obligation with a reproducible ablation-failure-rescue witness against an independent oracle, compile that witness into a durable check that adds coverage beyond existing CI, and retain provenance plus expiry.

Keep the following out of the core claim:

- revolutionary local ADE;
- generic repository memory or governance;
- generic multi-agent merge/concurrency handling;
- “we prove causality”;
- “Software Change Contracts” as a new name;
- optional combination search until it independently beats queue/dependency/random baselines.

**Advance** only if the blinded, time-split evaluation shows materially better precision at comparable recall than co-change/impact baselines and catches real held-out omissions that unchanged CI misses.
**Kill** the mechanism as a standalone product thesis if promoted witnesses mostly duplicate CI, depend on circular/self-authored tests, cannot survive replay, reject valid alternative implementations, or fail to improve the developer-interruption tradeoff over Rex-style warnings plus ordinary regression-test generation.

This is a real problem and a technically serious experiment. It is not yet evidence for a new category. The credible white space is the narrow gap between **correlated historical advice** and a **durable, externally witnessed behavioral guard**.
