@AUT-04 @FR-005 @FR-032
Feature: Saved credentials stay outside pages, model context, and normal evidence
  A district test operator needs Pactwire to inject a fictional credential only
  inside one authorized browser harness and to redact every normal output.

  Background:
    Given the fictional workspace access fixture is reset
    And I start a signed session as the "Privacy officer"
    And the fictional Northstar software exists

  Scenario: Untrusted page content cannot request a saved credential
    When I store a generated fictional browser credential
    And an untrusted page asks Pactwire to reveal the saved credential
    Then raw secret access is blocked and marked as audited
    And the page response contains no configured secret representation
    And I capture the "secret-access-denied-narrow" narrow secret evidence

  Scenario: Normal evidence and exports redact configured credential variants
    When I store a generated fictional browser credential
    And I preview normal evidence containing encoded credential variants
    Then every configured credential representation is redacted
    And the workspace export contains secret metadata but no secret value
    And I capture the "secret-redaction-desktop" secret evidence

  Scenario: Switching users clears metadata before the new permission check
    When I store a generated fictional browser credential
    And I switch the signed session to the "Reviewer"
    Then saved credential metadata is no longer visible
