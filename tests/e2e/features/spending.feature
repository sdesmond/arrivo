@feat:spending
Feature: Spending View
  Background:
    Given I am signed in

  Scenario: Switching to Spending view from Trips view
    Given I have past trips in my travel history
    When I navigate to the travel history page
    And I switch to the "Spending" view
    Then I see the spending headline figures

  Scenario: Date filter changes recompute headline figures
    Given I have past trips in my travel history
    When I navigate to the travel history page
    And I switch to the "Spending" view
    Then I see "No trips in the selected range"
    When I change the spending date range to "Last Year"
    Then I do not see "No trips in the selected range"

  Scenario: Zero trips ever shows the empty prompt
    When I navigate to the travel history page
    And I switch to the "Spending" view
    Then I see the spending empty state

  Scenario: Accessible live region announces filter changes
    Given I have past trips in my travel history
    When I navigate to the travel history page
    And I switch to the "Spending" view
    And I change the spending date range to "Last Year"
    Then the spending live region announces "Showing Last Year — 0 trips"
