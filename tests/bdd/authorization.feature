@AUT-03 @FR-003 @FR-004
Feature: Test authorization blocks work outside the district's stated scope
  A district privacy officer needs the runner to stop before an expired,
  unlisted, or prohibited operation and to record a direct reason.

  Background:
    Given the fictional workspace access fixture is reset
    And I start a signed session as the "Privacy officer"
    And the fictional Northstar software exists

  Scenario: A privacy officer records current test authority and scope
    When I define a current authorization for the fictional Northstar software
    Then the authorization is shown as "ACTIVE"
    And the authorization names the human attestation and authority basis
    And the authorization shows its base URL, review date, expiry, allowed actions, and prohibited actions
    And I capture the "authorization-active-desktop" authorization evidence

  Scenario: Expired authorization cannot pass the run queue gate
    When I define an expired authorization for the fictional Northstar software
    And I check whether the authorized run can queue
    Then the run queue is blocked because "Authorization expired. Create a new authorization before queuing a run."
    And the blocked run queue attempt is recorded

  Scenario: Redirects, popups, and actions stay inside deterministic policy
    When I define a current authorization for the fictional Northstar software
    And the runner attempts a redirect to "https://tracker.outside.invalid/collect?student=fictional"
    Then the redirect is blocked before the browser leaves Pactwire
    And the reason says "Redirect blocked because its destination is outside this authorization."
    When the runner attempts a popup to "https://cedar.northstar.invalid/classroom/help"
    Then the reason says "Popups are blocked by this authorization."
    When the runner attempts the prohibited "DELETE" action
    Then the reason says "DELETE is prohibited by this authorization."
    And all three blocked attempts are recorded with bounded reasons
    And I capture the "authorization-blocked-narrow" narrow authorization evidence

  @RUN-01 @FR-030 @PROP-20
  Scenario: Sequential authorized runs receive separate local browser resources
    Given the RUN-01 controlled fixture and isolated browser manager
    When isolated run "first" seeds fictional local browser state and finalizes artifacts
    And isolated run "second" starts against the same authorized origin
    Then isolated run "second" sees no state from "first"
    And every resource from isolated run "first" is destroyed
    And I capture the RUN-01 "sequential-isolation" trace

  @RUN-03 @FR-023 @FR-026
  Scenario: GPT computer actions complete only the reviewed fictional journey
    Given the RUN-03 computer-use harness uses the "BASELINE" fixture
    When the deterministic model adapter submits the reviewed fictional response
    Then the RUN-03 result is "COMPLETED" because "DETERMINISTIC_COMPLETION_OBSERVED"
    And the exact fictional submission is witnessed by the independent recorder
    And every model action has a bounded recorder summary
    And I capture the RUN-03 "authorized-journey-completed" evidence

  @RUN-03 @FR-023 @FR-026
  Scenario: Messaging a real person stops before the model clicks
    Given the RUN-03 computer-use harness uses the "RISKY_ACTION" fixture
    When the deterministic model adapter selects the real-person messaging control
    Then the RUN-03 result is "HUMAN_REQUIRED" because "HUMAN_REVIEW_REQUIRED"
    And no fictional submission or risky action reaches the fixture
    And the messaging control remains visibly ready and unclicked
    And I capture the RUN-03 "human-handoff-blocked" evidence
