@FIX-01 @PRD-18
Feature: Controlled repaired traffic
  The fixture needs a repaired version that retains the same fictional inputs
  while removing the seeded student-email disclosure.

  Scenario: Repaired mode sends analytics only an aggregate completion event
    Given the controlled classroom fixture runs in "REPAIRED" mode
    When the fictional student submits the seeded response
    Then fixture analytics receives an aggregate event without either student canary
    And the hidden fixture manifest independently expects "NOT_REOBSERVED_IN_NAMED_TESTS"
    And I capture the "fixture-repaired-desktop" fixture evidence

  @DET-03 @FR-040
  Scenario: A repaired rerun stays linked to its prior conflict without claiming approval
    Given the fictional workspace access fixture is reset
    And I start a signed session as the "Privacy officer"
    When I open the bounded finding matrix
    And I select the "NOT_REOBSERVED_IN_NAMED_TESTS" finding
    Then the selected finding says "Prior conflict not recorded in this rerun"
    And the selected finding names its prior finding
    And no bounded finding label says pass, safe, compliant, or approved
