@FIX-01 @PRD-18
Feature: Controlled visibility loss
  A required capture gap must be independently seedable and visibly distinct
  from a run that observed no conflicting traffic.

  Scenario: Invisible mode marks the required submission request unavailable
    Given the controlled classroom fixture runs in "INVISIBLE" mode
    Then the student workspace warns that required capture is unavailable
    When the fictional student submits the seeded response
    Then the fixture event ledger marks the required request not visible
    And the hidden fixture manifest independently expects "NOT_VISIBLE"
    And I capture the "fixture-invisible-narrow" narrow fixture evidence

  @RUN-02 @FR-031 @FR-035 @PROP-05
  Scenario: A known required recorder gap cannot become a clean result
    Given the RUN-02 recorder runs the controlled fixture in "INVISIBLE" mode
    When the controlled harness cuts the required recorder stream before submission
    Then the required recorder checkpoint is "NOT_VISIBLE"
    And the recorder preserves the capture gap independently of page content
    And no clean recorder state is available
    And I capture the RUN-02 "visibility-loss" evidence

  @DET-03 @FR-040 @PROP-05
  Scenario: Missing visibility remains distinct from a clean named run
    Given the fictional workspace access fixture is reset
    And I start a signed session as the "Privacy officer"
    When I open the bounded finding matrix
    And I select the "NOT_VISIBLE" finding
    Then the selected finding says "Required evidence was not visible"
    And the selected finding names the path without visible evidence
    And the untested state separately says "Required path was not tested"
