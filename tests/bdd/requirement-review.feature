Feature: A person decides which agreement proposals become test rules
  A district privacy officer needs the exact source beside each model draft so
  only a named human can create an executable, versioned requirement.

  Background:
    Given the fictional workspace access fixture is reset
    And I start a signed session as the "Privacy officer"
    And I add the fictional Northstar software with an imported "APPROVED" status
    When I upload the fictional two-page text agreement with effective dates
    And I request structured requirement proposals

  @AGR-03 @UX-02 @FR-012 @FR-013
  Scenario: The privacy officer edits and confirms a source-bound test rule
    Then requirement decisions are blocked until I inspect the cited source page
    And I capture the "requirement-source-required-desktop" UX-02 requirement-review evidence
    When I edit the proposed action to "Transmit"
    And I open the cited agreement page using only the keyboard
    Then the cited agreement page has keyboard focus and identifies the reviewed draft
    And I capture the "citation-page-keyboard-focus-desktop" UX-02 citation-navigation evidence
    When I return to the reviewed draft using only the keyboard
    Then the reviewed draft has keyboard focus
    And I confirm the requirement with rationale "I checked this bounded rule against the exact cited text."
    Then requirement version 2 is executable and human-confirmed
    And the exact source quote remains beside the confirmed rule
    And the review explains model proposals, human-confirmed rules, and observed browser facts
    And version history preserves the non-executable proposal as version 1
    And I capture the "requirement-confirmed-desktop" UX-02 requirement-review evidence
    And I capture the "requirement-version-history-desktop" UX-02 requirement-history evidence

  @AGR-03 @UX-02 @FR-012 @FR-014
  Scenario: An unclear proposal remains visibly ambiguous and non-executable
    When I inspect the proposal's exact cited source
    And I mark the requirement ambiguous with rationale "A person must clarify which recipients are authorized."
    Then the current requirement is ambiguous and cannot run a test
    And I capture the "requirement-ambiguous-narrow" narrow UX-02 requirement-review evidence

  @AGR-03 @UX-02 @FR-012 @FR-013
  Scenario: A rejected proposal remains in immutable history
    When I inspect the proposal's exact cited source
    And I reject the requirement with rationale "The draft does not describe the cited text accurately."
    Then the current requirement is rejected and cannot run a test
    And version history preserves the rejected decision and original proposal
    And I capture the "requirement-rejected-desktop" UX-02 requirement-review evidence

  @UX-02 @FR-013
  Scenario: A read-only reviewer can inspect the source but cannot record a requirement decision
    When I switch the signed session to the "Reviewer"
    Then requirement decision controls explain that requirement-review authority is missing

  @UX-02 @FR-012 @FR-013 @FR-014
  Scenario: Agreement review has no automatically detectable accessibility violations
    When I inspect the proposal's exact cited source
    Then agreement review has no automatically detectable WCAG A or AA violations

  @UX-02 @UX-02-KEYBOARD @FR-012 @FR-014
  Scenario: Every requirement decision remains reachable by keyboard
    When I inspect the proposal's exact cited source
    And I complete the requirement rationale for keyboard review
    Then I can reach and capture each requirement decision control using only the keyboard
