# Novelty audit — agent-tool compatibility lockfile

Research snapshot: 2026-07-19. This is a focused adversarial audit of T1, counterfactual MCP tool admission, reframed as a package manager or lockfile for a complete `model + client + prompt + tools + task` composition. It is not a product endorsement.

## Ruling

**KILL as the standalone hackathon thesis — high confidence. Preserve only a task-scoped admission feature.**

The failure mode is real enough to research. A useful implementation can compare a pinned agent composition with and without a candidate tool, score both against external state, and prevent a known-regressive configuration from being activated for the tested task class.

That does not create a new package-manager category. It is a specialized continuous-evaluation gate whose hardest input—the representative task distribution and independent outcome oracle—must still be supplied by the operator. If the operator has those assets, OpenAI's evaluation primitives and current agent-evaluation platforms can already run and compare the configurations. If the operator does not have them, a lockfile cannot manufacture compatibility truth.

The word **lockfile** also overstates what can be locked. Package artifacts can be content-addressed; behavioral compatibility is stochastic, relational, permission-dependent, and task-distribution-dependent. Any change to the model snapshot, client, hidden system prompt, routing policy, tool descriptions, remote behavior, credentials, data, or task mix can invalidate the result. The honest surviving artifact is therefore an **expiring task-scoped non-regression receipt**, not a universal compatibility lock.

This concept remains a good feature for an MCP gateway, model client, or eval platform. It is not the right first-place bet for this tournament.

| Question | Finding | Confidence |
| --- | --- | --- |
| Is tool-space interference real? | Yes. Overlapping names, large tool spaces, long responses, and client/model differences can reduce agent reliability. | Medium-high |
| Is the exact user cost established? | Not well. Current evidence demonstrates technical failure modes and benchmark degradation, but not prevalence, buyer urgency, or deployment cost for GPT-5.6 compositions. | High |
| Is paired marginal testing novel? | No. It is ordinary configuration comparison over a task-specific eval set. | High |
| Is a versioned relational receipt differentiated? | Narrowly. Current tools do not appear to publish the exact scoped receipt proposed here. Packaging an eval result is differentiation, not a new causal method. | Medium-high |
| Standalone category or feature? | Feature of an eval platform, MCP gateway, marketplace, or model client. | High |
| Hard verdict | **KILL** as lead; retain only the feature experiment. | High |

## What the evidence actually establishes

Microsoft Research coined **tool-space interference** for cases where otherwise reasonable tools or agents reduce end-to-end performance when composed. Its survey launched 1,470 public MCP servers, found 775 exact tool-name collisions, and documented large differences in tool count, schema complexity, output length, and expected client/model behavior. It also gives a concrete Git/GitHub example in which browser, terminal, and MCP actions can create divergent state. This is credible evidence of composition hazards. It is not a measured prevalence study of real production task regressions: authorization prevented functional testing of many servers, and the server survey mostly characterizes risk factors rather than downstream business loss. ([Microsoft Research](https://www.microsoft.com/en-us/research/blog/tool-space-interference-in-the-mcp-era-designing-for-agent-compatibility-at-scale/))

Two peer-reviewed 2026 results strengthen the technical case but simultaneously narrow the product white space:

- [ToolScope](https://aclanthology.org/2026.acl-long.1573/) reports that redundant tools with overlapping names and descriptions reduce selection accuracy, then improves accuracy by merging redundant tools and retrieving a smaller context-relevant set.
- [Beyond Static Toolsets](https://aclanthology.org/2026.findings-acl.1082/) formalizes a stability–adaptation dilemma as tools are added, removed, and changed, then addresses it by exploring tool relations and adapting documentation, including explicit preferences and fallbacks among overlapping tools.

These sources support a real technical problem. They do not show that teams want a separate compatibility package manager, that per-composition certification predicts production outcomes, or that the marginal gate beats retrieval, namespacing, documentation adaptation, and ordinary continuous evals. The pain remains below the tournament's grade-A/B impact threshold because recurring organizational cost and demand are not yet established.

## The proposed object, stated precisely

The strongest possible version would identify a composition as:

```text
agent composition
  model provider + immutable model snapshot or dated alias
  client/runtime version + hidden-prompt/policy hash
  system/developer prompt hash + sampling/reasoning settings
  tool/server identities + artifact/schema/description hashes
  tool-search, routing, namespacing, approval, and allowed-tool policy
  credential scopes + sandbox/test-tenant identity

evidence scope
  task-class definition + dataset digest + sampling window
  reset procedure + external oracle/evaluator digests
  repetitions + confidence interval + cost/latency observations

decision
  admitted | regressive | untested
  allowed task classes + known failures + expiry/invalidation rules
```

A candidate tool or server is evaluated as a **marginal change** from composition \(C_0\) to \(C_1\). The result must never say “this server is compatible.” It can say only that, on a named task distribution and pinned composition, the observed candidate condition did or did not regress the predeclared outcome within the recorded uncertainty.

That precision is valuable, but it reveals why the package-manager metaphor fails. The task set, oracle, permissions, and runtime state are part of the alleged package identity. In other words, the “lockfile” is an experiment record plus an activation policy.

## Closest current substitutes and absorbers

| Existing layer | What it already covers | Exact residual, if any |
| --- | --- | --- |
| [MCP Inspector](https://github.com/modelcontextprotocol/inspector) and [MCP conformance](https://github.com/modelcontextprotocol/conformance) | Inspector lists and directly calls tools through a UI or CLI; conformance runs protocol scenarios against clients and servers and supports CI baselines. | They test a server or protocol implementation, not the marginal effect of server B on an end-to-end task performed by model M in client C. |
| [Official MCP Registry](https://modelcontextprotocol.io/registry/quickstart) | Verifies that published package metadata matches the registry identity and provides versioned discovery metadata. | It does not certify task suitability or behavioral compatibility. Its own terms advise users to evaluate suitability. |
| [MCP Interviewer](https://github.com/microsoft/mcp-interviewer) | Checks provider constraints, has an LLM generate per-server functional test plans, executes tools, and emits reports; it can fail CI on warnings. | It evaluates one server's outward behavior and uses experimental LLM evaluation that its maintainers say must be manually inspected. It does not run a controlled with/without composition trial against an operator-owned outcome. |
| Microsoft Research's proposed server cards and marketplace optimizations | The same research already recommends publishing tested models, agents, clients, sample tasks, and known incompatibilities, and suggests marketplaces serve model/client-specific schemas. | A signed, independently reproduced marginal receipt plus runtime enforcement would be stricter. The core opportunity, however, is already explicitly proposed by the researchers who named the problem. |
| [OpenAI tool search](https://developers.openai.com/api/docs/guides/tools-tool-search), `allowed_tools`, and MCP approvals | Tool search defers definitions and loads only relevant tools; `allowed_tools` limits what a server exposes; approvals bound sensitive actions. | They reduce exposure and authority but do not claim that adding a deferred server preserves task success. They are also the strongest baseline: if tool search makes installed-but-irrelevant servers behaviorally inert, much of the proposed pain disappears. ([OpenAI MCP guide](https://developers.openai.com/api/docs/guides/tools-connectors-mcp)) |
| [OpenAI evaluation guidance](https://developers.openai.com/api/docs/guides/evaluation-best-practices) | Explicitly treats dynamic tool choice as a source of agent nondeterminism; recommends tool-selection, argument-precision, functional, executable, and continuous evals, using task-specific data that reflects real distributions. | It does not define a portable compatibility receipt or admission policy. It does define the entire experimental method needed to create one. |
| [LangSmith](https://docs.langchain.com/langsmith/evaluate-llm-application) | Runs application versions on datasets with code or model evaluators; records `models`, `prompts`, and `tools` as experiment metadata and compares experiments side by side. Its agent evals cover final outcomes, tool selection, and trajectories. | A user must wire the candidate-removal comparison and activation gate. The proposed product is a preconfigured LangSmith experiment plus policy, not a new evaluation capability. |
| [Braintrust](https://www.braintrust.dev/docs/evaluate) | Evaluates arbitrary multi-step agents, tools, and workflows; stores immutable experiment snapshots; compares configurations; runs CI and production monitoring. Its playground can configure models, prompts, tools, and MCP servers. | It does not present the result as an MCP admission receipt. Again, the residual is workflow packaging and enforcement. |
| [MCPTrust](https://github.com/mcptrust/mcptrust) | A small open-source project already creates signed `mcp-lock.json` files, pins artifacts and schemas, detects drift, enforces allowed capabilities in a proxy, writes receipts, and gates CI. | It explicitly secures interface identity and drift, not semantic end-to-end compatibility. Its existence kills “lockfiles for MCP” as the novelty claim while leaving behavioral evidence as a possible extension. Its low adoption is not market validation. |
| [ToolHive](https://github.com/stacklok/toolhive) | A production-oriented MCP registry, runtime, and gateway with client configuration, policy, observability, and semantic tool search; it publishes a broad client compatibility matrix. | Its public compatibility table is transport/configuration compatibility, not model-and-task behavioral compatibility. It is nevertheless a natural incumbent that could absorb the receipt as one more gateway policy. |

The white space is therefore only this:

> **Given operator-owned representative tasks and external outcome assertions, automatically measure the marginal effect of a tool-set change, minimize the implicated tool subset, and turn the result into an expiring task-scoped activation rule.**

That is useful. It is also visibly an eval-suite feature.

## Exact causal loop after removing the category claim

1. **Trigger:** a server is added or upgraded, a model/client changes, a prompt or router changes, or a production trace reveals a new task class.
2. **Snapshot:** capture the complete configuration and hash every observable input. Remote endpoints that cannot expose a version are marked mutable rather than falsely pinned.
3. **Pair:** run \(C_0\) and \(C_1\) in randomized order over fresh, identically reset test tenants. Repeat enough times to estimate a distribution rather than promoting one lucky trajectory.
4. **Observe:** score actual repository, database, ticketing, file, or API state with operator-authored code or a separately authoritative human label. Trace length, model confidence, and an LLM judge cannot be the promotion oracle.
5. **Localize:** if \(C_1\) regresses, remove or rename candidate tools in bounded counterfactual trials to identify a minimal implicated subset. This is delta debugging over an agent configuration, not proof that one tool is globally bad.
6. **Receipt:** write `ADMITTED`, `REGRESSIVE`, or `UNTESTED`, including task scope, uncertainty, fixture and oracle hashes, known failures, and expiry.
7. **Enforce:** use `allowed_tools`, deferred loading, namespacing, or a gateway route to expose the candidate only for admitted task classes. Any material drift invalidates the receipt and schedules a rerun.
8. **Learn:** sample real production traces, after privacy review, to detect task-distribution drift and propose new fixtures. A human or deterministic policy must approve any new consequential oracle.

The causal claim is:

> Because the gate measures the candidate's marginal effect on repeated, externally scored tasks before activation, the platform engineer no longer has to infer composition safety from individual-server checks or discover every regression in production, reducing escaped task regressions per tool-set change at a fixed false-quarantine rate.

This loop can change a real state—what tools the runtime exposes—but only inside the task classes the operator can already evaluate.

## Strongest honest three-minute demonstration

Use a real, disposable GitHub organization and two legitimate, version-pinned tools with overlapping Git/GitHub capability. Do not manufacture a malicious description or deliberately broken server.

1. **Predeclare the task and oracle.** “Create branch `compat-demo`, change one specified file, commit once, and open a pull request; never update the default branch.” A deterministic verifier checks repository refs, commit parentage, file contents, PR head/base, and absence of writes to `main`.
2. **Show the baseline.** Replay several GPT-5.6 runs in the pinned client with the current tool set. The outcome table shows the success distribution and links every cell to actual GitHub state.
3. **Add the candidate.** Replay the exact same randomized fixtures with one additional legitimate overlapping server. The demo is valid only if the real candidate condition materially regresses the state oracle; a narrated hypothetical does not count.
4. **Localize and gate.** Counterfactual subset runs identify the overlap, and the task receipt changes to `REGRESSIVE — candidate deferred for git-change tasks`. The live runtime's exposed tool set changes, not just a dashboard score.
5. **Repair.** Namespace, shorten, or defer the candidate tools, rerun the same task, and show the external state recover. A new receipt admits the repaired composition for that task class.
6. **Show the boundary.** Change the client or model snapshot. The receipt visibly becomes `STALE`, not “compatible.” Present an open-ended task with no outcome assertion and show `UNTESTED`, not an LLM-authored green badge.

This is a strong developer-tools demo. It proves only that the feature can catch one real regression, not that a new category exists or that the receipt generalizes.

## Independent oracle requirements

The gate is valid only when all of the following exist:

- an isolated, resettable test tenant with no production authority;
- identical initial state and credential scopes for both conditions;
- an immutable task and composition snapshot, including routing and hidden client policy where obtainable;
- predeclared postconditions over consequential external state, not only text output or tool-call shape;
- randomized condition order and repeated trials sufficient to expose model nondeterminism;
- explicit treatment of flaky servers, rate limits, latency, cost, and transient network failure;
- a human-owned adjudication path for semantic outcomes that cannot be encoded deterministically;
- held-out tasks from the same claimed class to test whether the receipt predicts anything beyond its fixtures;
- expiration on model, client, prompt, tool, policy, credential-scope, or task-distribution drift;
- `UNTESTED` when any of those assets are unavailable.

The model may help propose assertions from production traces, but those assertions are hypotheses. If GPT-5.6 writes the test, performs the task, and judges the result, the evidence is circular. If a human must author and maintain every representative external oracle, that human work is the adoption bottleneck the product has not removed.

## The fatal flaw: the oracle-adoption trap

The exact thing that would make the receipt trustworthy also collapses its category claim.

1. **Without representative tasks and independent outcomes, there is no compatibility fact.** Static schema, provenance, conformance, and generated happy-path tests cannot establish that adding a server preserves the user's end-to-end work.
2. **With representative tasks and independent outcomes, this is a configuration eval.** OpenAI's own guidance already calls for continuous, task-specific agent and tool-selection evaluation; LangSmith and Braintrust already compare pinned application configurations with custom scorers.
3. **A marketplace cannot usually supply the missing truth.** The important tasks, credentials, data, client policies, and desired side effects are private and organization-specific. A public server card can report where it was tested, but cannot certify the buyer's composition.
4. **A lock cannot remain valid for long.** Remote MCP behavior can change without a content-addressable artifact, model aliases can move, clients can alter hidden prompts and routing, tool search changes which definitions are visible, and production task distributions drift.
5. **The matrix grows faster than the evidence.** Model × client × prompt × server set × tool subset × permission scope × task class creates a combinatorial test surface. Delta debugging can localize a known regression; it does not prove the untested cells safe.

The surviving value is operational convenience: standardize the experiment, cache its evidence, abstain honestly, and connect the result to runtime filtering. That can be a strong feature. It does not escape the eval-platform category.

## GPT-5.6 structural-role audit

**GPT-5.6 is structurally the system under test, but not structurally the admission oracle.** That distinction matters for the hackathon.

Useful roles include:

- performing the actual tool-using tasks whose composition is being evaluated;
- using long-context reasoning to cluster authorized production traces into candidate task classes and identify likely overlapping tool semantics;
- proposing the smallest counterfactual subset, namespace change, or tool-description repair to test next;
- using Programmatic Tool Calling to orchestrate repeated bounded trials and join trace, state, cost, and latency records;
- producing an inspectable explanation that cites the failed external assertion and differing trajectory.

Forbidden or non-structural roles include:

- generating the only task fixtures and then treating them as representative;
- authoring the implementation and also grading its success;
- converting model confidence, fewer tool calls, or a shorter trace into compatibility;
- declaring a server safe, correct, or universally compatible;
- deciding that an open-ended semantic outcome is acceptable without separate authority.

The deterministic/statistical runner owns snapshotting, resets, state assertions, comparison, confidence intervals, invalidation, and enforcement. Remove GPT-5.6's trace-mining and explanation roles and a competent engineer can still build the core paired experiment in a general eval platform. The model is necessary as the tested runtime for a GPT-5.6-specific receipt, but it is not the source of the product's central truth. This limits the credible Technological Implementation and Quality-of-Idea scores.

Tool search must be the default baseline, not a feature of the proposed system. OpenAI's current implementation dynamically loads deferred function namespaces and MCP servers so the model need not ingest every installed definition. If interference largely disappears under that baseline, a static “installed tool compatibility” product is solving an obsolete configuration. ([official tool-search documentation](https://developers.openai.com/api/docs/guides/tools-tool-search))

## Decisive experiment

Run a preregistered, multi-client tool-change tournament using only legitimate, unmodified servers and independently scored external state.

### Corpus

- at least three task domains with real side effects, such as GitHub changes, issue-tracker workflows, and structured document or database updates;
- multiple server-addition and server-upgrade events, including overlapping and non-overlapping tool sets;
- GPT-5.6 in at least two materially different clients or harness policies;
- fresh test tenants, held-out tasks, and production-derived cases whose sensitive details have been removed;
- no adversarially renamed tools in the primary result. Those belong in a separate robustness test.

### Baselines

1. all configured tools exposed eagerly;
2. OpenAI tool search with deferred servers;
3. tool search plus a competent engineer's `allowed_tools` and namespace curation;
4. a generic paired experiment implemented in LangSmith or Braintrust with the same fixtures and external scorers;
5. the proposed automatic receipt, localization, expiry, and runtime-admission workflow.

### Primary measurements

- adding-tool regressions confirmed by external state;
- escaped regressions after admission;
- false quarantine of tools that improve or preserve the task outcome;
- held-out predictive value by claimed task class;
- operator minutes to create and maintain fixtures, oracles, and policies;
- cost and latency per admitted change;
- receipt invalidation frequency under real model, client, tool, and task drift.

### Promotion and kill rule

Advance the feature only if all four claims survive:

1. naturally occurring adding-tool regressions remain reproducible under GPT-5.6 **after** tool search and ordinary namespacing/curation;
2. task-scoped receipts predict held-out outcomes rather than memorizing their fixture set;
3. automated admission prevents materially more escaped regressions than the curated baseline without an unacceptable false-quarantine or compute burden; and
4. the workflow saves substantial operator time versus implementing the same comparison in a general eval platform.

Kill the feature if the real non-adversarial regression cannot be reproduced; tool search makes success effectively invariant to the installed server set; results fail to generalize within a task class; the receipt becomes stale on almost every ordinary change; external oracle authoring dominates the work; or a generic eval implementation reaches the same decision with similar effort.

Even a passing experiment would justify an **MCP-gateway or eval-platform admission feature**, not yet a standalone package manager. Category promotion would require repeated independent adoption and a portable receipt standard that remains predictive across organizations—evidence this hackathon cannot simply assume.

## Official-rubric ceiling

This is the ceiling for an exceptionally polished implementation, not a score for the current research repository.

| Criterion | Credible ceiling | Reason |
| --- | ---: | --- |
| Technological Implementation | **3/4** | Repeated sandboxed trials, external state oracles, statistical comparison, trace localization, and runtime enforcement are non-trivial. The core method is still standard eval infrastructure, and GPT-5.6 cannot own the truth. A truly robust multi-client runner might earn 4, but the model-native claim would remain bounded. |
| Design | **3/4** | `candidate added -> regression witnessed -> tool quarantined -> repair admitted` is coherent and visible. The required dataset/oracle authoring and long-running repetition make the general setup experience difficult to complete cleanly. |
| Potential Impact | **2/4** | Technical evidence supports the failure mode, but current sources do not establish prevalence, deployment cost, or strong buyer demand for a separate product. |
| Quality of the Idea | **2/4** | The relational receipt is a useful refinement, but Microsoft already proposes tested model/client/task cards, OpenAI documents the eval loop, current platforms compare tool-bearing agent configurations, and MCP lockfiles/gateways already exist. |
| **Total** | **10/16** | An exceptional runner could reach **11/16** by earning a 4 in implementation; the impact and idea ceilings remain. |

**Stage Zero: conditional.** It passes only if the team can reproduce a real GPT-5.6 adding-tool regression, run the same task against an independent external oracle, and give judges a no-friction test path. A synthetic confusing tool, a single stochastic failure, or an LLM-graded dashboard fails Stage Zero's honest-demo requirement.

**First-place ceiling: low.** The concept can look technically impressive, but the equal-weight rubric prevents implementation depth from compensating for weak impact evidence and feature-level novelty.

## Final recommendation

Do not select “an npm for agent-tool compatibility” or “a lockfile for MCP compositions” as the product thesis. Those names imply stable, portable facts the mechanism cannot produce.

If another product needs this capability, implement the narrow object honestly:

> **An expiring, task-scoped non-regression receipt that turns paired external-state evals into runtime tool filtering.**

Keep `REGRESSIVE`, `ADMITTED`, `UNTESTED`, and `STALE` as first-class states. Make tool search, human curation, and a generic eval platform the adversarial baselines. Never let the model author and certify the same evidence.

For this hackathon's idea-selection tournament, the hard result is **KILL**. This is a well-motivated piece of agent reliability infrastructure, but current evidence does not support it as a category-defining product or the most likely first-place idea.
