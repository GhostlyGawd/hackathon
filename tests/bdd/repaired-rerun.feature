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
