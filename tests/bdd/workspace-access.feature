@AUT-01 @FR-001
Feature: Workspace access is decided by server-stored roles
  A school district must be able to limit who can act inside its Pactwire
  workspace without exposing whether another district's workspace exists.

  Background:
    Given the fictional workspace access fixture is reset

  Scenario: A privacy officer assigns a reviewer role
    Given I start a signed session as the "Privacy officer"
    When I assign the "Reviewer" role to "fictional-new-reviewer"
    Then the role assignment is allowed
    And the active workspace audit shows "Role assigned"
    And I capture the "allowed-desktop" access evidence

  Scenario: A test operator cannot assign workspace roles
    Given I start a signed session as the "Test operator"
    When I assign the "Reviewer" role to "fictional-new-reviewer"
    Then the role assignment is denied and marked as audited
    And I capture the "denied-desktop" access evidence
    When I switch the signed session to the "Privacy officer"
    Then the active workspace audit shows "Access denied"
    And I capture the "denial-audit-desktop" access evidence

  Scenario: A workspace outside the active tenant is indistinguishable from unavailable
    Given I start a signed session as the "Privacy officer"
    When I check workspace ID "22222222-2222-4222-8222-222222222222"
    Then the response says only that the workspace is unavailable
    And no other workspace name or user is visible
    And the active workspace audit shows "Access denied"
    And I capture the "cross-workspace-desktop" access evidence
