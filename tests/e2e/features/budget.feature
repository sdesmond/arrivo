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
