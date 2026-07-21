# DET-01 verification evidence

DET-01 implements a human-confirmed destination registry. A recorder observation creates an immutable `UNKNOWN` version containing the exact canonical hostname, observation hash, source locator, and non-model actor. It cannot assign a company or agreement status.

A user with `DESTINATION_CONFIRM` may append a human review only after citing accepted entity-mapping evidence and an exact quote and page from one stored agreement version. Pactwire verifies signed-agreement hashes and quotes, retains the reviewer and rationale, and resolves `ALLOWED` or `PROHIBITED` only for that exact agreement version. Stale reviews, model authors, automation classification changes, mismatched quotes, unauthorized reviewers, updates, and deletes are rejected.

The implementation and screenshots are bound to source commit `b9a9767e1f930c8856e4b0668c4f52258d81fb4e`.

## Red-first record

The [manifest](manifest.json) records the initial missing-module failures, the missing HTTP routes, and fourteen undefined browser steps. Seed `20260723` also shrank an overbroad generator to `a.0`; that invalid numeric terminal label is now a permanent rejection example while the property generates valid `.test` hostnames.

## Current proof

- The complete optimized-production repository gate passes in 319.3 seconds with 72 deterministic test files and 289 checks, plus 46 browser scenarios and 536 steps.
- Two PROP-04 properties cover 500 generated cases: unseen hostnames and recorder observations remain `UNKNOWN` without a human review.
- Service and HTTP tests prove exact-source human review, reviewer-role denial, quote mismatch refusal, stale-version serialization, and workspace authorization.
- PostgreSQL tests prove latest-source append, exact stored agreement/page evidence, automation classification rejection, and immutable update/delete guards.
- Two production-browser scenarios cross the real UI and API boundaries for unknown, allowed, and prohibited states with no console, request, framework-overlay, or popup errors.
- The accepted evidence decision is documented in [DET-01-domain-ownership-evidence.md](../../decisions/DET-01-domain-ownership-evidence.md).

## Source-bound visual evidence

- [Known allowed destination](known-allowed-destination-desktop.png): the fictional classroom service is shown as `ALLOWED` only after a named person confirms the entity and exact agreement version.
- [Known prohibited destination](known-prohibited-destination-desktop.png): the fictional analytics service is shown as `PROHIBITED` through the same human-only evidence path.
- [Unknown destination at a narrow viewport](unknown-destination-narrow.png): the observed host remains `UNKNOWN`, and the UI directly states that no company or agreement status was assigned.

All three images were captured from the running product, visually inspected, and scanned by inspection for credentials, personal paths, real student information, real-vendor accusations, and non-fictional identities. None are present.

## Claim boundary and completion status

DET-01 proves that recipient identity and status cannot outrun human-confirmed evidence in the registry. It does not itself create a finding, establish that a real company owns a domain, interpret an agreement as law, prove compliance, or alter software approval. DET-03 owns bounded finding evaluation.

The implementation, local tests, and visual evidence are green. The manifest remains `IN_PROGRESS` until GitHub Actions completes successfully; an account-level billing/spending rejection has blocked recent repository workflows before checkout.
