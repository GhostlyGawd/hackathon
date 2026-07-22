@UX-03 @PRD-12.5 @PRD-12.6 @PRD-12.7 @PRD-17
Feature: Review a bounded run and decide what happens next
  A reviewer needs one evidence-led path from an active controlled run through
  terminal coverage, a verifiable finding receipt, and a human-owned status decision.

  Background:
    Given the fictional workspace access fixture is reset

  @UX-03-LIVE @FR-037 @PROP-18 @PROP-19
  Scenario: An operator watches the recorder and stops the active run without losing evidence
    Given I start a signed session as the "Test operator"
    When I open the live run review
    Then the named journey, fictional role, allowed scope, and latest isolated frame are visible
    And the model action summary is separate from the deterministic recorder event
    And completed and pending checkpoints and the canary match are visible
    And the stop control is prominent and keyboard reachable
    When I stop the active controlled run
    Then the run becomes "CANCELED" with a terminal manifest
    And the manifest preserves the observed checkpoint and marks the unfinished checkpoint "NOT TESTED"
    And I capture the UX-03 "live-run-stopped" transition evidence

  @UX-03-RECEIPT @FR-040 @FR-042 @FR-043 @FR-044 @PROP-04 @PROP-21
  Scenario: A reviewer reaches a decision-ready conflict without relying on model prose
    Given I start a signed session as the "Reviewer"
    When I open the bounded finding matrix
    And I select the "WITNESSED_CONFLICT" finding
    Then I capture the UX-03 "finding-state-matrix" evidence
    Then the receipt answers the eight review questions in order
    And its tested scope, valid evidence, and next human action make the review ready
    And the reviewer can inspect and export evidence but cannot change approval
    And I capture the UX-03 "decision-ready-conflict" evidence

  @UX-03-HOLD @FR-050 @FR-051 @FR-052 @FR-054 @PROP-01 @PROP-03 @PROP-11
  Scenario: An authorized person records why the exact receipt remains on hold
    Given I start a signed session as the "Privacy officer"
    Then the approval authority shows "APPROVED"
    And I capture the UX-03 "approval-before-hold" evidence
    When I apply the stored witnessed conflict to approval
    Then the approval authority shows "HOLD"
    And I capture the UX-03 "approval-after-hold" evidence
    When I record a signed decision to keep the hold
    Then the approval authority still shows "HOLD"
    And the append-only history preserves the signed keep-hold reason
    And I capture the UX-03 "signed-keep-hold" evidence

  @UX-03-RECOVERY @FR-037 @FR-045 @PROP-09 @PROP-10 @PROP-22
  Scenario: Terminal recovery states remain explicit and retain exact retry lineage
    Given I start a signed session as the "Privacy officer"
    When I open the immutable run history
    Then the completed run has a manifest with every required checkpoint
    And the partial run preserves captured evidence and names missing coverage
    And the failed run names every checkpoint it could not complete
    And the crashed run shows an explicit worker lease integrity failure
    And its completed retry links to the source run with the same frozen configuration
    And I capture the UX-03 "recovery-state-matrix" evidence
