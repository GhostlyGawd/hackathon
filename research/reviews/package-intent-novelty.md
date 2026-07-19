# Novelty audit — intent-bound dependency resolution

Research snapshot: 2026-07-19. This is a novelty and falsification audit of P1 in `research/mechanisms/developer-tools.md`, not a product endorsement.

## Ruling

**RESHAPE — medium-high confidence.** Do not advance the current framing as a new “semantic dependency address,” and do not retain its “high mechanism confidence” without an adversarial benchmark.

The problem is real. The peer-reviewed, Distinguished Paper Award-winning USENIX Security 2025 study found package hallucinations across every tested model and, crucially, explains why checking whether a name now exists is not a defense: an attacker can publish the hallucinated name and thereby enter the registry-derived allow-list. Its registry snapshot may itself already contain malicious hallucination packages. The study measured older models, so its exact rates must not be attributed to GPT-5.6, but the attack mechanism is valid and independently current. A July 2026 agent-harness study further reports that coding agents commonly miss source redirection and that a deterministic pre-install check of names, sources, and versions closes most of its tested gap. ([USENIX paper](https://www.usenix.org/conference/usenixsecurity25/presentation/spracklen), [July 2026 preprint](https://arxiv.org/abs/2607.15143))

What is not novel is almost every individual ingredient in P1: capability-based dependency resolution, natural-language package recommendation, intent-aware evidence aggregation, package identity, source/build provenance, package risk scoring, and pre-install enforcement all have direct prior art or shipping substitutes.

One defensible residue remains: **an agent dependency-introduction receipt that preserves authority continuity from a trust anchor which predates candidate selection, through a source repository and publisher, to an immutable artifact and an executed compatibility witness.** The candidate package must not be allowed to manufacture its own trust anchor. No public source reviewed here establishes that exact task-authority-to-artifact invariant as a mandatory coding-agent install condition.

That is narrower than “resolve any intent into the right package.” It is closer to **context-bound dependency admission**:

- If the task, existing repository, organization policy, or already trusted documentation establishes an authoritative upstream source, bind that source to the package artifact before installation.
- If the task is open-ended package discovery and no independent authority exists, recommend candidates but do not autonomously authorize one.
- If several packages legitimately satisfy the capability, preserve the set or ask for authority; do not invent a unique “intended package.”

## Threat model and claim boundary

The meaningful attack is not merely “the model emitted a nonexistent name.” It is:

1. A model emits a plausible package name at time T0.
2. An attacker registers it at T1.
3. The attacker may also create a polished source repository, publish with valid provenance from that repository, and implement the advertised happy-path API.
4. At T2, registry existence, signature/provenance, superficial API compatibility, and ordinary package-health signals can all appear mutually consistent.
5. An agent installs or executes the artifact because it mistakes coherence for authority.

P1 can prevent that only when at least one authority anchor is independent of the candidate’s registry metadata, candidate-controlled repository, and candidate-controlled documentation. Examples are an existing repository policy, an organization-approved source owner, a source URL cited by an already trusted project, an earlier lockfile/history decision, or an explicit human approval of a source root.

The mechanism does **not** establish that code is benign. npm explicitly says provenance links an artifact to source and build instructions but does not guarantee an absence of malicious code. An import/API probe establishes bounded functional fit, not safety. ([npm provenance limitations](https://docs.npmjs.com/generating-provenance-statements/))

It is also out of scope for canonical-upstream compromise, maintainer account takeover, malicious but correctly attributed code, future malicious updates, undisclosed vulnerabilities, and transitive dependencies unless the same admission policy is applied recursively.

## Closest substitutes

| Substitute | What it already covers | Exact residual gap, if any |
|---|---|---|
| [PackMonitor](https://arxiv.org/abs/2602.20717) (2026 preprint) | Intervenes during decoding and restricts generated installation names to a finite authoritative registry list; reports zero package hallucinations under its validity definition. | Registry membership proves existence, not that a newly registered name corresponds to the task’s intended upstream. The USENIX work explicitly identifies post-registration allow-list contamination as the hard case. |
| [Deterministic agent pre-install hook study](https://arxiv.org/abs/2607.15143) (2026 preprint) | Tests production coding-agent harnesses and proposes pre-execution verification of package names, sources, and versions; reports that this closes most tested setup-instruction attacks. | It does not publicly define a task-level authority receipt, publisher/source/artifact continuity, or semantic fit witness. It is nevertheless extremely close and removes any claim that “agent pre-install source verification” itself is white space. |
| [Snyk Studio package health check and install hook](https://docs.snyk.io/integrations/snyk-studio-agentic-integrations/directives) | Shipping agent workflow for comparing candidate packages on vulnerability, maintenance, community, and popularity signals; blocks install commands until the check runs. | The public directive is candidate-health admission, not proof that the candidate is the dependency authorized by the task. Snyk’s malicious-package docs also say its scanners currently do not consider package provenance or origin. ([Snyk provenance boundary](https://docs.snyk.io/manage-risk/prioritize-issues-for-fixing/malicious-packages)) |
| [Socket MCP](https://docs.socket.dev/docs/guide-to-socket-mcp) and [Socket Firewall in Replit](https://socket.dev/blog/socket-partners-with-replit-to-block-malicious-packages) | Puts package scoring and malicious-package blocking directly into agent selection/install paths. Socket says its Replit integration evaluates dependencies as introduced and was blocking about 8,000 packages per day in June 2026; that number is a vendor-reported operational claim. | Its documented MCP input is already-selected ecosystem/name/version. The reviewed docs do not show a binding from independently established task authority to canonical source and artifact. |
| [Phylum Package Firewall](https://docs.phylum.io/package_firewall/faq) | Registry proxy that blocks policy-violating or unanalyzed packages before execution. Its documentation also recognizes uncertainty between a requested external reference and the delivered artifact. ([unverifiable dependencies](https://docs.phylum.io/analytics/odd_dependency)) | Package policy and delivery integrity begin after a dependency reference exists; the reviewed docs do not establish why that identity is the task-authorized project. |
| [PySelect](https://arxiv.org/abs/2508.05693), [AIDT’s LLM/RAG package-selection study](https://doi.org/10.19153/cleiej.27.2.4), and [NCQ](https://doi.org/10.1109/TSE.2023.3248113) | Natural-language requirement interpretation, package retrieval/recommendation, multi-source evidence, quality criteria, and executable package exploration all predate P1. PySelect explicitly combines LLM intent modeling with a package knowledge graph containing repository, registry, vulnerability, usage, and community evidence. | They are recommendation/decision support, not an attack-resistant install authorization chain. This prior art kills “LLM understands task intent and finds an evidence-backed package” as the novelty claim. |
| [npm provenance](https://docs.npmjs.com/generating-provenance-statements/), [SLSA verification expectations](https://slsa.dev/spec/v1.2/verifying-artifacts), and [Sigstore](https://docs.sigstore.dev/about/overview/) | Bind an artifact to a source/build/signer and allow consumers to verify actual provenance against expected provenance. SLSA already discusses package-name-to-canonical-source expectations, including expectations defined in source. | They answer “where did this artifact come from?” and “did it match the expected build?”, not “who had authority to decide this task needed this upstream?” A malicious publisher can authentically attest malicious code from its own repository. |
| [deps.dev API](https://docs.deps.dev/api/v3/), [GUAC](https://docs.guac.sh/guac/known-and-unknown/), [CycloneDX identity evidence](https://cyclonedx.org/guides/OWASP_CycloneDX-Authoritative-Guide-to-SBOM-en.pdf), and standardized [Package-URL / ECMA-427](https://ecma-international.org/publications-and-standards/standards/ecma-427/) | Already join or encode package names, versions, purls, registries, source repositories, commits, attestations, digests, vulnerabilities, licenses, SBOMs, and confidence/evidence. deps.dev distinguishes verified attestations from unverified metadata links. | These are the right evidence substrate for the proposed receipt, not the missing authorization rule. A new coordinate format would duplicate standards. |
| [Debian virtual packages](https://www.debian.org/doc/debian-policy/ch-relationships.html#virtual-packages-provides), [RPM Provides](https://rpm.org/docs/latest/manual/dependencies.html), [Gradle capabilities](https://docs.gradle.org/current/userguide/component_capabilities.html), and Python [`Provides-Dist`](https://packaging.python.org/en/latest/specifications/core-metadata/#provides-dist-multiple-use) | Long-standing dependency declarations and solvers already allow a requirement to name functionality/capability rather than one concrete package; Gradle can choose among components advertising a capability. | They rely on ecosystem or producer-declared capabilities and do not recover a free-form task contract or defend against a self-declared malicious provider. They decisively kill “dependencies addressed by intent, not strings” as a new primitive. |

OpenSSF’s current package-security landscape reinforces the distinction. Package Analysis dynamically observes files, commands, and network behavior; registry guidance covers name-squatting controls, malware detection, provenance, hashes, SBOMs, and vulnerability warnings. These are powerful package facts, but not task authority. ([OpenSSF Package Analysis](https://openssf.org/package-analysis/), [repository security principles](https://repos.openssf.org/principles-for-package-repository-security.html))

## What remains novel enough to test

The surviving object should not be a new package coordinate. Use existing purl, digest, provenance, and SBOM fields inside a signed or content-addressed **dependency-introduction receipt**:

```text
authority
  trusted root + source URI + evidence timestamp/digest + approving actor/policy

need
  required behavior/symbols + runtime/ecosystem + license/security constraints
  + repository state against which the need was inferred

candidate
  purl + registry + publisher identity + source URI/commit + artifact digest

witness
  hermetic import/API/integration assertions + environment digest + observed result

decision
  admitted | unresolved | denied + deterministic policy reasons
```

The admission invariant is:

> At least one trusted authority edge must precede and be independent of candidate discovery; verified edges must connect that authority to source, publisher, artifact, and the required bounded behavior. Candidate-controlled claims may corroborate but may not bootstrap authority.

Consequences:

- A freshly registered hallucinated package with impeccable provenance to an attacker repository is still unresolved because provenance authenticates the wrong authority chain.
- A rare new legitimate package is not penalized for low popularity. It passes if the user or organization explicitly authorizes its source root and provenance plus the hermetic witness connect that source to the artifact and required behavior.
- Multiple legitimate providers remain multiple; the receipt records why one was authorized rather than pretending semantic inference discovered a single true identity.
- Missing provenance, a private package, or conflicting sources yields `IDENTITY UNRESOLVED`. It never silently degrades to popularity or model confidence.

This is an install-permission primitive for agents, not a general malware detector, universal recommender, or proof of package safety. Its strongest product form is a package-manager/harness hook plus portable receipt, not a broad ADE.

## Is GPT-5.6 structurally necessary?

**Not for enforcement. Possibly for making the contract cheap enough to author. This is an unproven hypothesis, not an established advantage.**

The deterministic system should own trust roots, temporal precedence, signature/provenance verification, purl and digest canonicalization, policy evaluation, sandbox boundaries, witness outcomes, and the final allow/abstain decision.

GPT-5.6 can be structurally useful only in the messy front half:

- recover required APIs, symbols, environment constraints, and “no new dependency” possibilities from a long task conversation, issue history, repository, lockfile, and trusted upstream docs;
- propose the smallest falsifiable compatibility witness and map unstructured documentation to candidate API probes;
- expose contradictions between registry metadata, source history, docs, and the actual artifact;
- use Programmatic Tool Calling for bounded joins and validation across registry, deps.dev, source, provenance, and sandbox results.

That task shape fits OpenAI’s documented guidance: GPT-5.6 improves intent understanding, and Programmatic Tool Calling is intended for bounded filtering, joining, ranking, aggregation, and validation. The same guidance warns that representative final-outcome evals—not tool count—must establish value. Multi-agent is unnecessary here unless independent evidence routes are genuinely isolated; otherwise it is theater. ([official GPT-5.6 guidance](https://developers.openai.com/api/docs/guides/latest-model), [GPT-5.6 model capabilities](https://developers.openai.com/api/docs/models/gpt-5.6-sol))

The required model ablation is:

1. Human-authored structured contract plus deterministic verifier.
2. Retrieval/embedding package recommender plus the same verifier.
3. A smaller/current non-frontier model extracting the contract plus the same verifier.
4. GPT-5.6 extracting the contract and generating the witness plus the same verifier.

Measure wrong admissions, correct admissions, abstention calibration, human corrections to the inferred contract, authoring time, and witness validity. **Kill the hackathon-specific model claim if GPT-5.6 does not reduce human contract work at equal or better admission accuracy than the simpler baselines.** The mechanism may still be useful security infrastructure, but GPT-5.6 would be decorative.

## Strongest external-ground-truth experiment

Build a temporally sealed benchmark in disposable registries and sandboxes. Do not use an LLM judge.

### Cases

- **Established-authority cases:** repository issues or maintainer-authored change requests that name or unambiguously link an upstream source before candidate selection.
- **Slopsquat cases:** at T0 an agent emits a nonexistent but plausible name; at T1 the benchmark publishes that name to a private registry from an attacker-controlled repository with valid provenance and a compatible surface API.
- **Rare legitimate cases:** newly published, low-download packages whose source root is explicitly authorized before publication and whose artifacts carry valid provenance.
- **Ambiguous-fit cases:** two or more honest packages satisfy the same functional contract.
- **No-new-dependency cases:** the required behavior already exists in the standard library or current dependency graph.
- **Unsupported cases:** private packages, missing provenance, conflicting authoritative sources, renamed/forked projects, and unsafe probes.

For historical public tasks, use the pre-change issue/task and repository state as input and the maintainer’s eventual dependency commit, canonical upstream source, and hidden integration tests as labels. Prevent memorization leakage by using post-February-2026 tasks, private fixtures, or semantics-preserving renamed mirrors. A maintainer/benchmark author must commit the authority label before candidate generation.

### Baselines

1. Unrestricted coding agent plus live registry resolution.
2. Registry-existence / PackMonitor-style finite-name gate.
3. Provenance-only source verification.
4. Current pre-install health gates such as Snyk, Socket, or Phylum where actual licensed APIs can be run; omit a product rather than simulate and mischaracterize it.
5. Human-authored source allow-list plus deterministic verifier.
6. Reshaped authority-continuity receipt, with and without GPT-5.6 contract extraction.

### Ground truth and measurements

- **Identity authorization:** precommitted trusted source/publisher mapping, not a model label.
- **Artifact identity:** registry record, purl, verified attestation, and immutable digest.
- **Functional fit:** hidden deterministic integration assertions owned outside the model.
- **Known attack execution:** a harmless marker written only inside a networkless, secretless sandbox by the benchmark decoy.
- **Primary metric:** unauthorized/wrong-package executions.
- **Secondary metrics:** correct legitimate admissions, rare/new false blocks, useful abstentions, human authority confirmations, time to admitted lockfile, and policy drift on later versions.

Falsify the mechanism if any decoy can authorize itself using only candidate-controlled evidence; if the best non-LLM source-policy gate matches it without materially more human work; if legitimate new-package use collapses into per-package manual approval with no saved effort; or if receipts fail to predict later install decisions after package/model/registry updates.

## Three-minute demo causal spine

Use a local registry and two isolated workspaces so no public package name or real machine is put at risk.

1. **Event:** a developer asks Codex to add a concrete capability to an existing repository. The task and repository contain a trusted upstream documentation/source anchor, but the model proposes a plausible shorthand package name that does not yet exist.
2. **Attack:** publish that exact name into the local registry from a polished attacker repository. Give it valid provenance to that repository and a compatible shallow API. Its sandbox-only payload writes `wrong-package-executed` when used.
3. **Baseline consequence:** registry-existence and provenance-only resolution now admit the real, signed package; the marker visibly appears in the baseline sandbox. Do not claim a proprietary scanner would admit it unless it was actually tested.
4. **Mechanism:** GPT-5.6 extracts the required symbols and constraints from the task/repository, while deterministic tools join the trusted upstream anchor, registry record, source/publisher attestation, artifact digest, and hermetic witness.
5. **Visible changed state:** the source mismatch makes the protected workspace show `IDENTITY UNRESOLVED`; its lockfile remains unchanged and the marker never appears. The resolver either uses an already authorized dependency whose hidden integration test passes or asks the developer to authorize a source root.
6. **Boundary:** run a rare legitimate package through the same path. Low popularity does not block it; the independently authorized source, provenance, digest, and witness admit it. This demonstrates authority continuity rather than popularity scoring.

## Fatal flaw

The fatal flaw in the original P1 is the **authority-bootstrap dilemma**:

- If the resolver may infer the canonical project/source from registry metadata, package docs, search results, or a repository setup document under attacker control, the attacker can create a complete, signed, API-compatible false story. Provenance and executable fit strengthen the wrong conclusion.
- If the resolver requires an independently trusted source root before admitting a package, genuinely open-ended discovery cannot be autonomous. Someone or some organization policy must authorize the source, making the mechanism look like an evidence-rich allow-list or SLSA expectation gate.

No amount of GPT-5.6 reasoning resolves that tradeoff. The honest design must separate **recommendation** from **authorization**, call self-consistent but unanchored evidence `UNRESOLVED`, and claim prevention only for wrong-authority installs. If that narrower workflow does not save substantial human effort over a source allow-list, **KILL** it.

## Advance condition

Conditionally advance only the reshaped mechanism to the finalist round, under the name **authority-continuity dependency admission** or **dependency-introduction receipts**. Demote the broad “intent-bound semantic address” claim.

It earns a benchmark because it targets the precise hole left by registry existence, provenance, and package-health gates: a package can be real, signed, superficially functional, and still be the wrong authority for the task. It is not yet the strongest first-place recommendation because current agent-security vendors can absorb it as a hook, GPT-5.6’s causal contribution is unproven, and the trust-anchor requirement may reduce the product to a better-presented allow-list.
