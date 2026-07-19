# Pactwire — authoritative idea recommendation

Research snapshot: 2026-07-19. This decision deliberately excludes schedule and time-to-build. It selects the strongest evidence-adjusted hackathon bet, not a guaranteed winner or a claim that a new market category has already been proven.

## Decision

Select **Pactwire** for the **Education** track. It gives school districts a repeatable way to check whether school websites and software collect more student information than the district allowed or send it to unapproved companies.

> **Pactwire checks whether school websites and software collect more student information than the district allowed or send it to unapproved companies.**

> For a district privacy officer responsible for a signed data-protection agreement (DPA), replay authorized synthetic student and teacher journeys after a meaningful app change. If deterministic instrumentation witnesses a newly contradictory data flow or loses required observability, change the district's app state from `APPROVED` to `HOLD` pending human review.

This is not an AI privacy scanner and not an automated compliance gate. It is a district-specific regression control with an intentionally asymmetric authority rule:

```text
new witnessed contradiction or lost required observability
    -> APPROVED becomes HOLD

missing evidence, a clean sampled run, or a model opinion
    -> never creates or restores APPROVED
```

The [final second-pass adversarial review](reviews/final-second-pass-decision.md) is the full decision record.

## Why this problem survives

The [Utah State Board of Education/BYU/Internet Safety Labs investigation](https://schools.utah.gov/studentdataprivacy/files/Utah%20EdTech%20App%20Data%20Collection%20and%20Sharing%20-%202023-25%20Investigation.pdf) already established both the problem and the strongest manual baseline. Investigators used synthetic child-like accounts and authorized credentials, exercised real application journeys, captured network behavior, and compared observations with contracts and policies. They found at least one contractually unlisted data element in 44 of 85 tested apps with an SDPC-based DPA. That is strong evidence for the verification gap in the tested set, not a national prevalence estimate.

The direction survives because it changes a state the district controls and leaves a replayable witness outside the model. A difficult input—a signed DPA plus an unfamiliar live application—produces captured requests, canary propagation, exact contract citations, and a reversible procurement state change. The product remains useful when GPT-5.6 is wrong because deterministic instrumentation owns the evidence and a human owns the consequential decision.

## What is and is not novel

The broad category is not new. [Internet Safety Labs](https://internetsafetylabs.org/) and [AppCensus](https://appcensus.io/) already inspect application behavior; [POLICHECK](https://research.ibm.com/publications/actions-speak-louder-than-words-entity-sensitive-privacy-policy-and-data-flow-analysis-with-policheck) and adjacent research compare policy with observed data flow; products such as [Lightspeed Digital Insight](https://www.lightspeedsystems.com/products/lightspeed-digital-insight/) already sit inside district app-discovery, DPA, approval, and blocking workflows.

The defensible residual is the combination of:

- the district's own signed DPA and tenant configuration;
- authorized role-specific student and teacher journeys;
- unique synthetic canaries with field-level propagation evidence;
- deterministic, replayable before-and-after regression receipts; and
- an automatic `APPROVED -> HOLD` transition, but never automatic approval.

That is differentiated product whitespace, not proof of a clean-slate category.

## Why GPT-5.6 is structural only conditionally

GPT-5.6 may explore unfamiliar authenticated interfaces, propose contract-to-scenario mappings with exact source spans, and repair journeys after interfaces change. It may not fabricate traffic, interpret law, hash evidence, decide compliance, or control approval.

The model-native claim survives only if GPT-5.6 finds materially more contract-relevant behavior per expert hour than a human-recorded browser journey using the same proxy, canary matcher, and deterministic rules. If an ordinary recorder/replayer matches its coverage and authoring effort, the product loses its strongest technological-implementation claim.

## The three-minute truth test

1. A privacy officer confirms one DPA obligation, two named journeys, and synthetic canary fields before execution.
2. GPT-5.6 operates a controlled test app or explicitly authorized tenant while a separate layer records network events and screenshots.
3. A canary appears in a request that contradicts the reviewed test obligation. The receipt binds the packet, destination, journey, timestamp, screenshot, hash, and exact DPA span.
4. The product says `WITNESSED CONTRADICTION`, not “illegal” or “noncompliant,” and changes an actual approval record from `APPROVED` to `HOLD`.
5. A fixed version is replayed. The product says only `NOT RE-OBSERVED IN THESE JOURNEYS`; a human decides whether to restore approval.
6. An unexercised or encrypted path visibly ends as `NOT EXERCISED` or `NOT OBSERVABLE`, never green.

The proof is the captured external event and changed operational record—not an agent trace, plan, or model-authored score.

## Official-rubric ceiling

These are ceilings for an honest, complete product rather than scores for the current research repository.

| Criterion | Ceiling | Binding condition |
| --- | ---: | --- |
| Technological Implementation | **4/4** | Deep computer-use, contract mapping, deterministic capture, replay, sandboxing, evidence lineage, and operational enforcement; GPT-5.6 must beat the recorder/replayer ablation. |
| Design | **4/4** | One coherent path from contract and synthetic tenant to bounded evidence, hold, expert review, and safe uncertainty states. |
| Potential Impact | **4/4** | Strong direct problem evidence and a consequential institutional control; adoption and broader prevalence still require validation. |
| Quality of the Idea | **2/4** | Useful district-specific recombination, but direct audit, policy-flow, canary, and approval-workflow predecessors cap novelty. |
| **Total** | **14/16** | Medium-confidence ceiling, conditional on the truth test above. |

The official listed-order tie-break favors Technological Implementation when totals are equal. This is one reason the tripwire beats the other 14-point finalist in the evidence-adjusted hackathon comparison.

## Runner-up: stronger category thesis, weaker current bet

The **Completion Offer Network** is the strongest conditional standalone-category thesis: before an enrollment deposit, at least two receiving institutions issue standardized, digitally signed, major-specific statements showing exactly how a student's credits apply and what degree requirements remain. Students compare institutional commitments rather than model estimates.

It is not selected now because the institution's signature is the causal state change. Without two real issuers, a simulated registrar makes the central demo fictional. If real institutions agree to issue and honor those offers, the [binding-transfer audit](reviews/binding-transfer-novelty.md) says it should be promoted above the tripwire as the category bet.

## Why the tempting alternatives lost

- A revolutionary local ADE, executable forks, and causal repository history collapsed into feature-shaped combinations with heavy Replit, Figma, v0, requirements-prototyping, temporal-coupling, testing, and merge-queue prior art.
- Agent-tool compatibility lockfiles collapsed into task-specific configuration evaluation; the honest residual is an expiring non-regression receipt inside an eval platform or gateway.
- Intent-bound dependency resolution collapsed into provenance, policy, and an authority-rooted allowlist dilemma.
- Capability settlement addresses a real learning proxy failure but remains too close to delayed mastery and transfer assessment.
- A manufacturing ambiguity witness has exceptional technical theater risk: without an engineer-owned critical-to-quality predicate, two conforming variants prove permitted variation rather than a defect.
- Worker cohort pay reconciliation has important stakes but compressed novelty and unresolved governance, retaliation, and re-identification risk without a worker organization.

The detailed evidence and kill rulings remain in [the review archive](reviews/).

## Decisive experiment and kill rule

Compare three arms on explicitly authorized browser-based school-app tenants: a Utah-style manual audit, a deterministic human-recorded journey replayer, and GPT-5.6 journey discovery using the same evidence layer. Predeclare seeded contradictions and blind the evaluators.

Advance only if the GPT-5.6 arm maintains at least 95% precision on witnessed contradictions, detects at least 85% of instrumentable seeded contradictions, doubles contract-relevant path coverage per expert hour over deterministic replay, halves human journey authoring and repair time, preserves stable evidence hashes, and never emits an unbounded compliance conclusion.

Kill this as the lead if the deterministic recorder matches it, the contradiction cannot be reproduced from external state, the hold is only a decorative dashboard label, or authorization and synthetic-data isolation cannot be demonstrated.

## Bottom line

Build **Pactwire** as the district DPA behavior-regression tripwire. Its strongest claim is narrow but real: turn a district-specific contract regression into a replayable external witness and a reversible institutional hold. Keep the Completion Offer Network as the higher category-upside direction only after real issuers make its central promise non-fictional.
