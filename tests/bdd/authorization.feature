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
