# Cross-track contradiction map

Research snapshot: 2026-07-19. This is the root reviewer's pre-adversarial clustering of the four raw problem atlases. It is not a product shortlist. The independent market, validity/safety, and judge reviews were intentionally not consulted before creating it.

The useful unit is a causal contradiction, not an industry. Problems in different tracks belong together when the same failure structure produces their harm.

## C1 — The burdened party must reconstruct proof controlled by others

**Contradiction:** A consequential decision should follow from shared, reviewable evidence, but the person bearing the consequence must reconstruct the case from rules and records controlled by institutions.

Examples include health-insurance appeals, procedural Medicaid loss, erroneous tenant-screening reports, hourly-pay disputes, post-disaster loss claims, prior authorization, freight invoice disputes, transfer-credit decisions, tax notices, and refused powers of attorney.

Why it matters:

- the workaround already consumes calls, screenshots, letters, portals, spreadsheets, and appeals;
- the outcome is observable: restored coverage, corrected pay, accepted evidence, applied credit, or a reasoned denial;
- the failure combines fragmented documents, changing rules, deadlines, and asymmetric authority.

What could invalidate the cluster:

- the institution may reject model-assembled evidence regardless of quality;
- source access, not reasoning, may be the binding constraint;
- a vertical incumbent or regulatory API may already solve the tractable portion;
- a product could accidentally give legal, financial, or clinical advice while presenting uncertain inferences as fact.

## C2 — Systems record delivery or output, not the state they claim to establish

**Contradiction:** Institutions need scalable evidence that a human state was achieved, but current systems record an artifact, attendance event, or completed task that is only a proxy for that state.

Examples include safety instruction versus worker comprehension, translated medical instructions versus actionable understanding, polished coursework versus mastery, assisted performance versus independent learning, report-card grades versus specific mastery, and translated school notices versus a family's ability to act.

Why it matters:

- failures can remain invisible until injury, exam failure, missed care, or a lost deadline;
- the evidence includes a controlled finding that unrestricted AI help improved practice performance while reducing later unassisted performance;
- the contradiction is amplified by generative AI: artifact quality is becoming cheaper while knowledge of the artifact's creator or recipient becomes less observable.

What could invalidate the cluster:

- the mechanism may collapse into quizzes, oral defense, or generic tutoring;
- measuring comprehension can become surveillance or a punitive score;
- performance in a generated check may still be a weak proxy for real-world transfer;
- high-quality validation may require expert or affected-user access that a solo builder does not possess.

## C3 — Intent becomes lossy when responsibility crosses a boundary

**Contradiction:** Work depends on a shared prospective model of what must remain true, but each role and system preserves a local artifact and makes the receiver reconstruct intent downstream.

Examples include conflicting medication lists, family care coordination, engineering-model-to-machinist handoff, repository-level interactions among agent changes, undocumented correlated code changes, clinical handoffs, construction revisions, grant schemas, and API consumer contracts.

Why it matters:

- individual artifacts can be locally correct while their combination is wrong;
- current version control records what changed more readily than why, what else must change, or which invariants must survive;
- the resulting rework is observable in clarifying questions, companion changes, reversals, delayed work, and integration failures.

What could invalidate the cluster:

- generic architecture maps, knowledge graphs, digital twins, and copilots make the obvious product shapes crowded;
- inferred intent may be confidently wrong and difficult to ground-truth;
- enterprise integration and data standardization may dominate the actual cost;
- preserving more rationale can add documentation theater rather than reduce downstream uncertainty.

## C4 — Composition expands capability and silently weakens dependability

**Contradiction:** Users add tools, agents, packages, or applications to gain capability, but interactions among those components reduce reliability, privacy, or security in ways component-level review cannot see.

Examples include MCP tool-space interference, ambient authority inherited by coding agents, school-app data behavior that differs from policy or contract, AI-recommended package provenance, repository-level friction among individually acceptable changes, and API evolution against unobserved consumers.

Why it matters:

- component catalogs and approval flows validate parts independently while failure emerges from the configured whole;
- the configuration is dynamic and model-, client-, task-, and context-dependent;
- a before/after compatibility or information-flow failure can be demonstrated visibly.

What could invalidate the cluster:

- the strongest direct evidence for tool-space interference is new and may not establish widespread buyer urgency;
- MCP gateways, agent firewalls, dependency scanners, eval platforms, and edtech privacy vendors are expanding rapidly;
- deterministic sandboxing or policy enforcement may be safer than model inference;
- the concept may appeal mainly to tool builders rather than a large recurring user population.

## C5 — People must establish completeness while attention is the scarce resource

**Contradiction:** The costliest error is an overlooked item or interaction, but the available evidence is too large and heterogeneous for exhaustive human review.

Examples include open-source maintainer triage, oversight of agent-generated changes, legal review of multimodal evidence, production-incident reconstruction, incomplete test oracles, flaky-test diagnosis, and review of accessibility or privacy behavior across many changing applications.

Why it matters:

- adding more generated analysis can worsen the same attention bottleneck;
- the valuable output is not a summary but an inspectable coverage boundary: what was checked, what was contradicted, and what remains unknown;
- omission cost and review effort can often be measured.

What could invalidate the cluster:

- no probabilistic system can prove absence, so a false sense of completeness may be worse than manual triage;
- AI review, observability, security, testing, and legal discovery are mature categories;
- evaluation can become circular if the same model generates and judges the evidence;
- the product may merely reorder work without reducing it.

## C6 — Decision-grade certainty arrives only after commitment

**Contradiction:** A person needs a reliable consequence model before choosing, but the authoritative process reveals the answer only after time, money, care, or enrollment has been committed.

Examples include degree-level transfer-credit application after admission, discovering that a listed clinician is not actually available, learning coverage logic after a denial, procedural benefit loss at renewal, and discovering an API consumer's dependency after a breaking release.

Why it matters:

- “accepted,” “listed,” “covered,” or “compatible” is not the same as usable in the actor's concrete situation;
- the visible transformation is from a nominal status to a consequence-specific answer before commitment;
- existing behavior—repeated calls, unofficial estimators, screenshots, test migrations, or abandoned choices—demonstrates demand.

What could invalidate the cluster:

- only the authoritative institution can make the binding decision;
- rules may be unavailable, discretionary, or frequently changed;
- presenting an estimate as certainty could increase harm;
- several verticals already have narrow estimators and mandated interoperability changes.

## C7 — Systems observe a symptom after the causal window has passed

**Contradiction:** Effective intervention depends on the reason a failure is emerging, but operational systems record a late outcome and route action from that coarse signal.

Examples include attendance counts without absence causes, alerts routed by organizational ownership before incident causality is known, facility backlogs based on stale condition data, test failures without environmental cause, and recalls or fraud reports that appear after exposure.

Why it matters:

- the same observed outcome can require incompatible interventions;
- current workflows often escalate, rerun, or punish before the cause is established;
- causal gaps can be represented explicitly rather than collapsed into a confident label.

What could invalidate the cluster:

- staffing, funding, service capacity, or instrumentation may be the real constraint;
- early-cause inference can enable profiling or punitive risk scoring;
- several incident, predictive-maintenance, and student-success markets are saturated;
- the available records may not contain enough information to identify cause safely.

## Pre-review strength assessment

This assessment is deliberately provisional:

1. **C1 — burdened-party proof:** strongest breadth, behavioral demand, and measurable outcomes; highest institutional-acceptance and high-stakes risk.
2. **C2 — proxy versus achieved state:** strongest AI-era contradiction and human meaning; highest risk of becoming a familiar quiz, detector, or surveillance system.
3. **C3 — lossy intent at boundaries:** strongest connection to agentic development and complex work; obvious product forms are crowded.
4. **C4 — composition risk:** freshest and most technically model-native; evidence and buyer urgency are less mature.
5. **C6 — certainty after commitment:** sharpest individual decision moment; fragmented authority may make a truthful product difficult.
6. **C5 — completeness under scarce attention:** severe and measurable; exceptionally crowded and vulnerable to circular evaluation.
7. **C7 — late symptom without cause:** widespread but often downstream of structural constraints software cannot repair.

No cluster advances because of this order. Independent reviews must now determine which individual problem has strong evidence, weak substitutes, safe validation access, and a contradiction narrow enough to support a causal mechanism.
