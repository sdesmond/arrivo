@feat:budget
Feature: Budget
  Background:
    Given I am signed in

  Scenario: User adds a Misc Expense from the Budget tab
    Given I have an existing trip
    When I open the Budget tab
    And I click the Add Misc Expense button
    And I choose "EUR" as the expense currency
    And I enter "42.50" as the expense amount
    And I choose "Food" as the expense category
    And I save the Misc Expense
    Then the Budget tab shows "€42.50" as Actual spent
    And the Budget tab shows a "Food" category tile
    When I reload the browser page
    And I open the Budget tab
    Then the Budget tab shows "€42.50" as Actual spent
    And the Budget tab shows a "Food" category tile

  Scenario: User edits a Misc Expense and the change persists
    Given I have an existing trip
    When I open the Budget tab
    And I click the Add Misc Expense button
    And I choose "EUR" as the expense currency
    And I enter "42.50" as the expense amount
    And I choose "Food" as the expense category
    And I save the Misc Expense
    And I open the Misc Expense in the "Food" category
    And I enter "60.00" as the expense amount
    And I save the edited Misc Expense
    Then the Budget tab shows "€60.00" as Actual spent
    When I reload the browser page
    And I open the Budget tab
    Then the Budget tab shows "€60.00" as Actual spent

  Scenario: User deletes a Misc Expense and it stays deleted
    Given I have an existing trip
    When I open the Budget tab
    And I click the Add Misc Expense button
    And I choose "EUR" as the expense currency
    And I enter "42.50" as the expense amount
    And I choose "Food" as the expense category
    And I save the Misc Expense
    And I open the Misc Expense in the "Food" category
    And I remove the Misc Expense
    And I reload the browser page
    And I open the Budget tab
    Then the Budget tab shows no "Food" category tile
