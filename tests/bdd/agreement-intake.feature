Feature: Agreement source versions preserve the exact uploaded document
  A district privacy officer needs to verify every future citation against the
  exact agreement bytes that were originally reviewed.

  Background:
    Given the fictional workspace access fixture is reset
    And I start a signed session as the "Privacy officer"
    And I add the fictional Northstar software with an imported "APPROVED" status

  @AGR-01 @FR-010
  Scenario: A two-page text agreement becomes a verifiable immutable version
    When I upload the fictional two-page text agreement with effective dates
    Then agreement version 1 shows its file name, byte count, hash, uploader, and effective dates
    And the source viewer reproduces both fictional pages with verified page hashes
    And downloading the original agreement reproduces the displayed source hash
    And I capture the "agreement-source-desktop" agreement evidence

  @AGR-01 @FR-010
  Scenario: Duplicate bytes are reused and changed bytes create a new version
    When I upload the fictional two-page text agreement with effective dates
    And I upload the exact same agreement again
    Then Pactwire reports that the existing immutable version was reused
    When I upload a one-byte-changed agreement
    Then agreement version 2 has a different source hash
    And agreement version 1 still has its original source hash and pages

  @AGR-01 @FR-010
  Scenario: A malformed PDF is rejected before any version or object is stored
    When I try to upload a malformed fictional PDF
    Then the agreement upload is blocked as an invalid PDF
    And no agreement version is stored
    And I capture the "agreement-invalid-pdf-narrow" narrow agreement evidence

  @AGR-02 @FR-011
  Scenario: A structured proposal is tied to exact source text and stays non-executable
    When I upload the fictional two-page text agreement with effective dates
    And I request structured requirement proposals
    Then a proposal shows the exact purpose quote on page 1
    And the proposal includes every observable restriction and suggested test
    And the proposal is clearly non-executable until a person reviews it
    And the proposal run identifies its adapter and cost record
    And I capture the "requirement-proposal-desktop" proposal evidence

  @AGR-02 @FR-011
  Scenario: A model refusal creates a visible error and no proposal
    When I upload the fictional model-refusal agreement
    And I request structured requirement proposals
    Then the model refusal is shown as a non-executable intake error
    And no requirement proposal is stored
    And manual agreement review remains available
    And I capture the "requirement-proposal-refusal-narrow" narrow proposal evidence
