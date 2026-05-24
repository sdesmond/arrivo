Feature: New Trip Dialog

  Background:
    Given I am signed in

  Scenario: Open the New Trip dialog from the topbar button
    When I click the New trip button in the topbar
    Then the New Trip dialog is visible
    And the title field is focused

  Scenario: Cancel closes the dialog
    When I click the New trip button in the topbar
    And I click the Cancel button in the New Trip dialog
    Then the New Trip dialog is not visible

  Scenario: Escape closes the dialog
    When I click the New trip button in the topbar
    And I press Escape
    Then the New Trip dialog is not visible
