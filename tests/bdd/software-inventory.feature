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
