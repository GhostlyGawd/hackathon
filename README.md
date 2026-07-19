# Pactwire

> **Pactwire checks whether school websites and software collect more student information than the district allowed or send it to unapproved companies.**

This repository currently contains the evidence and decision record for an OpenAI Build Week submission. It does **not** yet claim a working product.

## Problem

Students and teachers use websites and software for lessons, homework, tests, grading, and school administration. These products may handle student names, email addresses, classwork, grades, or device information.

Before a district approves a product, the vendor signs a privacy agreement describing what student information the product may collect, why it needs that information, and which other companies may receive it. The software can change after approval while the agreement stays the same. District staff need a practical way to check whether the product still behaves as promised.

## How Pactwire would work

1. District staff create test student and teacher accounts containing made-up names, email addresses, assignments, and other unique test information. No real student records are used.
2. Pactwire uses the website or software the way a student or teacher would—for example, assigning a lesson, submitting work, or editing a profile.
3. A separate recorder captures what test information the product collects and where it sends that information.
4. Pactwire compares those recorded facts with requirements that a district privacy officer has confirmed from the signed agreement.
5. If the evidence does not match the agreement, or Pactwire can no longer inspect a required test, the product alerts district staff and changes the software's status from `APPROVED` to `HOLD` for human review.

Pactwire can report only what happened during the specific tests it ran. It cannot prove that a product is safe or legally compliant, cannot treat untested activity as safe, and cannot restore approval without a person making that decision.

The implementation source of truth is the [Pactwire product requirements document](docs/PRD.md). The [implementation plan](docs/IMPLEMENTATION_PLAN.md) breaks it into test-driven tasks with requirement traceability and evidence gates.

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
