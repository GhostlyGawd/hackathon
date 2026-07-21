@AUT-02 @FR-002 @FR-006
Feature: District software status keeps its original source
  A privacy officer needs to see who or what set a software approval status
  without mistaking a district record for a conclusion made by Pactwire.

  Background:
    Given the fictional workspace access fixture is reset

  Scenario: A privacy officer imports an existing district approval
    Given I start a signed session as the "Privacy officer"
    When I add the fictional Northstar software with an imported "APPROVED" status
    Then the inventory shows "Northstar Classroom (Fictional)"
    And the status source says "Imported from Fictional Cedar Ridge App Registry"
    And the inventory says the status is a district record, not a Pactwire conclusion
    And the latest run says "No named test has run"
    And I capture the "inventory-approved-desktop" inventory evidence

  Scenario: A test operator can read inventory but cannot set an imported status
    Given I start a signed session as the "Privacy officer"
    When I add the fictional Northstar software with an imported "APPROVED" status
    And I switch the signed session to the "Test operator"
    Then the inventory shows "Northstar Classroom (Fictional)"
    When I try to add the fictional Beacon software
    Then software creation is denied and marked as audited
    And the inventory does not show "Beacon Assessment (Fictional)"

  Scenario: Approval-state filtering preserves the source label
    Given I start a signed session as the "Privacy officer"
    When I add the fictional Northstar software with an imported "APPROVED" status
    And I add the fictional Beacon software with a human "REJECTED" status
    And I filter the inventory to "APPROVED"
    Then the inventory shows "Northstar Classroom (Fictional)"
    And the inventory does not show "Beacon Assessment (Fictional)"
    And the status source says "Imported from Fictional Cedar Ridge App Registry"
    And I capture the "inventory-filtered-narrow" narrow inventory evidence

  @UX-01 @FR-002 @FR-003 @FR-006
  Scenario: A privacy officer can leave and resume an authorized software setup
    Given I start a signed session as the "Privacy officer"
    When I add the fictional Northstar software with an imported "APPROVED" status
    And I continue setup for "Northstar Classroom (Fictional)"
    Then all six setup steps are visible
    And setup step "Authorization and allowed scope" needs action
    And setup step "Agreement upload" explains that authorization is required first
    And I capture the UX-01 blocked setup and six-step evidence
    When I define a current authorization for the fictional Northstar software
    And I refresh the setup status
    Then setup step "Authorization and allowed scope" is complete
    And setup step "Agreement upload" needs action
    And I capture the UX-01 authorization recovery evidence
    When I reload the Pactwire page
    Then setup for "Northstar Classroom (Fictional)" is resumed from the URL
    And setup step "Authorization and allowed scope" is complete
    And the setup status identifies the original district source

  @UX-01 @UX-01-RUN-READY @FR-002 @FR-003 @FR-010 @FR-012 @FR-020 @FR-022
  Scenario: A new privacy officer reaches an honestly run-ready configuration
    Given I start a signed session as the "Privacy officer"
    And the fictional Northstar software exists
    And I define a current authorization for the fictional Northstar software
    When I upload the fictional two-page text agreement with effective dates
    And I request structured requirement proposals
    And I confirm the requirement with rationale "I checked this bounded rule against the exact cited text."
    And I save an obviously fictional teacher persona
    And I save an obviously fictional student persona
    And I refresh the named journey prerequisites
    And I choose the "Teacher" named journey
    And I save the named journey
    And I continue setup for "Northstar Classroom (Fictional)"
    Then all six setup steps are visible
    And every setup step is complete
    And the setup is run-ready for a named fictional-data test
    And the inventory next safe action is "Queue a named fictional-data test"
    And I capture the UX-01 run-ready setup and inventory evidence
    When I reload the Pactwire page
    Then setup for "Northstar Classroom (Fictional)" is resumed from the URL
    And the setup is run-ready for a named fictional-data test

  @UX-01 @UX-01-A11Y @FR-002 @FR-003 @FR-006
  Scenario: The setup workflow works by keyboard and exposes accessible state names
    Given I start a signed session as the "Privacy officer"
    When I add the fictional Northstar software with an imported "APPROVED" status
    And I continue setup for "Northstar Classroom (Fictional)"
    Then all six setup steps are visible
    When I select setup step "Agreement upload" using only the keyboard
    Then setup step "Agreement upload" is the current step
    And the setup has no automatically detectable WCAG A or AA violations

  @UX-01 @UX-01-RECOVERY @FR-002
  Scenario: Empty inventory and a temporary setup error explain how to recover
    Given I start a signed session as the "Privacy officer"
    Then the inventory explains how to add the first software record
    When I add the fictional Northstar software with an imported "APPROVED" status
    And the setup service becomes temporarily unavailable
    And I continue setup for "Northstar Classroom (Fictional)"
    Then the setup explains that its saved status is unavailable
    And I capture the UX-01 setup error evidence
    When the setup service recovers and I retry
    Then all six setup steps are visible
    And setup step "Authorization and allowed scope" needs action
