# Evidence-to-idea tournament

Research snapshot: 2026-07-19.

## Objective

Select a hackathon direction by moving through four distinct objects:

1. observed failure events;
2. unresolved contradictions;
3. causal solution mechanisms;
4. coherent product concepts.

Ideas are not generated until the underlying problems survive an evidence and substitution review. Time-to-build is deliberately excluded from category and problem selection; it must not bias the search toward trivial ideas.

## Official frame

OpenAI Build Week accepts four categories: Apps for Your Life, Work and Productivity, Developer Tools, and Education. The official criteria are equally weighted:

1. **Technological Implementation:** thorough, skillful use of Codex and a working, non-trivial implementation.
2. **Design:** a complete and coherent runnable product experience rather than only a technical proof of concept.
3. **Potential Impact:** a credible and specific real problem for a real audience, demonstrably addressed by the product.
4. **Quality of the Idea:** creativity, novelty, and meaningful differentiation from existing concepts.

Sources: [challenge overview](https://openai.devpost.com/), [official rules](https://openai.devpost.com/rules). The live Devpost connector was checked on 2026-07-19; official pages remain the source of truth.

## Stage 1: problem atlas

Each problem card must identify:

- a specific actor;
- an exact triggering event;
- the outcome the actor needs;
- the current workaround;
- an observable cost or harm;
- why current tools fail in that moment;
- dated evidence and its limitations;
- a contradiction of the form “people need X, but current systems force Y.”

The following are rejected:

- abstract nouns such as “trust,” “productivity,” or “access” without an event;
- a single anecdote presented as prevalence evidence;
- a vendor claim without independent or behavioral corroboration;
- a problem whose alleged cost is merely aesthetic preference;
- a problem secretly written to justify a predetermined solution.

### Evidence grades

- **A:** replicated, quantitative, or mixed-methods evidence plus direct practitioner evidence.
- **B:** one strong primary study or dataset with credible corroboration.
- **C:** repeated authentic reports without reliable prevalence or causal evidence.
- **D:** plausible intuition only.

Only A and B problems can become finalists. C problems may remain as research leads. D problems are removed.

## Stage 2: contradiction clustering

Problem cards are clustered by causal structure rather than industry vocabulary. Examples include:

- speed versus confidence;
- personalization versus privacy;
- openness versus trust cost;
- assistance versus skill formation;
- autonomy versus bounded authority;
- completeness versus cognitive load;
- standardization versus local context.

A useful contradiction identifies both sides as genuinely valuable. If one side can simply be discarded, it is an ordinary trade-off rather than an innovation opportunity.

## Stage 3: opportunity review

Each surviving problem is assessed from 0–4 on:

- severity of the failure event;
- recurrence or affected reach;
- cost of the current workaround;
- inadequacy of existing substitutes;
- sharpness of the contradiction;
- availability of evidence and validation access;
- potential for a model-native change to the causal chain;
- legibility of the transformation in a short working demonstration.

Scores are not averaged blindly. A candidate cannot advance with evidence below 3, substitute inadequacy below 2, or a contradiction below 3. Reviewers must attach a fatal flaw, confidence level, and evidence that would change their conclusion.

## Stage 4: mechanism generation

Mechanisms are verbs and information flows, not app categories. For each contradiction, explore whether GPT-5.6 or Codex can:

- make hidden state observable;
- turn informal intent into a durable or executable object;
- discover counterexamples the user would not know to request;
- simulate consequences before commitment;
- coordinate context currently fragmented across artifacts or people;
- recover tacit constraints from examples, history, and behavior;
- bind delegated action to explicit authority and provenance;
- create a feedback loop that was previously too expensive.

Every mechanism must state the causal chain:

> Because the system does **M**, the user no longer has to do **W**, which changes outcome **O**, measurable by **K**.

If that sentence cannot be made specific, the mechanism is discarded.

## Kill tests

A concept is removed if any of these are true:

- most of its value can be obtained with one good prompt;
- it is “ChatGPT for X,” generic summarization, or generic task automation;
- the model produces work and then grades the same work without independent evidence;
- it gives the human more alternatives or output to evaluate without reducing decision cost;
- its core mechanism is ordinary test generation, retrieval, classification, or workflow glue with no new feedback loop;
- the claimed novelty disappears after a live competitor and research scan;
- the demo relies on narration instead of a visible state change;
- the target user has no costly present workaround;
- the product cannot state what it does not know.

## Independent review roles

Agents work independently before seeing one another's conclusions:

- **Problem researcher:** verifies prevalence, severity, and causal claims.
- **Market skeptic:** finds substitutes, adjacent research, and reasons the market has not adopted the idea.
- **Mechanism designer:** searches for multiple causal interventions without naming products prematurely.
- **Safety and validity critic:** examines expert dependence, inaccessible users, privacy, high-stakes error, and whether evaluation is circular.
- **Hackathon judge:** scores the final experience against the four official criteria and the under-three-minute demo constraint.

Finalists are compared pairwise. The review preserves disagreement instead of converting it into a falsely precise average.

## Selection standard

A selected concept must have all of the following:

- a real failure event supported by grade A or B evidence;
- a target user whose existing behavior demonstrates demand;
- a contradiction current substitutes do not resolve;
- a mechanism that materially changes the causal chain;
- a reason GPT-5.6 or Codex is structurally useful rather than decorative;
- a coherent product experience with one unmistakable demonstration moment;
- a credible advantage over named current alternatives;
- explicit unknowns, risks, and a falsification test.

The expected result is not certainty. It is a decision whose assumptions and evidence are visible enough to challenge.
