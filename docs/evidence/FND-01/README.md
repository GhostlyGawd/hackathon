# FND-01 verification evidence

| Field | Value |
| --- | --- |
| Task | FND-01 — Bootstrap the TypeScript workspace and deterministic CI |
| PRD sections | 8, 13, 21, and 22 |
| Status | IN PROGRESS — local acceptance green; clean-checkout CI pending |
| Verified source commit | Pending first implementation commit |
| Local verification date | 2026-07-19 |
| Environment | Windows, Node.js 24.14.1, pnpm 11.6.0 |
| Sanitization | Reviewed; no credentials, tokens, personal paths, or third-party data included |

## Red

The workspace contract was run before the implementation existed:

~~~text
node scripts/check-workspace.mjs
Exit code: 1

Workspace contract failed:
- root package and canonical scripts were absent
- all six declared workspace package manifests and TypeScript configs were absent
- lockfile and shared TypeScript, ESLint, Vitest, and Playwright configs were absent
- the GitHub Actions workflow was absent
~~~

This was the expected failure for FND-01: the repository contained planning and research documents but no runnable workspace.

## Green

Dependency installation completed successfully. Only the explicitly reviewed `esbuild` and `sharp` dependency build scripts are permitted by `pnpm-workspace.yaml`.

~~~text
pnpm install --reporter append-only
Exit code: 0
Scope: all 7 workspace projects
esbuild postinstall: Done
sharp install: Done
~~~

The complete deterministic repository gate then passed:

~~~text
pnpm verify
Exit code: 0
Duration: 44.8 seconds

Workspace contract passed for 6 packages and 12 canonical scripts.
Toolchain contract passed:
  Node 24.14.1
  pnpm 11.6.0
  Playwright 1.61.1
  Chromium 149.0.7827.55, revision 1228

Lint: passed with zero warnings
Typecheck: 6 workspace packages passed
Production build: 6 workspace packages passed
Unit: 1 file, 2 tests passed
Integration: 1 file, 3 tests passed
Failures: 0
Retries: 0
Skipped tests: 0
~~~

The integration suite proves that the shared testkit can:

- create and query a migrated PostgreSQL-compatible table;
- write and read exact bytes from an isolated filesystem object store; and
- reject an object key that attempts to escape the isolated store.

The unit smoke suite proves that the core and evidence packages can be imported and that their immutable claim boundaries do not treat model output as observed evidence.

Property tests and BDD scenarios are not applicable to FND-01 under its task contract. Their canonical commands still execute successfully with no matching test files so later task packages can add required coverage without changing the CI interface. The same is true for the later browser, security, and accessibility suites.

## Clean-checkout CI

The pull-request workflow installs from the committed lockfile and runs `pnpm verify` on both `ubuntu-latest` and `windows-latest`. Links and final results will be added here before this task changes to `COMPLETE`.

## Visual evidence

Visual UI proof is not applicable. FND-01 introduces infrastructure and a machine-readable `/health` route, not a user-facing screen or browser-operated journey. The required proof for this task is the sanitized terminal result above and the pending clean-checkout CI matrix.

## Known limitations

- The user-facing Pactwire workflow is not implemented by this task.
- The embedded PostgreSQL-compatible service validates migrations and SQL behavior without Docker; deployment PostgreSQL compatibility remains a later integration obligation.
- Live OpenAI, target-user, and product-effectiveness claims are outside this foundation task and are not represented as verified.
