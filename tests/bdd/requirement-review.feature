Feature: A person decides which agreement proposals become test rules
  A district privacy officer needs the exact source beside each model draft so
  only a named human can create an executable, versioned requirement.

  Background:
    Given the fictional workspace access fixture is reset
    And I start a signed session as the "Privacy officer"
    And I add the fictional Northstar software with an imported "APPROVED" status
    When I upload the fictional two-page text agreement with effective dates
    And I request structured requirement proposals

  @AGR-03 @FR-012 @FR-013
  Scenario: The privacy officer edits and confirms a source-bound test rule
    When I edit the proposed action to "Transmit"
    And I confirm the requirement with rationale "I checked this bounded rule against the exact cited text."
    Then requirement version 2 is executable and human-confirmed
    And the exact source quote remains beside the confirmed rule
    And version history preserves the non-executable proposal as version 1
    And I capture the "requirement-confirmed-desktop" requirement-review evidence
    And I capture the "requirement-version-history-desktop" requirement-history evidence

  @AGR-03 @FR-012 @FR-014
  Scenario: An unclear proposal remains visibly ambiguous and non-executable
    When I mark the requirement ambiguous with rationale "A person must clarify which recipients are authorized."
    Then the current requirement is ambiguous and cannot run a test
    And I capture the "requirement-ambiguous-narrow" narrow requirement-review evidence

  @AGR-03 @FR-012 @FR-013
  Scenario: A rejected proposal remains in immutable history
    When I reject the requirement with rationale "The draft does not describe the cited text accurately."
    Then the current requirement is rejected and cannot run a test
    And version history preserves the rejected decision and original proposal
    And I capture the "requirement-rejected-desktop" requirement-review evidence
