@FIX-01 @PRD-18
Feature: Controlled failure and risky-action stops
  The product needs reproducible negative modes that dispatch no traffic and
  explain whether retry or a person is required.

  Scenario: Failure mode returns a visible outage and dispatches no request
    Given the controlled classroom fixture runs in "FAILURE" mode
    When the fictional student submits the seeded response
    Then the fixture shows a submission outage with no observed request
    And the hidden fixture manifest independently expects "FAILED"
    And I capture the "fixture-failure-desktop" fixture evidence

  Scenario: Risky-action mode stops before messaging a real person
    Given the controlled classroom fixture runs in "RISKY_ACTION" mode
    When the fictional student asks to message a real guardian
    Then the fixture stops for a person and dispatches no request
    And the hidden fixture manifest independently expects "HUMAN_REQUIRED"
    And I capture the "fixture-risky-action-desktop" fixture evidence
