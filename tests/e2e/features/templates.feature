@templates
Feature: Packing templates
  Background:
    Given I am signed in

  Scenario: Navigate to the template library from the sidebar
    When I click the Packing Templates link in the sidebar
    Then I should be on the templates page
    And I should see the empty template state

  Scenario: Create a packing template and keep it after reload
    Given I have no packing templates
    When I open the templates page
    And I create a packing template named "Beach Weekend"
    Then I should see the packing template "Beach Weekend"
    When I reload the page
    Then I should see the packing template "Beach Weekend"

  Scenario: Rename a packing template and keep it after reload
    Given I have a packing template named "Beach Weekend"
    When I open the templates page
    And I rename the packing template "Beach Weekend" to "Carry-on Only"
    Then I should see the packing template "Carry-on Only"
    And I should not see the packing template "Beach Weekend"
    When I reload the page
    Then I should see the packing template "Carry-on Only"

  Scenario: Delete a packing template and keep it removed after reload
    Given I have a packing template named "Beach Weekend"
    When I open the templates page
    And I delete the packing template "Beach Weekend"
    Then I should not see the packing template "Beach Weekend"
    When I reload the page
    Then I should not see the packing template "Beach Weekend"

  Scenario: Whitespace-only names show validation and create nothing
    Given I have no packing templates
    When I open the templates page
    And I enter only spaces as the template name
    Then I should see a template validation error
    And the create template button should be disabled

  Scenario: Multiple templates are listed by name
    Given I have packing templates:
      | name           |
      | Business Trip  |
      | Winter Ski     |
    When I open the templates page
    Then I should see the packing template "Business Trip"
    And I should see the packing template "Winter Ski"
