# AGR-02 verification evidence — complete

AGR-02 is complete at source commit `694060df2ea0f6b24a3a67df88ee3172ae4c81a1`. The deterministic implementation, PostgreSQL guard, signed routes, seeded properties, two browser stories, bounded provider diagnostics, and the required real GPT-5.6 Sol fictional-PDF contract pass.

## Behavior implemented

When `PACTWIRE_REQUIREMENT_PROPOSAL_ADAPTER=openai` is explicitly selected and a server-side `OPENAI_API_KEY` is present, Pactwire sends the exact stored agreement file to the OpenAI Responses API and supplies its deterministic page map as the authoritative citation text. The default remains the deterministic adapter so CI cannot accidentally make a live request merely because a key exists. The live request targets `gpt-5.6-sol`, uses strict structured output, sends PDF pages at high detail, disables response storage, and asks for observable test drafts rather than legal or compliance conclusions. These choices follow OpenAI's current [GPT-5.6 Sol model reference](https://developers.openai.com/api/docs/models/gpt-5.6-sol), [structured outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs), [file-input guide](https://developers.openai.com/api/docs/guides/file-inputs), and [Responses API reference](https://developers.openai.com/api/reference/resources/responses/methods/create).

Deterministic code validates the response schema and searches the stored page text for each verbatim quote. A quote must resolve to exactly one source span. Only then can Pactwire store a `PROPOSED`, `executable: false` requirement version. The database independently rejects any new proposal that does not reference a successful immutable model run.

Refusal, incomplete response, invalid JSON or schema, unrelated input, returned-model mismatch, provider failure, duplicate proposal, or absent/non-unique quote produces a visible failed run and zero proposals. Only incomplete and provider failures receive one bounded retry. Every attempt logs requested and returned model, token counts, latency, and an explicitly estimated standard-tier cost using a dated pricing snapshot. Transport failures expose only a bounded HTTP status and provider identifiers to the isolated contract diagnostic; upstream messages never enter product output.

## What passed

- Unit contracts cover exact global offsets and hashes, PDF Base64 input, high detail, strict JSON schema, `store: false`, GPT-5.6 Sol identity, all supported response classes, safe transport diagnostics, and short/long-context cost estimates.
- Three seeded properties ran 250 cases each with seed `20260719` and required unsupported outcomes, absent quotes, and any missing required field to materialize zero proposals.
- Service integration covers successful non-executable drafts, one bounded retry with aggregate cost, refusal with no retry, reviewer read-only access, PostgreSQL storage, and immutability.
- Signed HTTP integration covers generation, listing, visible refusal, and permission enforcement.
- Runtime selection tests prove that the web path is deterministic by default, requires explicit live mode plus a key, and rejects unknown modes.
- The least-privilege GitHub Actions workflow reads the encrypted key only on the deliberately created `live/agr-02-contract` branch or through manual dispatch after merge, and uploads only the sanitized live manifest.
- Browser BDD covers a complete exact-citation draft and a safe refusal recovery. The UI labels its deterministic CI adapter as “not a live GPT-5.6 result.”
- Optimized-production desktop success and narrow refusal captures were made from source commit `3ba9250afaeeed2a33dddadbb00d6f8e13cd95b8` and reviewed for fictional-only data. Their SHA-256 values are `64cdd2ffc893769d845b7d3c47301762ad37f92d5617bb24264e4c0ba8071090` and `2f858db63416d6befaf357f08fecffd41f58b970962dec9719f1da0a35390a81`.
- Clean-checkout CI at source commit `694060df2ea0f6b24a3a67df88ee3172ae4c81a1` passed the complete repository verification suite on [Ubuntu](https://github.com/GhostlyGawd/hackathon/actions/runs/29767561235/job/88437372236) and [Windows](https://github.com/GhostlyGawd/hackathon/actions/runs/29767561235/job/88437372350).
- After the required PROP-20 timeout and canonical BDD-server regressions were isolated and merged in [PR #17](https://github.com/GhostlyGawd/hackathon/pull/17) and [PR #18](https://github.com/GhostlyGawd/hackathon/pull/18), the combined head passed `pnpm verify` locally in 339.5 seconds: 78 unit, 26 property, 68 integration, 20 BDD scenarios / 203 steps, and 2 E2E tests, with zero failures, skips, or retries.

## Live GPT-5.6 Sol contract

[GitHub Actions run `29767561187`, attempt 2](https://github.com/GhostlyGawd/hackathon/actions/runs/29767561187) executed `pnpm test:live-openai` against the controlled two-page fictional DPA at source commit `694060df2ea0f6b24a3a67df88ee3172ae4c81a1`. GPT-5.6 Sol returned two structured proposals. Both verbatim quote hashes, page numbers, and global offsets matched the deterministic source map, so the contract passed without treating model output as ground truth.

The reviewed artifact is [artifact `8472558106`](https://github.com/GhostlyGawd/hackathon/actions/runs/29767561187/artifacts/8472558106), captured on 2026-07-20. GitHub recorded archive digest `sha256:251e53c114dcdee3d05556431a6ddd562d2aa6003f48dae945179feea42e964f`; the extracted manifest has SHA-256 `cdd64b0bfd6b59e35eb6a9c12f8db6ae4296dcaeb21120ec3c2b9c6a15a03420`. The durable sanitized copy is [`live-openai-contract.json`](live-openai-contract.json). It contains hashes, model identity, usage, latency, proposal count, and citation locations; it contains neither source text nor an API key.

Attempt 1 of the same run failed safely with HTTP `429` and provider code `insufficient_quota`. It produced no accepted proposal and no artifact. A focused red/green regression now proves that only bounded status/code diagnostics survive a rejected provider request. Attempt 2 passed after API credit became available; this history is retained rather than hidden.

## Known limitations

- This live contract validates one controlled, two-page fictional PDF and two exact citations. It does not establish extraction accuracy across real agreements, legal meaning, product safety, or compliance.
- The browser screenshots prove the explicitly labelled deterministic-adapter interface and recovery behavior; they are not visual evidence of live GPT-5.6 proposal quality.
- Displayed cost is an estimate from reported tokens and the dated standard-tier price snapshot. The provider invoice remains authoritative, and cache-write premiums are not separately identifiable from the response usage fields.
