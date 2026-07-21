# DET-01 domain-ownership evidence decision

- **Status:** Accepted for P0
- **Date:** 2026-07-21
- **Owners:** DET-01 / FR-034
- **Scope:** Evidence a person may use to confirm that an observed hostname belongs to a named entity

## Decision

An observed hostname begins **UNKNOWN**. Deterministic capture proves only that the hostname was observed; DNS data, certificates, redirects, page content, screenshots, search results, and model output do not by themselves establish who owns it.

A user with `DESTINATION_CONFIRM` may confirm a domain-to-entity mapping from one of these retained source types:

1. a district-owned vendor or application inventory;
2. the exact stored signed agreement;
3. a named vendor attestation; or
4. a document served from a vendor-controlled source.

The reviewer must retain the source title, locator, SHA-256 hash, exact excerpt, page when applicable, rationale, identity, and review time. The excerpt must identify both the exact hostname and the entity the person confirms. Pactwire records the decision as a new immutable destination version; it does not rewrite the observation or an earlier review.

Agreement recipient status is a separate decision. `ALLOWED` or `PROHIBITED` requires an exact stored agreement version plus a verbatim quote and page that Pactwire verifies against that version. A district inventory, vendor statement, public page, technical observation, or model interpretation cannot assign agreement status. A mapping confirmed for one entity does not transfer to another entity, and a status reviewed under one agreement version does not transfer to another version.

## Authority boundary

| Input | What it may establish | What it cannot establish |
| --- | --- | --- |
| Deterministic recorder observation | The exact hostname was observed in a named capture | Company ownership or agreement status |
| Accepted mapping source + named human review | The reviewer confirmed the hostname-to-entity link | Agreement permission or prohibition by itself |
| Exact stored agreement quote + named human review | `ALLOWED` or `PROHIBITED` for that agreement version | Status under another agreement version or legal compliance |
| Model research or prose | A research lead shown to a person | A confirmed mapping, classification, finding, or approval change |

If the source is missing, does not name the exact hostname and entity, cannot be tied to the cited agreement bytes, or remains disputed, the destination stays **UNKNOWN**. Uncertainty is never converted into a recipient conflict or a clean result.

## Consequences

- The registry retains source evidence and human provenance rather than a bare company label.
- Every new recorder observation and every human review appends a content-hashed version.
- Reclassification after a new agreement requires a new human review against that exact version.
- Correcting an entity mapping creates a new version and clears classifications inherited from the former entity.
- DET-03 may consume only a resolved, human-confirmed classification for the exact agreement version. It must map every other case to an uncertainty state.
- This decision supports mechanism testing with fictional fixtures; it is not a legal conclusion or a representation that a real vendor owns a domain.
