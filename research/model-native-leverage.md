# Model-native leverage screen

Research snapshot: 2026-07-19.

This screen prevents a real problem from being paired with decorative AI. It records current OpenAI capabilities first, then defines what a solution mechanism would have to prove.

## Current capability facts

The official [GPT-5.6 model guidance](https://developers.openai.com/api/docs/guides/latest-model) and [model catalog](https://developers.openai.com/api/docs/models/gpt-5.6-sol) establish that GPT-5.6 supports:

- a 1.05-million-token context window, text and image input, structured output, function calling, and reasoning effort through `max`;
- the Responses API for reasoning, tool-calling, and multi-turn workflows;
- Programmatic Tool Calling, in which the model writes JavaScript that calls eligible tools and processes their intermediate results in a hosted runtime;
- multi-agent orchestration in beta, allowing parallel independent workstreams followed by synthesis;
- persisted reasoning across turns;
- pro mode, which performs more model work when reliability matters more than latency or cost;
- web search, file search, hosted shell, code interpreter, computer use, MCP, tool search, skills, and Apply Patch;
- improved intent understanding, frontend design judgment, and original-detail image input.

The same guidance says Programmatic Tool Calling is most appropriate for bounded filtering, joining, ranking, deduplication, aggregation, and validation across several tool results. It also warns that adding tools is not automatically useful: expose only relevant tools, keep descriptions lean, and evaluate final-answer quality rather than celebrating fewer calls.

## Admissible leverage classes

A mechanism can claim structural model leverage only when it makes one of these previously impractical loops possible:

1. **Distributed evidence reconciliation:** collect heterogeneous records from multiple authorized sources, normalize their claims, expose contradictions, and preserve provenance down to the supporting artifact.
2. **Independent adversarial search:** assign genuinely different search or critique scopes, preserve disagreement, and synthesize only after the independent work is visible.
3. **Latent-intent recovery:** infer constraints from history, examples, artifacts, and behavior, then make the inferred contract inspectable and falsifiable.
4. **Counterexample discovery:** search for plausible cases that would defeat an artifact, decision, policy, or plan rather than merely generating more of the same artifact.
5. **Longitudinal state reasoning:** maintain goals, assumptions, unresolved questions, and changes across a workflow whose truth evolves over multiple turns or events.
6. **Multimodal semantic inspection:** reason over high-detail visual artifacts together with language, rules, and structured records where downsampling or isolated OCR would lose relevant meaning.
7. **Bounded tool execution:** traverse many authorized systems while enforcing explicit source, authority, stopping, retry, and evidence requirements.

## Rejection tests

A proposed solution fails this screen when:

- one well-written ChatGPT prompt provides most of its value;
- the model only summarizes retrieved records;
- multiple agents are used as theater and share the same prompt, evidence, or blind spots;
- the model grades its own generated output without independent observations;
- tool use merely moves fields between systems;
- a deterministic rule, ordinary database query, or established static-analysis method solves the central task more reliably;
- the product hides uncertainty or turns model inference into an authoritative high-stakes decision;
- `max` reasoning, pro mode, or a large context window is the only claimed novelty;
- the demonstration shows a response rather than a changed decision, verified state, or avoided failure.

## Evidence required from a finalist

Every finalist must state:

> Because the model can **M** over evidence **E**, the product can create feedback loop **L** that the current workflow lacks. The loop changes user behavior **W** into **W′**, and success is observed as **K**.

It must then provide:

- a non-model baseline;
- a simpler prompt-only baseline;
- representative success and failure cases;
- externally checkable ground truth or an explicit human authority boundary;
- provenance for consequential claims;
- an uncertainty state that is visible in the user experience;
- a reason the product remains valuable when the model is occasionally wrong.

The purpose is not to maximize the number of OpenAI features used. It is to select a problem whose causal bottleneck now becomes tractable because of a specific capability combination.
