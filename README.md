# Pactwire

> **Pactwire alerts school districts when an app's observed data sharing conflicts with its signed privacy agreement.**

This repository currently contains the evidence and decision record for an OpenAI Build Week submission. It does **not** yet claim a working product.

## Problem

School districts approve education apps based on signed student-data privacy agreements, but an app's data-sharing behavior can change after approval. District privacy staff need a repeatable way to detect observable conflicts without testing with real student data.

## Product

Pactwire replays authorized synthetic student and teacher journeys after an app changes. It records where synthetic data is sent and compares that evidence with human-confirmed terms in the district's agreement. If Pactwire witnesses a new conflict or can no longer observe a required journey, it moves the app from `APPROVED` to `HOLD` for human review.

Pactwire may report a witnessed conflict. It may never declare legal compliance, infer that unobserved behavior is safe, or restore approval automatically.

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
