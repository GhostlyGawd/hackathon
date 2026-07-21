# Pactwire Classroom Fixture

This package is a controlled, fictional classroom product for testing Pactwire's mechanism. It does not model or accuse a real school, student, district, or software vendor.

Run `pnpm --filter @pactwire/fixture build`, then `pnpm --filter @pactwire/fixture start`. Set `PACTWIRE_FIXTURE_VERSION` to one of `BASELINE`, `REGRESSION`, `REPAIRED`, `AMBIGUOUS`, `INVISIBLE`, `INTERFACE_DRIFT`, `PROMPT_INJECTION`, `RISKY_ACTION`, or `FAILURE`.

The UI and collector destinations use reserved `*.pactwire.test` hosts so browser evidence records distinct fictional destinations. Launch the controlled Chromium profile with:

~~~text
--host-resolver-rules=MAP *.pactwire.test 127.0.0.1
~~~

The public runtime exports scenario inputs and actual seeded behavior. It never serves or exports the expected bounded result. The independent oracle lives under `ground-truth/`, is read only by the test/validation harness, and is unavailable through the application HTTP boundary.
