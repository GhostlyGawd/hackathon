@FIX-01 @DET-02 @FR-033 @PRD-18
Feature: Controlled ambiguous traffic
  Unsupported transforms and unknown destinations must remain an uncertainty
  case rather than being seeded as an exact conflict or a clean observation.

  Scenario: Ambiguous mode sends an opaque reference to an unknown destination
    Given the controlled classroom fixture runs in "AMBIGUOUS" mode
    When the fictional student submits the seeded response
    Then an unknown destination receives only the unsupported opaque reference
    And the deterministic matcher records the unsupported transform without a positive match
    And the hidden fixture manifest independently expects "NEEDS_REVIEW"
    And I capture the "fixture-ambiguous-narrow" narrow fixture evidence
