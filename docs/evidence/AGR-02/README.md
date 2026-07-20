# AGR-02 verification evidence — in progress

AGR-02 is not complete. The deterministic implementation, PostgreSQL guard, signed routes, seeded properties, and two browser stories pass. The required real GPT-5.6 Sol contract cannot run because this environment does not currently expose `OPENAI_API_KEY`.

## Behavior implemented

When `PACTWIRE_REQUIREMENT_PROPOSAL_ADAPTER=openai` is explicitly selected and a server-side `OPENAI_API_KEY` is present, Pactwire sends the exact stored agreement file to the OpenAI Responses API and also supplies its deterministic page map as the authoritative citation text. The default remains the deterministic adapter so CI cannot accidentally make a live request merely because a key exists. The live request targets `gpt-5.6-sol`, uses strict structured output, explicitly sends PDF pages at high detail, disables response storage, and asks for observable test drafts rather than legal or compliance conclusions. These choices follow OpenAI's current [GPT-5.6 Sol model reference](https://developers.openai.com/api/docs/models/gpt-5.6-sol), [structured outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs), [file-input guide](https://developers.openai.com/api/docs/guides/file-inputs), and [Responses API reference](https://developers.openai.com/api/reference/resources/responses/methods/create).

Deterministic code then validates the response schema and searches the stored page text for each verbatim quote. A quote must resolve to exactly one source span. Only then can Pactwire store a `PROPOSED`, `executable: false` requirement version. The database independently rejects any new proposal that does not reference a successful immutable model run.

Refusal, incomplete response, invalid JSON or schema, unrelated input, returned-model mismatch, provider failure, duplicate proposal, or absent/non-unique quote produces a visible failed run and zero proposals. Only incomplete and provider failures receive one bounded retry. Every attempt logs requested and returned model, token counts, latency, and an explicitly estimated standard-tier cost using a dated pricing snapshot. The estimate is not an invoice and does not separately identify cache-write premiums that are absent from the response usage fields.

## What has passed

- Unit contracts cover exact global offsets and hashes, PDF Base64 input, high detail, strict JSON schema, `store: false`, GPT-5.6 Sol identity, all supported response classes, safe transport failure, and short/long-context cost estimates.
- Three seeded properties run 250 cases each and require unsupported outcomes, absent quotes, and any missing required field to materialize zero proposals.
- Service integration covers successful non-executable drafts, one bounded retry with aggregate cost, refusal with no retry, reviewer read-only access, PostgreSQL storage, and immutability.
- Signed HTTP integration covers generation, listing, visible refusal, and permission enforcement.
- Runtime selection tests prove that the web path is deterministic by default, requires explicit live mode plus a key, and rejects unknown modes.
- A least-privilege GitHub Actions workflow can read an encrypted `OPENAI_API_KEY` only on the deliberately created `live/agr-02-contract` branch (or through manual dispatch after merge) and uploads only the sanitized live manifest.
- Browser BDD covers a complete exact-citation draft and a safe refusal recovery. The UI labels its deterministic CI adapter as “not a live GPT-5.6 result.”
- Optimized-production desktop success and narrow refusal captures were made from source commit `3ba9250afaeeed2a33dddadbb00d6f8e13cd95b8` and reviewed for fictional-only data. Their SHA-256 values are `64cdd2ffc893769d845b7d3c47301762ad37f92d5617bb24264e4c0ba8071090` and `2f858db63416d6befaf357f08fecffd41f58b970962dec9719f1da0a35390a81`.
- GitHub Actions run `29719987114` passed the complete clean-checkout matrix on Ubuntu and Windows, and `pnpm audit --prod` reported no known production dependency vulnerabilities.

## Remaining completion gates

1. Add the key through GitHub's encrypted prompt with `gh secret set OPENAI_API_KEY`; do not paste it into chat, a file, or a command argument.
2. Push the reviewed PR head to the isolated `live/agr-02-contract` trigger branch and require the controlled fictional PDF to return at least one exact cited proposal from GPT-5.6 Sol.
3. Review the sanitized live manifest and rerun the complete PR checks at the resulting evidence head.

Until those gates pass, the deterministic adapter proves contract handling and product recovery behavior only. It does not validate GPT-5.6 extraction effectiveness.
