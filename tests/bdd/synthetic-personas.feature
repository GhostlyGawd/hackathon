@JRN-01 @FR-020 @FR-021
Feature: Fictional personas and run-specific canaries
  A district test operator must configure obviously fictional users without
  putting real student data into Pactwire, then trace each selected field with
  a value that belongs to one prepared run only.

  Background:
    Given the fictional workspace access fixture is reset
    And I start a signed session as the "Test operator"

  Scenario: Likely real student data is blocked before it can be saved
    When I enter a routable student email and numeric district identifier
    And I confirm the persona is fictional and try to save it
    Then Pactwire blocks the likely real data without echoing it
    And no fictional persona is saved
    And I capture the "likely-real-data-blocked-narrow" narrow synthetic-data evidence

  Scenario: Fictional teacher and student fields receive traceable run canaries
    When I save an obviously fictional teacher persona
    And I save an obviously fictional student persona
    And I select their email and activity fields for "Prepared run A"
    And I generate canaries for the prepared run
    Then every selected field maps to one persona and one non-reused value
    And every generated email address uses a reserved non-deliverable domain
    And I capture the "fictional-personas-canaries-desktop" synthetic-data evidence

  Scenario: A different run cannot observe or reuse prior canaries
    When I save an obviously fictional student persona
    And I select its email and activity fields for "Prepared run A"
    And I generate canaries for the prepared run
    And I switch to "Prepared run B" and generate the same selected fields
    Then the two prepared runs have disjoint canary values
    And an unrelated prepared run has no canaries
