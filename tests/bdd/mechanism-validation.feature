@VAL-01 @PRD-19.1
Feature: Blinded mechanism-correctness corpus
  The controlled evaluator must preserve bounded outcomes without seeing the sealed answer manifest.

  Background:
    Given the VAL-01 public corpus uses seed 20260722
    And the sealed VAL-01 answer manifest is withheld from the evaluated process

  Scenario Outline: Representative cases keep their bounded deterministic result
    When I inspect the VAL-01 "<case class>" result
    Then its bounded finding state is "<state>"
    And its evidence hash passes independent verification

    Examples:
      | case class                   | state                                  |
      | known prohibited exact flow | WITNESSED_CONFLICT                     |
      | unknown destination         | NEEDS_REVIEW                           |
      | unsupported transform       | NEEDS_REVIEW                           |
      | not visible path            | NOT_VISIBLE                            |
      | prompt injection            | NOT_TESTED                             |
      | clean rerun                 | NOT_REOBSERVED_IN_NAMED_TESTS          |

  Scenario: The complete corpus passes every Layer A gate
    When I inspect the complete VAL-01 score
    Then the score contains 120 cases and 48 instrumentable conflicts
    And precision and recall meet the declared thresholds with 95 percent intervals
    And no case creates approval, trusts an unknown destination, executes an out-of-scope action, mislabels uncertainty, or fails hash verification
