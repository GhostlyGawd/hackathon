@JRN-02 @UX-02 @FR-022
Feature: A person creates runnable named journeys from current prerequisites
  A district privacy officer needs each browser journey to show the exact
  confirmed rule, fictional field, authorization, and required checkpoint that
  make the journey runnable. Editing must append history rather than rewrite it.

  Background:
    Given the fictional workspace access fixture is reset
    And I start a signed session as the "Privacy officer"
    And the fictional Northstar software exists
    And I define a current authorization for the fictional Northstar software
    When I upload the fictional two-page text agreement with effective dates
    And I request structured requirement proposals
    And I inspect the proposal's exact cited source
    And I confirm the requirement with rationale "I checked this bounded rule against the exact cited text."
    And I save an obviously fictional teacher persona
    And I save an obviously fictional student persona
    And I refresh the named journey prerequisites

  Scenario: The officer creates a runnable teacher journey with a causal chain
    When I choose the "Teacher" named journey
    And I save the named journey
    Then the current named journey is runnable as version 1
    And its causal chain shows the confirmed rule, fictional field, and required checkpoint
    And the journey review explains model proposals, human-confirmed rules, and observed browser facts
    And I capture the "teacher-journey-editor-desktop" UX-02 journey-editor evidence

  Scenario: A student journey edit appends immutable version history
    When I choose the "Student" named journey
    And I save the named journey
    And I change the named journey goal to "Submit the fictional response and preserve required request visibility."
    And I save a new named journey version
    Then named journey history preserves versions 2 and 1
    And the editor says no successful run or repair has been recorded yet
    And deterministic replay and model-assisted repair have separate honest history states
    And I capture the "student-journey-editor-narrow" narrow UX-02 journey-editor evidence

  Scenario: Required visibility cannot be omitted from a runnable journey
    When I choose the "Student" named journey
    And I turn off required checkpoint visibility
    And I try to save the named journey
    Then the journey editor blocks saving until required visibility is restored
    And no named journey version is stored

  @UX-02-A11Y
  Scenario: Journey review has no automatically detectable accessibility violations
    When I choose the "Teacher" named journey
    Then journey review has no automatically detectable WCAG A or AA violations

  @UX-02-KEYBOARD
  Scenario: Required journey visibility remains reachable by keyboard
    When I choose the "Teacher" named journey
    And I focus the required journey checkpoint using only the keyboard
    Then I capture the "journey-checkpoint-keyboard-focus-desktop" UX-02 journey-editor evidence
