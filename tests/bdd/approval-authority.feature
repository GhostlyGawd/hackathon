@DET-05 @FR-050 @FR-051 @FR-052 @FR-053 @FR-054 @FR-055
Feature: Approval holds and human restoration
  An existing district approval must pause on exact deterministic evidence,
  remain paused after repair, and return only through a signed human decision.

  Background:
    Given the fictional workspace access fixture is reset

  @PROP-02 @PROP-03
  Scenario: A witnessed conflict places one receipt-linked hold
    Given I start a signed session as the "Reviewer"
    Then the approval authority shows "APPROVED"
    When I apply the stored witnessed conflict to approval
    Then the approval authority shows "HOLD"
    And one witnessed-conflict receipt contributes to the hold
    And I capture the "approved-to-hold" DET-05 evidence

  @PROP-01 @PROP-03
  Scenario: A repaired rerun cannot restore approval automatically
    Given I start a signed session as the "Reviewer"
    And I apply the stored witnessed conflict to approval
    When I apply the stored repaired rerun to approval
    Then the approval authority still shows "HOLD"
    And the panel says automation cannot restore approval
    And I capture the "hold-after-repair" DET-05 evidence

  @PROP-03
  Scenario: Repeated visibility loss on a frozen retry places a hold
    Given I start a signed session as the "Reviewer"
    When I apply the stored frozen visibility retry to approval
    Then the approval authority shows "HOLD"
    And one required-visibility-loss receipt contributes to the hold
    And I capture the "visibility-loss-hold" DET-05 evidence

  @PROP-11
  Scenario: Only an authorized human can restore approval after reviewing a named rerun
    Given I start a signed session as the "Reviewer"
    And I apply the stored witnessed conflict to approval
    Then approval restoration is read-only
    When I switch the signed session to the "Privacy officer"
    And I restore approval with a signed named-scope reason
    Then the approval authority shows "APPROVED"
    And the append-only history names the human restoration
    And I capture the "human-restored-approval" DET-05 evidence
