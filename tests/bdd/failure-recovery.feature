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

  @RUN-01 @FR-030 @PROP-20
  Scenario: A crashed renderer releases its run before clean recovery
    Given the RUN-01 controlled fixture and isolated browser manager
    When isolated run "crashed" seeds fictional local browser state and its renderer crashes
    Then isolated run "crashed" is terminal "CRASHED" with every resource destroyed
    When isolated run "recovered" starts against the same authorized origin
    Then isolated run "recovered" sees no state from "crashed"
    And I capture the RUN-01 "crash-recovery" trace

  @RUN-04 @FR-025 @PROP-05
  Scenario: A bounded model repair stays draft until the original checkpoint is verified and a person promotes it
    Given a frozen student replay encounters the seeded interface drift
    When the RUN-04 model adapter follows the reviewed moved route and submit control
    Then the proposed repair changes only the moved path and selector
    And the model-proposed repair remains inactive
    When deterministic replay verifies the RUN-04 repair in a fresh isolated browser
    Then the original "submission-request" checkpoint is verified by the shared recorder
    When the fictional privacy officer promotes the verified RUN-04 repair
    Then replay version 2 appends to the human-owned source version
    And I capture the RUN-04 "bounded-repair" evidence

  @RUN-04 @FR-025 @PROP-05
  Scenario: An unrepairable path remains not tested and cannot be promoted
    Given a frozen student replay encounters the seeded unrepairable outage
    When the RUN-04 model adapter attempts the reviewed submit control
    Then the repair attempt is "UNRESOLVED" and the path is "NOT_TESTED"
    And no RUN-04 replay version can be promoted
    And I capture the RUN-04 "unresolved-repair" evidence
