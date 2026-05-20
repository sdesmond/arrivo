Feature: Document Upload

  Background:
    Given I am signed in
    And I have an existing trip
    And I am on the Documents tab

  Scenario: Search filters the Documents list
    Given the Documents tab has one seeded document
    When I type "xyz" in the search field
    Then the document "E2E Boarding Pass" is not visible in the list
    When I clear the search field
    Then the document "E2E Boarding Pass" is visible in the list

  Scenario: Delete a document from the Documents tab
    Given the Documents tab has one seeded document
    When I delete the document "E2E Boarding Pass"
    Then the document "E2E Boarding Pass" is no longer visible
    And the empty state message is shown

  Scenario: Upload a PDF to the Documents tab
    When I upload a file named "boarding-pass.pdf" with MIME type "application/pdf"
    Then the document "boarding-pass.pdf" appears in the Documents list

  Scenario: Rename a document from the Documents tab
    Given the document "boarding-pass.pdf" is in the Documents tab
    When I rename the document "boarding-pass.pdf" to "My Boarding Pass"
    Then the document "My Boarding Pass" appears in the Documents list
    And the document "boarding-pass.pdf" is no longer visible
