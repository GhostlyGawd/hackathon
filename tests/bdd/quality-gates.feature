@QLT-01 @PRD-20 @PRD-21
Feature: Operate the critical review path accessibly
  A Pactwire reviewer needs the controlled setup, run, finding, receipt, and
  hold surfaces to remain understandable without relying on color or a mouse.

  Background:
    Given the fictional workspace access fixture is reset

  @QLT-01-A11Y @FR-037 @FR-040 @FR-050
  Scenario: Core review controls work from the keyboard and expose their state to assistive technology
    Given I start a signed session as the "Privacy officer"
    When I activate a bounded finding and reach the stop control using only the keyboard
    Then screen-reader text identifies every visible run, finding, and approval state
    And every visible product image has a contextual alternative
    And I capture the QLT-01 accessible review evidence
