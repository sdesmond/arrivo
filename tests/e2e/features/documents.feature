Feature: Document Upload

  Background:
    Given I am signed in
    And I have an existing trip
    And I am on the Documents tab

  Scenario: Upload a PDF to the Documents tab
    When I upload a file named "boarding-pass.pdf" with MIME type "application/pdf"
    Then the document "boarding-pass.pdf" appears in the Documents list
