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

  @DET-03 @FR-040 @FR-046
  Scenario: A confirmed prohibited flow is shown as a bounded recorded conflict
    Given the fictional workspace access fixture is reset
    And I start a signed session as the "Privacy officer"
    When I open the bounded finding matrix
    And I select the "WITNESSED_CONFLICT" finding
    Then the selected finding says "Recorded conflict in this named test"
    And its deterministic basis names the matched observation and prohibited destination version
    And its model explanation is labeled "Model explanation — not evidence"

  @DET-04 @FR-042 @FR-043 @FR-044 @PROP-08
  Scenario: A reviewer can read and independently verify the exact evidence behind a conflict
    Given the fictional workspace access fixture is reset
    And I start a signed session as the "Reviewer"
    When I open the bounded finding matrix
    And I select the "WITNESSED_CONFLICT" finding
    Then the receipt directly names what was recorded, the fictional field, action, and destination
    And the receipt names the human-confirmed agreement rule and exact named test limits
    And the receipt says no approval state was changed and names the next human decision
    When I download and independently verify the receipt bundle
    Then every included receipt artifact and hash verifies
    And I capture the DET-04 "receipt-detail" evidence
