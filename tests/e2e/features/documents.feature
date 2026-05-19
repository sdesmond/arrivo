Feature: Document Upload

  Background:
    Given I am signed in
    And I have an existing trip
    And I am on the Documents tab

  Scenario: Delete a document from the Documents tab
    Given the Documents tab has one seeded document
    When I delete the document "E2E Boarding Pass"
    Then the document "E2E Boarding Pass" is no longer visible
    And the empty state message is shown

  Scenario: Upload a PDF to the Documents tab
    When I upload a file named "boarding-pass.pdf" with MIME type "application/pdf"
    Then the document "boarding-pass.pdf" appears in the Documents list
