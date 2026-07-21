@JRN-03 @FR-024 @FR-027 @PRD-3 @PRD-19.2
Feature: Human-authored deterministic replay baseline
  A Pactwire evaluator needs a non-model arm that uses the same controlled
  fixture, run-specific fictional values, independent recorder, and visibility
  scorer as the GPT arm, and that cannot call a moved or missing checkpoint
  successful.

  Scenario: The human-authored baseline completes every required checkpoint without a model call
    Given the controlled classroom fixture runs in "BASELINE" mode
    And a human-authored deterministic replay is frozen for the named student journey
    When the non-model baseline replays the frozen student journey
    Then the deterministic replay outcome is "COMPLETED"
    And replay checkpoint "submission-request" is "VERIFIED"
    And the replay trace records zero model calls and no raw fictional values
    And the shared recorder scores the required network checkpoint "VISIBLE"
    And only the classroom service receives the exact student canaries
    And the public fixture exposes no expected result or ground truth
    And I capture the "baseline" deterministic replay evidence

  Scenario: Interface drift cannot become a successful deterministic replay
    Given the controlled classroom fixture runs in "INTERFACE_DRIFT" mode
    And a human-authored deterministic replay is frozen for the named student journey
    When the non-model baseline replays the frozen student journey
    Then the deterministic replay outcome is "DRIFTED"
    And replay checkpoint "submission-request" is "NOT_REACHED"
    And the replay trace stops at "NAVIGATION_STATUS_MISMATCH"
    And the fixture records no replay submission request
    And the shared recorder scores the required network checkpoint "NOT_TESTED"
    And the fixture shows that the old checkpoint moved
    And I capture the "drift" deterministic replay evidence
