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
