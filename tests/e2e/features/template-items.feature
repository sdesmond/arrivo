@template-items
Feature: Template item and label management
  Background:
    Given I am signed in as the template editor user

  Scenario: Navigate to a template editor from the library
    Given the template editor "Editor Template" exists
    When I open the templates page
    And I click the template editor "Editor Template"
    Then I should be on the template editor for "Editor Template"

  Scenario: Add a plain-text item and keep it after reload
    Given the template editor "Editor Template" has no items
    When I open the template editor for "Editor Template"
    And I add the template item "Sunscreen"
    Then the template editor should contain "Sunscreen"
    When I reload the page
    Then the template editor should contain "Sunscreen"

  Scenario: Edit a template item and keep it after reload
    Given the template editor "Editor Template" has an item "Sunscreen"
    When I open the template editor for "Editor Template"
    And I edit the template item "Sunscreen" to "SPF 50 Sunscreen"
    Then the template editor should contain "SPF 50 Sunscreen"
    When I reload the page
    Then the template editor should contain "SPF 50 Sunscreen"

  Scenario: Remove a template item and keep it removed after reload
    Given the template editor "Editor Template" has an item "Sunscreen"
    When I open the template editor for "Editor Template"
    And I remove the template item "Sunscreen"
    Then the template editor should not contain "Sunscreen"
    When I reload the page
    Then the template editor should not contain "Sunscreen"

  Scenario: Add a section label
    Given the template editor "Editor Template" has no items
    When I open the template editor for "Editor Template"
    And I add the template label "Beach Gear"
    Then the template editor should contain a label "Beach Gear"

  Scenario: Rename a template label and keep it after reload
    Given the template editor "Editor Template" has a label "Beach Gear"
    When I open the template editor for "Editor Template"
    And I rename the template label "Beach Gear" to "Beach Essentials"
    Then the template editor should contain a label "Beach Essentials"
    When I reload the page
    Then the template editor should contain a label "Beach Essentials"

  Scenario: Delete a template label and keep its items after reload
    Given the template editor "Editor Template" has a label "Beach Gear" with item "Towel"
    When I open the template editor for "Editor Template"
    And I delete the template label "Beach Gear"
    Then the template editor should not contain a label "Beach Gear"
    And the template editor should contain "Towel"
    When I reload the page
    Then the template editor should contain "Towel"

  Scenario: Reorder template items and keep the order after reload
    Given the template editor "Editor Template" has items "Sunscreen" and "Sunglasses"
    When I open the template editor for "Editor Template"
    And I drag the template item "Sunglasses" onto the template item "Sunscreen"
    Then the template editor order should be "Sunglasses" then "Sunscreen"
    When I reload the page
    Then the template editor order should be "Sunglasses" then "Sunscreen"
