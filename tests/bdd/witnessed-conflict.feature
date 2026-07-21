@FIX-01 @PRD-18
Feature: Controlled regression traffic
  The independent fixture harness needs one exact, instrumentable recipient
  regression without teaching the application evaluator the expected finding.

  Scenario: Regression mode sends the exact synthetic student email to fixture analytics
    Given the controlled classroom fixture runs in "REGRESSION" mode
    When the fictional student submits the seeded response
    Then fixture analytics receives the exact synthetic student email
    And the hidden fixture manifest independently expects "WITNESSED_CONFLICT"
    And the public fixture exposes no expected result or ground truth
    And I capture the "fixture-regression-desktop" fixture evidence
