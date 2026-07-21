@FIX-01 @PRD-18
Feature: Controlled baseline and interface-drift fixture
  A Pactwire evaluator needs a fictional classroom product whose stable facts
  stay fixed while one declared fixture behavior changes at a time.

  Scenario: The baseline teacher and student journeys produce only allowed first-party traffic
    Given the controlled classroom fixture runs in "BASELINE" mode
    When the fictional teacher publishes the seeded assignment
    Then the teacher sees the assignment ready checkpoint
    And I capture the "fixture-teacher-desktop" fixture evidence
    And I capture the "fixture-teacher-narrow" narrow fixture evidence
    When the fictional student submits the seeded response
    Then only the classroom service receives the exact student canaries
    And the hidden fixture manifest independently expects "NO_CONFLICT_OBSERVED_IN_NAMED_TESTS"
    And the public fixture exposes no expected result or ground truth
    And I capture the "fixture-baseline-desktop" fixture evidence

  Scenario: Interface drift moves the student checkpoint without changing the seeded traffic
    Given the controlled classroom fixture runs in "INTERFACE_DRIFT" mode
    When I open the old controlled student route
    Then the fixture shows that the old checkpoint moved
    When I open the declared replacement student route
    And the fictional student submits the seeded response
    Then only the classroom service receives the exact student canaries
    And the hidden fixture manifest independently expects "REPLAY_REPAIR_REQUIRED"
    And I capture the "fixture-interface-drift-desktop" fixture evidence
