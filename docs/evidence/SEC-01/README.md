# SEC-01 dependency-advisory prerequisite

This record covers one narrow prerequisite for the larger SEC-01 threat suite.
It does not mark SEC-01 complete.

## Red and green result

`pnpm audit --prod --json` failed against the inherited production graph with
two high-severity advisories:

- `fast-uri` 3.1.3 was inside the vulnerable range for
  `GHSA-v2hh-gcrm-f6hx`; and
- optional `sharp` 0.34.5 was inside the vulnerable range for
  `GHSA-f88m-g3jw-g9cj`.

The workspace now resolves affected `fast-uri` versions to 3.1.4 and affected
`sharp` versions to 0.35.3. The permanent security regression rejects the old
ranges in both the workspace policy and frozen lockfile.

The following checks passed at implementation commit
`a964f92d1ebc41665d7822d8accef8a05e89531d`:

~~~text
pnpm install --frozen-lockfile
pnpm test:security
pnpm audit --prod
pnpm build
~~~

The focused security suite passed 2 files and 3 tests. The production audit
reported no known vulnerabilities, and the optimized Next.js production build
completed with the patched graph.

The complete deterministic repository gate also passed in 461.2 seconds:

~~~text
Unit:        34 files, 166 tests
Property:    23 files, 62 tests
Integration: 38 files, 149 tests
Security:     2 files, 3 tests
Browser BDD: 61 scenarios, 694 steps
Failures: 0
Skips: 0
Retries: 0
~~~

## Evidence applicability

Property testing is not applicable to this finite version-range regression.
Exact example assertions and the package-manager audit are the stronger proof.
The boundary properties required by SEC-01 still apply to the later threat
suite.

BDD and visual evidence are not applicable to this prerequisite because it
changes no user-visible workflow, browser behavior, finding, receipt, or
recovery state.

## Clean-checkout CI

The patched graph and complete deterministic gate passed from a frozen install
on both required operating systems:

- [Ubuntu verification](https://github.com/GhostlyGawd/hackathon/actions/runs/29875318319/job/88784474215)
- [Windows verification](https://github.com/GhostlyGawd/hackathon/actions/runs/29875318319/job/88784474533)

## Claim boundary

A clean package-manager audit means only that the configured registry reported
no known production dependency advisories at that time. It does not prove the
system secure, safe, compliant, approved, or effective. The remaining SEC-01
adversarial cases and residual-risk matrix are still required before SEC-01 can
be completed.
