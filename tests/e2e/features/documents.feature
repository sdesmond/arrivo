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
    When I upload a file named "delete-me.pdf" with MIME type "application/pdf"
    Then the document "delete-me.pdf" appears in the Documents list
    When I delete the document "delete-me.pdf"
    Then the document "delete-me.pdf" is no longer visible

  Scenario: Upload a PDF to the Documents tab
    When I upload a file named "boarding-pass.pdf" with MIME type "application/pdf"
    Then the document "boarding-pass.pdf" appears in the Documents list

  Scenario: Rename a document from the Documents tab
    When I upload a file named "rename-me.pdf" with MIME type "application/pdf"
    Then the document "rename-me.pdf" appears in the Documents list
    When I rename the document "rename-me.pdf" to "My Boarding Pass"
    Then the document "My Boarding Pass" appears in the Documents list
    And the document "rename-me.pdf" is no longer visible

  Scenario: View a document in the in-app viewer
    When I upload a file named "view-test.pdf" with MIME type "application/pdf"
    Then the document "view-test.pdf" appears in the Documents list
    When I click the View button for "view-test.pdf"
    Then the document viewer is open with title "view-test.pdf"
    When I close the document viewer
    Then the document viewer is closed

  Scenario: Pressing Escape closes the viewer and returns focus to the View button
    When I upload a file named "esc-test.pdf" with MIME type "application/pdf"
    Then the document "esc-test.pdf" appears in the Documents list
    When I click the View button for "esc-test.pdf"
    Then the document viewer is open with title "esc-test.pdf"
    When I press Escape
    Then the document viewer is closed
    And the View button for "esc-test.pdf" has focus

  Scenario: Share button is accessible in the document viewer
    When I upload a file named "share-doc.pdf" with MIME type "application/pdf"
    Then the document "share-doc.pdf" appears in the Documents list
    When I click the View button for "share-doc.pdf"
    Then the document viewer is open with title "share-doc.pdf"
    And the share button for "share-doc.pdf" is visible in the viewer

  Scenario: Clicking the share button does not close the viewer
    When I upload a file named "share-click.pdf" with MIME type "application/pdf"
    Then the document "share-click.pdf" appears in the Documents list
    When I click the View button for "share-click.pdf"
    Then the document viewer is open with title "share-click.pdf"
    When I click the share button for "share-click.pdf"
    Then the document viewer is open with title "share-click.pdf"
