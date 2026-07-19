# OpenAI Build Week idea tournament

This repository currently contains the evidence and decision record for an OpenAI Build Week submission. It does **not** yet claim a working product.

## Selected direction

Build a **district DPA behavior-regression tripwire** for the Education track:

> For a district privacy officer responsible for a signed data-protection agreement, replay authorized synthetic student and teacher journeys after a product change. If deterministic instrumentation witnesses a newly contradictory data flow or loses required observability, move the app from `APPROVED` to `HOLD` pending human review.

The system may witness a contradiction. It may never declare legal compliance, infer that unobserved behavior is safe, or restore approval automatically.

Read the [authoritative recommendation](research/recommendation.md) and the [final adversarial decision](research/reviews/final-second-pass-decision.md).

## Research map

- [Selection methodology](research/methodology.md)
- [Official judge and demo lens](research/judge-lens.md)
- [GPT-5.6 model-native leverage screen](research/model-native-leverage.md)
- [Cross-domain contradiction clusters](research/contradiction-clusters.md)
- [Raw problem atlases](research/raw/)
- [Generated mechanisms](research/mechanisms/)
- [Independent and focused novelty reviews](research/reviews/)

Earlier rankings in the review directory are intermediate tournament artifacts. The recommendation and final second-pass decision supersede them.
