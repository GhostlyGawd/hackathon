# Developer Tools causal-mechanism tournament

Research snapshot: 2026-07-19. This document starts from the surviving problem surfaces in the raw atlas and the independent market, validity/safety, and judge reviews. It proposes mechanisms, not products. Build time is not a selection factor.

## Non-negotiable design constraints

- The model may propose hypotheses, routes, or candidate boundaries; it may not certify its own output.
- A pass/fail or promotion decision must terminate in executed behavior, registry facts, signed provenance, a maintainer-owned threshold, or another externally checkable observation.
- “Unknown” must be a first-class state. A mechanism that cannot obtain authority, representative tasks, a reversible boundary, or a usable oracle must stop.
- Generic code review, architecture rules, eval dashboards, anti-slop scoring, sandboxes, TDD, planning artifacts, code graphs, and model-authored proof packets are excluded.
- The desired primitive changes a feedback loop or coordination protocol. Merely adding an LLM to an existing gate is not enough.

Current adjacent work materially narrows the space. GitHub pull-request limits bound incoming volume but still leave review human-time intensive; merge queues validate queued heads against required checks. LaunchDarkly already performs metric-guarded rollout and automatic rollback. The official MCP Inspector and conformance suite test individual servers and protocol behavior, while OpenAI tool search dynamically loads deferred tools. Microsoft’s MCP Interviewer inspects individual servers and may use LLM-generated tests and an LLM judge. Microsoft’s Rex learns historical co-change rules and suggests companion edits. npm trusted publishing and provenance bind a published artifact to a workflow and source commit, but npm explicitly says provenance does not prove that code is safe. These are real substitutes, not straw men.

Two 2026 coordination results are especially important:

- [CoAgent/MTPO](https://arxiv.org/abs/2606.15376) provides advisory concurrency control over shared mutable state: declared tool footprints, a fixed serialization order, notifications, selective repair, and saga-style inverses. A new mechanism cannot call ordinary agent transaction control white space.
- [CooperBench](https://arxiv.org/abs/2601.13295) reports an average 30% cooperative success penalty across more than 600 repository-grounded tasks; communication alone did not fix vague commitments, commitment violations, or false beliefs about collaborators. This supports a coordination gap but also warns that another chat channel is not a mechanism.

## Surface 1 — Open-source openness versus maintainer trust cost

### O1 — Revocable merge leases

The unit of acceptance becomes a time-bounded, empirically renewable lease rather than a permanent trust decision.

- **M/W/O/K causal chain:** Because the system admits a low-blast-radius newcomer change behind a reversible boundary, exposes it only to an opt-in canary or downstream witness set, and automatically renews or reverts it against maintainer-owned invariants (**M**), the maintainer no longer has to infer durable contributor trust before any real use (**W**). Openness is preserved while the downside of a mistaken admission is bounded (**O**), measured by maintainer minutes per valuable newcomer, valuable-newcomer recall, regressions escaping beyond the lease cohort, rollback latency, and contributor response during the lease (**K**).
- **Why named substitutes cannot do it:** [GitHub PR limits](https://github.blog/open-source/maintainers/how-pull-request-limits-are-cutting-down-the-noise/) ration volume by contributor permission; templates ask for claims; Anti Slop and Copilot review classify or review the artifact; [merge queues](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/incorporating-changes-from-a-pull-request/merging-a-pull-request-with-a-merge-queue) run pre-merge checks. [LaunchDarkly guarded rollouts](https://launchdarkly.com/docs/home/releases/managing-guarded-rollouts) already bound release risk with metrics and rollback, but only after a team has chosen and instrumented a release. None makes empirical, revocable exposure the admission contract between an open project and an unknown contributor.
- **Externally checkable ground truth:** repository and downstream test outcomes, signed canary metrics and thresholds, actual rollback/renewal events, and contributor response timestamps. Contributor prose and model confidence never count.
- **Minimum authority/data:** PR read access, an ephemeral build, a maintainer-selected witness set, a narrow deployment/feature boundary, and authority to revert only the leased change. It needs no repository secrets beyond those already required by the selected checks.
- **Visible under-three-minute demonstration:** two polished newcomer PRs are locally green. Both receive leases. A downstream witness triggers a pre-seeded compatibility failure in one; the actual deployed/branch state reverts and the affected witness recovers. The other survives the window and its lease renews. The visible state change is merge -> bounded exposure -> external failure -> rollback, not a risk score.
- **Failure/abstention:** security boundaries, destructive migrations, irreversible data writes, public-contract removal, absent rollback, or insufficient witness traffic produce `REVIEW REQUIRED — NOT LEASABLE`. The mechanism never silently treats lack of observations as safety.
- **GPT-5.6 structural leverage:** long-context intent recovery can map a diff, issue, downstream manifests, and prior releases to candidate reversible seams and affected witnesses. Independent subagents can search different downstream surfaces; Programmatic Tool Calling can fan out builds and join outcome records. A maintainer-owned invariant and executed outcome—not GPT-5.6—controls renewal.
- **Strongest feature-not-category argument:** this is merge-queue plus progressive-delivery composition, and a code host or release platform could absorb it. It becomes category-shaping only if a portable lease object changes open-source admission and post-merge responsibility across hosts; otherwise it is a GitHub/LaunchDarkly feature.

### O2 — Reciprocal review admission

Review attention is exchanged for a bounded, repository-grounded act of stewardship rather than allocated from identity, writing style, or AI-authorship guesses.

- **M/W/O/K causal chain:** Because each scarce review slot is unlocked by completing one maintainer-published, randomly assigned action with an executable result—such as reproducing a bug, minimizing a failure, or validating a downstream case (**M**)—the maintainer no longer has to spend the first review cycle learning whether a drive-by contributor will engage with project-specific evidence (**W**). Cheap generation no longer implies cheap consumption of the project’s review queue, without closing the door by newcomer status (**O**), measurable by maintainer minutes per admitted PR, useful-contribution recall, newcomer abandonment and disparity, contributor time, and post-admission follow-through (**K**).
- **Why named substitutes cannot do it:** PR limits ration quantity, templates request self-attestation, bounties price tasks in money, and anti-slop classifiers rank surface features. None converts a verifiable contribution to project knowledge into a neutral claim on scarce review attention.
- **Externally checkable ground truth:** a reproducer that flips a known failing check, a minimized fixture that retains the failure, a deterministic downstream result, or an explicit maintainer acceptance event. A generated explanation is inadmissible.
- **Minimum authority/data:** issue and CI read access plus permission to attach artifacts to the PR. No write access to the default branch is needed.
- **Visible under-three-minute demonstration:** two equally plausible PRs request the last review slot. One returns fluent prose but no working reproducer; the other produces a minimized case that deterministically activates the maintainer’s known failure. Only the latter enters the queue. No contributor is labeled as slop or AI-generated.
- **Failure/abstention:** the gate is waived for security disclosures, accessibility-only changes, urgent fixes, and repositories without equivalent low-cost tasks. Tasks need time caps and multiple accessible modalities; otherwise the mechanism would create an unpaid labor toll.
- **GPT-5.6 structural leverage:** GPT-5.6 can reconcile the incoming change, issue history, CI failures, and maintainer backlog to propose bounded task choices and programmatically validate returned artifacts. The maintainer owns the acceptable outcome and task ceiling.
- **Strongest feature-not-category argument:** this may simply be an issue-form/Actions workflow that shifts labor onto newcomers. If it cannot prove lower total ecosystem burden and fair newcomer recall, it is not a category.

**Head-to-head:** O1 beats O2 because it measures the contribution in use and bounds harm rather than making a newcomer pay an up-front labor toll. O2 works for non-deployable projects, but its fairness and burden-transfer failure is fundamental. **Surface survivor: O1, medium confidence.**

## Surface 2 — MCP composition interference

### T1 — Counterfactual tool admission

Compatibility becomes a property of a versioned composition on representative tasks, not a badge assigned to an individual server.

- **M/W/O/K causal chain:** Because every candidate server is canaried in paired task runs with and without that server, then admitted only for task classes whose externally scored outcome does not regress (**M**), a developer no longer has to add/remove tools by trial and error or trust an individual-server quality badge (**W**). Capability can expand without silently lowering dependable task completion (**O**), measured by paired success delta, post-admission regression rate, calls/tokens/cost at equal success, time to isolate an interfering tool, and false quarantine of useful tools (**K**).
- **Why named substitutes cannot do it:** the [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) lists schemas and runs individual tools; the [MCP conformance suite](https://github.com/modelcontextprotocol/conformance) checks protocol behavior; the [registry](https://registry.modelcontextprotocol.io/) supports discovery. [MCP Interviewer](https://www.microsoft.com/en-us/research/video/tool-space-interference-an-emerging-problem-for-llm-agents/) profiles one server and may use LLM-generated functional plans and LLM judging. [OpenAI tool search](https://developers.openai.com/api/docs/guides/tools-tool-search) defers and dynamically loads tools, reducing exposed definitions, but does not empirically establish the marginal effect of adding server B to model/client/server-A/task configuration C. Braintrust/LangSmith can host a custom experiment; they do not define a relational compatibility receipt or enforce admission from it.
- **Externally checkable ground truth:** task-specific assertions over real repository state, API records, files, or replay tenants; side-effect logs; and identical version-pinned inputs. LLM-as-judge is explicitly excluded from the promotion decision.
- **Minimum authority/data:** server schemas, pinned model/client/prompt/server versions, representative task fixtures with deterministic or human-owned assertions, and test-tenant credentials. Candidate tools receive no production side-effect authority during admission.
- **Visible under-three-minute demonstration:** a GitHub workflow succeeds with a known tool set. Adding a legitimate overlapping git/GitHub server causes the agent to mutate the wrong branch or stop short. The paired runner shows the actual wrong repository state, masks candidate tools to identify the negative marginal effect, keeps the server deferred for that task class, then admits a namespaced/shortened variant after the same task passes.
- **Failure/abstention:** without representative fixtures, a safe replay tenant, or an outcome oracle, the result is `UNTESTED FOR THIS COMPOSITION`, never “compatible.” Receipts expire when the model, client, prompt, server, credentials, or task distribution changes.
- **GPT-5.6 structural leverage:** GPT-5.6 is both the actual system being composed and the coordinator of bounded paired trials. Multi-agent can run independent A/B branches; Programmatic Tool Calling can execute, join, filter, and delta-debug many tool traces; persisted reasoning can preserve hypotheses across perturbations. External state assertions prevent self-grading.
- **Strongest feature-not-category argument:** this can be implemented as a specialized eval suite, and model clients may absorb it into tool search/routing. It becomes a category only if configuration-specific compatibility receipts and continuous marginal admission become an ecosystem primitive analogous to package compatibility—not another dashboard.

### T2 — Runtime tool-space congestion control

The active tool set expands and contracts from observed task progress, analogous to congestion control, rather than remaining a static catalog.

- **M/W/O/K causal chain:** Because a broker initially exposes a minimal capability set and, when externally observable progress stalls or state diverges, replays the next bounded step against alternate minimal subsets before changing the live route (**M**), the user no longer manually curates the entire tool catalog for each task (**W**). An installed tool can be bypassed when its co-presence is causally implicated in a specific stalled trajectory (**O**), measured by recovery success, time/turns to validated progress, unnecessary tool exposure, regressions versus all-tools and tool-search baselines, and unsafe replay attempts (**K**).
- **Why named substitutes cannot do it:** MCP `tools/list` and annotations describe capabilities; tool search loads relevant definitions from names/descriptions; static routers select a likely tool. None uses paired observed progress to shrink or expand the live composition after a configuration-specific interference event.
- **Externally checkable ground truth:** a task progress predicate such as a changed issue state, correct branch/commit, retrieved record, or deterministic step postcondition. The broker may not treat shorter traces or model confidence as progress.
- **Minimum authority/data:** a replayable or read-only next step, tool-call logs, and explicit postconditions. Side-effecting steps need a test tenant or idempotent inverse; otherwise the broker cannot fork them.
- **Visible under-three-minute demonstration:** an agent loops between three semantically overlapping search tools and produces no record. The broker replays one bounded query through minimal subsets, observes which path returns the required record ID, narrows the active set, and the same live task completes. The record mutation is visible.
- **Failure/abstention:** irreversible next actions, ambiguous postconditions, divergent external state, or unavailable replay yield a human-visible `ROUTING UNKNOWN`; no hidden live fork is attempted.
- **GPT-5.6 structural leverage:** intent understanding proposes the smallest capability hypotheses, while Programmatic Tool Calling executes and reduces replay results. The model cannot choose the winner without the explicit progress predicate.
- **Strongest feature-not-category argument:** this is likely a client-side router/tool-search evolution. The TCP analogy is attractive, but without a broadly reusable progress contract it is a feature and may create more calls than it saves.

**Head-to-head:** T1 beats T2 because admission has reproducible paired evidence and a crisp abstention boundary. T2 is more dynamic but depends on a universal “progress” predicate that most open-ended tasks do not possess. **Surface survivor: T1, medium confidence because the underlying pain still has grade-C validity evidence.**

## Surface 3 — Cumulative repository-level interaction risk

### R1 — Factorial merge cohorts

The unit of ownership becomes the smallest set of changes with a non-additive behavioral effect, not whichever PR happened to merge last.

- **M/W/O/K causal chain:** Because the system selects likely interacting green changes, constructs baseline/A/B/A+B states, replays the same externally scored workflows, and binds a joint-only regression into a persistent merge cohort (**M**), maintainers no longer have to infer interaction from merge order or assign a repository-level failure to one locally acceptable PR (**W**). Non-additive failures become visible and jointly owned before independent promotion or rollback (**O**), measured by joint-only regressions caught, escaped interaction failures, false cohorts, factorial runs per catch, and time to a minimal interacting set (**K**).
- **Why named substitutes cannot do it:** merge queues test a queued head and required checks; ArchRails/Mneme enforce declared constraints; ordinary CI runs the selected state. [CoAgent/MTPO](https://arxiv.org/abs/2606.15376) makes contended agent operations serializable through footprints, notifications, repair, and inverses. Serializable changes can still be semantically incompatible after both commit, so CoAgent does not establish additivity. The mechanism also differs from CooperBench’s chat/commitment setting by evaluating the four executed repository states and creating a joint ownership object.
- **Externally checkable ground truth:** repository tests, production-derived replay traces, benchmark task assertions, performance/security thresholds, and the observed A+B-only failure. The selection model may prioritize pairs but cannot declare interaction from a diff.
- **Minimum authority/data:** read access to candidate branches, permission to create ephemeral combined states, representative replay fixtures, and CI compute. It requires no production write.
- **Visible under-three-minute demonstration:** PR A and PR B each pass and the app performs correctly; A+B deterministically corrupts a seeded workflow. Four states run side by side, only A+B fails, and both PRs visibly become one blocked cohort. A joint repair turns the A+B cell green and releases the cohort.
- **Failure/abstention:** no representative workflows, non-replayable side effects, an interaction set too large for a bounded search, or flaky outcomes produce `INTERACTION UNKNOWN`. Pair selection is coverage, not proof of absence.
- **GPT-5.6 structural leverage:** large-context reasoning over several diffs, issue histories, and workflow traces can prioritize semantically plausible interaction sets that file overlap misses. Independent subagents can search distinct user workflows; Programmatic Tool Calling can construct and reduce the factorial outcome table. The replay oracle remains external.
- **Strongest feature-not-category argument:** this is a combinatorial merge-queue feature with exponential cost. It becomes category-shaping only if “interaction cohort” persists as a first-class ownership, promotion, and rollback unit rather than disappearing after one CI run.

### R2 — Semantic commitment rendezvous

Parallel agents publish falsifiable insertion-point and behavior commitments; a conflicting observed write routes only the affected agents into renegotiation.

- **M/W/O/K causal chain:** Because agents turn their intended insertion points, owned effects, and compatibility promises into versioned commitments checked against actual tool writes (**M**), agents no longer coordinate through vague status messages that partners may ignore (**W**). Conflicts surface at the first violated commitment rather than after a failed final merge (**O**), measured by cooperative task success, prevented overwrites, false rendezvous, repair scope, and coordination turns (**K**).
- **Why named substitutes cannot do it:** CooperBench explicitly identifies vague/violated commitments and even suggests verifiable commitments or insertion-point contracts. More importantly, CoAgent already declares tool footprints, orders transactions, notifies affected readers, and repairs/undoes conflicting operations. Semantic behavior commitments go beyond read/write footprints, but the architecture is now uncomfortably adjacent.
- **Externally checkable ground truth:** actual file/tool writes and expert-written integration tests. A model-authored commitment is only a routing hypothesis, not correctness evidence.
- **Minimum authority/data:** tool-call middleware, versioned worktrees, declared task boundaries, and integration tests.
- **Visible under-three-minute demonstration:** two agents promise distinct insertion points but one overwrites a shared registry. The write triggers only the affected rendezvous, the agents renegotiate, and an expert-written CooperBench-style integration test passes.
- **Failure/abstention:** vague tasks, missing integration tests, or irreversible external writes prevent automatic resolution. The system must not claim that commitment consistency implies product correctness.
- **GPT-5.6 structural leverage:** intent understanding can turn heterogeneous task instructions into candidate commitments and re-plan after a concrete violation; persisted reasoning maintains them across turns.
- **Strongest feature-not-category argument:** this is likely a small semantic extension to CoAgent or an orchestrator feature. Its principal research direction is already named by CooperBench. It does not survive as independent category white space.

**Head-to-head:** R1 beats R2. R1 targets longitudinal semantic non-additivity after serializable changes, which CoAgent does not resolve. R2 is too close to CoAgent’s advisory notification/repair loop and CooperBench’s proposed commitment protocols. **Surface survivor: R1, medium-low category confidence.**

## Surface 4 — Agent oversight burden

### V1 — Risk-limiting delegation by reversible effect envelope

Oversight shifts from exhaustive ex-ante code reconstruction to empirical supervision inside a bounded, automatically recoverable effect envelope.

- **M/W/O/K causal chain:** Because a change is exposed only inside a user-approved effect envelope—named users/data, observable invariants, time window, and automatic inverse—and can graduate only from external observations (**M**), the reviewer no longer has to reconstruct every implementation detail before any evidence from use exists (**W**). Review attention concentrates on irreversible effects and observed boundary failures (**O**), measured by correct accept/reject decisions, reviewer time/workload, maximum affected population/data, rollback latency, and dangerous false graduation (**K**).
- **Why named substitutes cannot do it:** generic AI review supplies more comments; tests encode known expectations; permission prompts gate tool calls. [LaunchDarkly](https://launchdarkly.com/docs/home/releases/releasing) already provides progressive/guarded rollout and automatic rollback, which is the closest substitute. The only residual distinction is automatically translating an agent’s task and concrete code effects into the smallest reviewable envelope and refusing changes that cannot be made reversible.
- **Externally checkable ground truth:** real canary metrics, transaction journals, user-visible task outcomes, signed rollback events, and independently seeded failures.
- **Minimum authority/data:** code/diff access, deployment metadata, existing metric definitions, narrow canary control, and a tested inverse. No envelope may be inferred for secrets, authorization, destructive migration, or uninstrumented state.
- **Visible under-three-minute demonstration:** an agent patch passes existing tests but fails a seeded user journey. Only synthetic/canary users receive it, the journey metric crosses the maintainer threshold, and the actual service state rolls back. A safe patch graduates. The reviewer sees affected scope and state transitions, not a model assurance packet.
- **Failure/abstention:** absent inverse, inadequate instrumentation/sample, security/permission expansion, destructive schema change, or ambiguous metric yields `FULL REVIEW REQUIRED`.
- **GPT-5.6 structural leverage:** GPT-5.6 can recover likely effect surfaces from issue, code, deployment, and telemetry context and coordinate independent searches for counterexamples. Programmatic Tool Calling can join exposure and outcome records. It cannot invent the invariant or authorize graduation.
- **Strongest feature-not-category argument:** LaunchDarkly and progressive-delivery platforms already own most of the causal loop. Automatic envelope derivation may be useful, but it is likely an agent-aware release feature, not a new category.

### V2 — Executed decision forks

An agent spends compute, not human reading time, on the few material ambiguities: it implements both reversible branches and asks the owner to choose from observable outcomes.

- **M/W/O/K causal chain:** Because a system detects one decision whose alternatives materially change the user-visible outcome, implements both in isolated worktrees, and presents a blind executable comparison before either branch contaminates later work (**M**), the owner no longer monitors the whole run or infers consequences from an abstract clarifying question (**W**). Intent mismatch is resolved at the moment an actual behavioral difference is cheap to compare (**O**), measured by number of interruptions, owner choice time, later reversals, task completion, and whether the fork changed a consequential decision (**K**).
- **Why named substitutes cannot do it:** ordinary clarification asks for a preference before consequences exist; preview deployments show one selected implementation; code review arrives after commitment. This is not a plan document because both alternatives execute. It still resembles a Codex/IDE preview feature.
- **Externally checkable ground truth:** owner choice between running outcomes and the eventual accepted behavior. The model cannot claim which preference is correct.
- **Minimum authority/data:** repository worktrees, local execution, a reversible ambiguity, and a compact comparable user journey. No external writes are forked.
- **Visible under-three-minute demonstration:** an agent encounters an underspecified permission behavior, builds both routes, and opens identical running scenarios. The owner chooses the route that preserves an existing user action; the losing branch is discarded and the accepted constraint persists into the final patch.
- **Failure/abstention:** if branches are unsafe, expensive, not meaningfully comparable, or require domain authority, the system asks a normal question. It must cap forks so it does not hand the human more output to evaluate than a question would.
- **GPT-5.6 structural leverage:** intent understanding identifies a material ambiguity; multi-agent builds independent alternatives without convergence; persisted reasoning carries the selected constraint forward.
- **Strongest feature-not-category argument:** this is an agent UI/preview feature and can violate the tournament kill test by adding alternatives for the human. It survives only where the executed comparison is demonstrably cheaper than reading/rework.

**Head-to-head:** V1 beats V2 on bounded harm and external outcome evidence. V2 is memorable but narrow and risks increasing evaluation work. V1 nevertheless loses substantial novelty to guarded rollout. **Surface survivor: V1, low category confidence.**

## Surface 5 — Undocumented companion changes

### H1 — Counterfactual temporal-contract compiler

Historical co-change becomes an expiring executable obligation only after the repository itself falsifies the “companion omitted” counterfactual.

- **M/W/O/K causal chain:** Because the system mines candidate companion changes from history, reconstructs the historical state, ablates the alleged companion, and promotes a rule only when an external build/workflow outcome changes (**M**), engineers no longer treat raw co-occurrence as obligation or repeatedly search history for the same hidden contract (**W**). Tacit correlated-change knowledge becomes a falsifiable, versioned, decaying contract rather than a permanent warning (**O**), measured by time-split precision/recall on omitted companions, consequential omissions prevented, false requirements, contract expiry/decay, and alert burden (**K**).
- **Why named substitutes cannot do it:** static impact analysis follows encoded dependencies; ArchRails/Mneme enforce declared rules. [Rex](https://www.microsoft.com/en-us/research/publication/rex-preventing-bugs-and-misconfiguration-in-large-services-using-correlated-change-analysis/) learns co-change rules and suggests additional files when part of a rule changes. It does not establish from its public description that each correlation is promoted only after executable historical ablation, nor that rules expire when counterfactual evidence stops holding. The mechanism’s claim is causal filtering and lifecycle, not better correlation mining.
- **Externally checkable ground truth:** historical build/workflow outcomes with and without the companion, time-split unseen changes, domain-expert labels for consequential omissions, and later real defects. Passing current tests cannot prove completeness; it only supports a bounded contract.
- **Minimum authority/data:** Git history, reproducible historical environments or fixtures, CI/workflow definitions, and permission to construct ephemeral historical states. No write to the source repository is needed to compile candidates.
- **Visible under-three-minute demonstration:** history repeatedly pairs an API registration with a permission manifest. A raw correlation is shown, then a historical commit is replayed with the manifest edit removed and a seeded integration workflow fails. The rule becomes active. A second frequent but accidental co-change survives ablation and is discarded. A new PR omitting the real companion triggers the executable rule and is repaired.
- **Failure/abstention:** sparse history, unreproducible old builds, missing outcome coverage, nondeterminism, or an architectural migration produce `CORRELATION ONLY — NO CONTRACT`. Rules carry evidence hashes and expiry; intentional decoupling can retire them.
- **GPT-5.6 structural leverage:** a million-token context can reconcile diffs, commit messages, configuration, tests, and migration history to generate plausible ablation hypotheses. Multi-agent can investigate different historical eras independently; Programmatic Tool Calling can construct, run, and reduce many historical variants. Only executed outcomes promote a contract.
- **Strongest feature-not-category argument:** this is a sophisticated code-host/code-intelligence feature and historical environments often will not reproduce. It becomes category-shaping only if “compiled temporal contracts” are portable repo artifacts with evidence, expiry, and intentional-break semantics—not another warning feed.

### H2 — Just-in-time obligation rendezvous

A suspected historical rule asks the last responsible humans one concrete A/B question only when a new change makes the answer valuable, then records an expiring executable answer.

- **M/W/O/K causal chain:** Because a candidate co-change is converted at the next relevant PR into a concrete “is B still required when A changes?” comparison, routed to prior owners, and compiled only after an authoritative answer plus an executable witness (**M**), teams no longer document every tacit rule proactively or ask the same expert repeatedly (**W**). Human authority is captured at the moment it can prevent a real omission (**O**), measured by expert interruptions per durable rule, repeated-question reduction, false rules, prevented omissions, and answer latency (**K**).
- **Why named substitutes cannot do it:** CODEOWNERS routes review broadly; ADRs and architecture products require proactive declaration; Rex supplies learned suggestions. None uses the next real change as a one-question knowledge-acquisition event with expiry and executable corroboration.
- **Externally checkable ground truth:** an owner decision plus a repository witness and subsequent outcomes. Owner agreement alone is not proof of current technical necessity.
- **Minimum authority/data:** history, ownership metadata, a current PR, and a way to execute the candidate obligation.
- **Visible under-three-minute demonstration:** a PR triggers one concrete A/B question to a prior owner; their confirmation activates a witness that fails without the companion and passes with it; the same class of later PR needs no interruption.
- **Failure/abstention:** unavailable owners, disputed ownership, no executable witness, or contradictory answers leave an explicit unresolved question and no enforcement.
- **GPT-5.6 structural leverage:** the model can recover likely rationale and formulate the smallest falsifiable A/B question across history; persisted reasoning carries the answer and exceptions forward.
- **Strongest feature-not-category argument:** this is just-in-time documentation/governance and still consumes scarce expert attention. It is a natural CODEOWNERS/Rex enhancement, not a standalone category.

**Head-to-head:** H1 beats H2 because H1 can reject accidental history without requiring a human and gives every promoted rule an external counterfactual witness. H2 is a useful fallback when execution cannot establish intent, but it risks documentation theater. **Surface survivor: H1, medium-high mechanism confidence.**

## Surface 6 — Package identity ambiguity

### P1 — Intent-bound dependency resolution

An agent requests a capability contract; a resolver returns an immutable package identity with evidence. A bare plausible name is never the install object.

- **M/W/O/K causal chain:** Because an agent-originated dependency request is represented as required capability/API, ecosystem, license/security constraints, cited upstream context, and an immutable artifact digest, then resolved only when registry, source, provenance, and executable API evidence converge (**M**), the developer no longer treats a fluent package name or registry existence as identity (**W**). Hallucinated-name registration cannot silently convert an earlier model mistake into an installable dependency (**O**), measured by intended-package resolution accuracy, malicious-decoy installs prevented, uncommon legitimate packages falsely blocked, abstention quality, and time from intent to pinned artifact (**K**).
- **Why named substitutes cannot do it:** dependency review and scanners inspect a package after it has been named; lockfiles pin what was selected. [npm search](https://docs.npmjs.com/searching-for-and-choosing-packages-to-download/) ranks registry metadata, while scopes signal organization ownership. [npm provenance](https://docs.npmjs.com/generating-provenance-statements/) and [trusted publishing](https://docs.npmjs.com/trusted-publishers/) prove where/how an artifact was published and can link it to source, but npm explicitly says provenance does not guarantee non-malicious code—and provenance does not prove that this is the package the agent intended. The new object binds *task intent* to *source/publisher/artifact*, not merely publisher to artifact.
- **Externally checkable ground truth:** date-stamped benchmark tasks with curated intended packages; registry history; source-repository and signed publish attestations; immutable digests; executable API/import probes; and malicious newly registered decoys. The model cannot label its own recommendation correct.
- **Minimum authority/data:** read access to the repository/task, registries, upstream source/docs, and provenance logs; permission to download and execute a candidate only in a disposable verifier; install authority remains withheld until the user accepts or all required evidence passes.
- **Visible under-three-minute demonstration:** a coding agent recommends a plausible nonexistent package. A simulated attacker registers that exact name, so the registry-existence baseline installs it. Intent-bound resolution rejects the newly registered artifact because it cannot connect the requested API/cited upstream project to its publisher/source/digest, surfaces the contradictory evidence, and either resolves the established intended package or asks the user. A rare legitimate new package with a matching source/provenance/API probe passes, showing this is not popularity scoring.
- **Failure/abstention:** no clear capability contract, conflicting canonical sources, missing provenance, multiple equally valid packages, private/internal packages, or an API probe that requires unsafe authority produce `IDENTITY UNRESOLVED`; the system neither installs nor calls the candidate malicious.
- **GPT-5.6 structural leverage:** intent understanding recovers the needed API and constraints from task, code, docs, and conversation. Programmatic Tool Calling joins registry records, source history, attestations, and import probes; independent subagents challenge identity through separate evidence routes. The resolver’s final allowed state is a deterministic evidence policy over externally observed facts.
- **Strongest feature-not-category argument:** registries and package managers are the natural distribution point and can absorb this. Capability inference can also be wrong. It becomes a category only if intent-bound coordinates are portable across agents, package managers, and registries—effectively a new semantic dependency address—not a pre-install scanner.

### P2 — Hallucinated-name transparency log

Nonexistent package recommendations become a privacy-preserving public pre-registration signal, so a later registration of the same name is not treated as a neutral first publication.

- **M/W/O/K causal chain:** Because agents append thresholded, privacy-scrubbed observations of nonexistent recommended names and capability classes to an auditable timestamped log, and registries/package managers challenge a later first publication that collides with repeated prior recommendations (**M**), consumers no longer discover the hallucination-to-squatting transition only after installation (**W**). A predictable model error becomes an ecosystem warning before an attacker can exploit it silently (**O**), measured by collision warnings before first install, confirmed malicious publications caught, legitimate new projects delayed, poisoning attempts, and ecosystem coverage (**K**).
- **Why named substitutes cannot do it:** npm blocks detected typosquats and prohibits nonfunctional squatting; OpenSSF warns about slopsquatting; signatures and provenance bind publisher/build facts. None records that a name was repeatedly recommended while nonexistent before its first publication. Certificate/provenance transparency logs describe issued artifacts, not latent demand manufactured by model error.
- **Externally checkable ground truth:** append-only timestamps, independent-agent observation counts, registry publication time, later takedowns/malware findings, and publisher challenge outcomes.
- **Minimum authority/data:** agent/harness participation, privacy-preserving aggregation, registry read events, and eventually registry/package-manager integration. No package content execution is required to flag the temporal collision.
- **Visible under-three-minute demonstration:** three independent sessions recommend the same nonexistent name; the aggregate crosses a publication-safe threshold. An attacker publishes it later. The package manager shows the earlier log entries and blocks unattended install while a legitimate publisher can present linked pre-existing source history/provenance for review.
- **Failure/abstention:** low observation count, sensitive/private names, possible legitimate preannouncement, or poisoning patterns yield `NO AUTOMATIC CLAIM`. A log entry must never publicly accuse a publisher of malware.
- **GPT-5.6 structural leverage:** GPT-5.6 can normalize capability classes and strip repository-specific context, but the core timestamp/collision mechanism is deterministic. The model is principally an observed source of recommendations, not the judge.
- **Strongest feature-not-category argument:** without registry adoption the log is advisory and attackers can poison or exploit it. GPT-5.6 is not structurally essential, so this is more plausible as an OpenSSF/registry protocol feature than a hackathon-winning standalone category.

**Head-to-head:** P1 beats P2 because it protects the actual install decision using task-specific external evidence even without ecosystem-wide adoption. P2 is more protocol-like but suffers cold start, privacy, poisoning, and weak GPT-5.6 leverage. **Surface survivor: P1, high mechanism confidence.**

## Cross-surface pairwise comparison

The six surface survivors were compared directly; “wins” means the left mechanism better satisfies this tournament, not that it is universally superior.

| Pair | Winner | Why | Preserved dissent |
|---|---|---|---|
| P1 intent-bound resolution vs T1 counterfactual tool admission | **P1** | Better evidence grade, a sharper security failure, and a one-event demo with immutable ground truth. | T1 is more natively about GPT-5.6 tool composition and may be more novel. |
| P1 vs H1 temporal-contract compiler | **P1** | The name-registration exploit is easier to explain and validate than historical causal replay across brittle old environments. | H1 has direct deployed precedent for the problem and does not need registry ecosystem change. |
| P1 vs O1 revocable merge lease | **P1** | P1 works before an irreversible install and does not require a safe canary population or maintainer deployment infrastructure. | O1 addresses a larger human/community sustainability problem and has a more distinctive social protocol. |
| P1 vs R1 factorial merge cohorts | **P1** | P1 avoids combinatorial explosion and has a clearer category primitive: replace bare package name with intent-bound identity. | R1 directly addresses the new repository-level unit of failure found in the atlas. |
| P1 vs V1 reversible effect envelope | **P1** | V1 loses too much novelty to guarded rollout; P1’s intent-to-identity gap is not covered by provenance. | V1 attacks the evidence-grade-A oversight burden. |
| T1 vs H1 | **T1 on novelty/model leverage; H1 on problem validity** | T1 creates relational composition admission and uses GPT-5.6 as the actual system under test. H1 has stronger evidence and external time-split validation. | This pair should remain unresolved until tool-interference replication or a reproducible history benchmark exists. |
| T1 vs O1 | **T1** | T1 needs less social/institutional adoption and has a cleaner three-minute causal state change. | O1 has far stronger human stakes and pain evidence. |
| T1 vs R1 | **T1** | Paired with/without admission is linear and legible; factorial interaction testing is costlier and resembles CI. | R1 addresses semantic interactions that tool routing cannot. |
| T1 vs V1 | **T1** | Tool composition compatibility is less occupied than progressive delivery. | V1 has better problem evidence and safer known engineering primitives. |
| H1 vs O1 | **H1** | Every promoted rule can carry a counterfactual witness; O1 can observe only leasable/deployable changes and may expose users to harm. | O1 changes contributor trust rather than adding another code-intelligence signal. |
| H1 vs R1 | **H1** | Historical ablation targets a bounded companion obligation and can reject accidental correlation; R1 must search many combinations. | R1 catches emergent interactions with no historical precedent, which H1 necessarily misses. |
| H1 vs V1 | **H1** | H1 is materially distinct from Rex through causal promotion/expiry; V1 remains close to LaunchDarkly. | V1 has broader applicability when safe rollout already exists. |
| O1 vs R1 | **O1** | A revocable trust contract is more category-shaped than a combinatorial merge queue. | R1 has cleaner repository-local adoption and no newcomer fairness exposure. |
| O1 vs V1 | **O1 narrowly** | O1 applies reversibility to the unresolved openness/trust contradiction, while V1 applies an incumbent rollout loop to agent oversight. | V1’s audience and success metrics are broader. |
| R1 vs V1 | **R1** | R1 defines a new persistent interaction-ownership unit and is explicitly distinct from CoAgent serializability. | V1 is more operationally proven and easier to deploy in instrumented products. |

## Nominations — at most three

### 1. P1 — Intent-bound dependency resolution

**Why it advances:** It replaces the vulnerable primitive itself: a package coordinate is no longer a plausible string but an intent/source/publisher/artifact binding. The problem has grade-B evidence, the exploit and abstention are visible, existing provenance is a strong but incomplete substitute, and success can be judged without model self-review.

**Fast falsification test:** On a date-stamped set of current repositories and agent dependency tasks—including rare legitimate packages and newly registered decoys—compare bare-name registry resolution, provenance-only resolution, and intent-bound resolution. Kill the direction if intent-bound evidence does not materially reduce wrong-package installs without an unacceptable rare-package false-block rate.

**Largest unresolved risk:** “Intended package” is often not objectively unique. If the capability contract cannot be grounded more cheaply than a developer manually choosing a package, this collapses into a scanner or package-manager feature.

### 2. T1 — Counterfactual tool admission

**Why it advances:** It treats compatibility as relational and versioned, directly attacks the failure mode Microsoft named, and demonstrates a with/without causal delta in the actual GPT-5.6 system. Inspector, conformance, registry, individual-server evaluation, and tool search all stop short of that claim.

**Fast falsification test:** Replicate adding-tool regressions across GPT-5.6, at least two clients, and several deterministic task classes; compare static all-tools, OpenAI tool search, and counterfactual admission. Kill it if tool search makes success effectively invariant to installed server set, or if paired receipts do not predict later task outcomes.

**Largest unresolved risk:** The pain currently has only grade-C validity support and may vanish with client/model improvements. Without representative external task oracles, it degenerates into another eval dashboard.

### 3. H1 — Counterfactual temporal-contract compiler

**Why it advances:** It attacks a grade-B failure with a precise change to the causal loop: historical correlation is not trusted until an ablation changes executed behavior, and every rule can expire. It is meaningfully narrower than generic architecture governance and materially extends Rex’s publicly described correlation/suggestion loop.

**Fast falsification test:** On time-split repositories with reconstructable historical environments, compare static impact analysis, raw co-change/Rex-style rules, and counterfactually promoted rules against expert-labeled omitted companions. Kill it if executable ablation does not improve precision enough to offset historical replay cost or if old environments cannot be reproduced for a useful fraction of changes.

**Largest unresolved risk:** Existing tests may not expose the companion obligation, so the mechanism can prove only bounded evidence, never completeness. A code host can absorb the entire capability if it works.

## Decision boundary

These nominations are not yet product recommendations. P1 is the strongest causal mechanism in this Developer Tools round. T1 has the highest novelty/model-native upside and the weakest mature pain evidence. H1 has the strongest bridge from historical research to external validation but the largest reproducibility burden. O1 should remain the contrarian reserve because its revocable-trust protocol attacks the most human problem, even though progressive-delivery adjacency and limited leasability keep it out of the top three.

The next round should not add names or feature lists. It should build one adversarial benchmark per nominee and try to falsify the causal delta against the named baseline.
