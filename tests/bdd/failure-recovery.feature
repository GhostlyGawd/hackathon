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

  @RUN-05 @FR-037 @PROP-19 @PROP-22
  Scenario: Terminal run history distinguishes captured and missing coverage
    Given the fictional workspace access fixture is reset
    And I start a signed session as the "Privacy officer"
    When I open the immutable run history
    Then the completed run has a manifest with every required checkpoint
    And the partial run preserves captured evidence and names missing coverage
    And the failed run names every checkpoint it could not complete
    And I capture the "terminal-run-history" RUN-05 evidence

  @RUN-05 @FR-037 @PROP-18 @PROP-19
  Scenario: A worker failure and completed retry keep exact configuration lineage
    Given the fictional workspace access fixture is reset
    And I start a signed session as the "Privacy officer"
    When I open the immutable run history
    Then the crashed run shows an explicit worker lease integrity failure
    And its completed retry links to the source run with the same frozen configuration
    And I capture the "retry-lineage" RUN-05 evidence

  @DET-04 @FR-044 @FR-045 @PROP-09 @PROP-10
  Scenario: A changed exported artifact invalidates verification without changing the stored receipt
    Given the fictional workspace access fixture is reset
    And I start a signed session as the "Reviewer"
    When I export the witnessed-conflict evidence receipt
    And I change one byte in an exported receipt artifact
    Then independent receipt verification reports "INVALID"
    And the verifier names "ARTIFACT_HASH_MISMATCH"
    And the original stored receipt still verifies as "VALID"
    And I record the DET-04 valid and corrupted verifier reports
