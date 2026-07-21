@FIX-01 @PRD-18
Feature: Controlled ambiguous traffic
  Unsupported transforms and unknown destinations must remain an uncertainty
  case rather than being seeded as an exact conflict or a clean observation.

  Scenario: Ambiguous mode sends an opaque reference to an unknown destination
    Given the controlled classroom fixture runs in "AMBIGUOUS" mode
    When the fictional student submits the seeded response
    Then an unknown destination receives only the unsupported opaque reference
    And the hidden fixture manifest independently expects "NEEDS_REVIEW"
    And I capture the "fixture-ambiguous-narrow" narrow fixture evidence

  @DET-01 @FR-034
  Scenario: An observed destination stays unknown without a human-confirmed entity mapping
    Given the fictional workspace access fixture is reset
    And I start a signed session as the "Privacy officer"
    And I add the fictional Northstar software with an imported "APPROVED" status
    When I record the observed destination "unknown-destination.pactwire.test"
    Then the destination remains "UNKNOWN" until a person reviews it
    And no company or agreement status is inferred for the destination
    And I capture the "unknown-destination-narrow" narrow destination-registry evidence
