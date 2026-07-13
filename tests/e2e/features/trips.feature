@feat:trips
Feature: Trip Management
  Background:
    Given I am signed in

  Scenario: User edits a trip's name
    Given I have an existing trip
    When I open the trip edit sheet
    And I change the trip name to "Renamed Trip"
    And I save
    Then the trip should display "Renamed Trip"

  Scenario: Keyboard user can open the trip edit sheet and dismiss it
    Given I have an existing trip
    When I tab to the edit button and press Enter
    Then the edit sheet should open with focus inside
    When I press Escape
    Then the sheet should close and focus should return to the edit button

  Scenario: Canceling trip date edits resets the sheet draft on reopen
    Given I have an existing trip
    When I open the trip edit sheet
    And I shift the trip date range one day later
    And I close the trip edit sheet without saving
    And I open the trip edit sheet
    Then the trip edit sheet shows the original dates

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

  Scenario: Dateless trip appears in Unscheduled section
    Given I am signed in
    When I open the New Trip dialog
    And I type "Unscheduled Test Trip" in the title field
    And I click the Create button
    Then I am on the trip detail page for "Unscheduled Test Trip"
    When I navigate to the trips list
    Then I see an "Unscheduled" section with "Unscheduled Test Trip"

  Scenario: New trip inherits preferred currency for its budget
    Given I am signed in with preferred currency "EUR"
    When I open the New Trip dialog
    And I type "Euro Budget Trip" in the title field
    And I type "100" in the budget field
    And I click the Create button
    Then I am on the trip detail page for "Euro Budget Trip"
    When I open the Budget tab
    Then the Budget tab shows "€0.00" as Actual spent
    And the Budget tab shows "€100.00" as Budget

  Scenario: Changing the trip's transit mode via the Getting Around section
    Given I have an existing trip
    When I open the trip edit sheet
    And I select "Walk" as the transit mode
    And I save
    And I open the trip edit sheet
    Then the trip edit sheet shows "Walk" as the selected transit mode
