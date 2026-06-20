Feature: Travel History
  Background:
    Given I am signed in

  Scenario: Past trips are listed most-recent first
    Given I have past trips in my travel history
    When I navigate to the travel history page
    Then "Berlin Wrap" appears before "Lisbon Escape" in the travel history list

  Scenario: Empty state shows when there are no past trips
    Given I have no past trips in my travel history
    When I navigate to the travel history page
    Then I see the travel history empty state

  Scenario: Switching between cards and list view keeps trips visible
    Given I have past trips in my travel history
    When I navigate to the travel history page
    And I switch the travel history view to "List"
    Then I see "Berlin Wrap" in the travel history list
    When I switch the travel history view to "Cards"
    Then I see "Berlin Wrap" in the travel history list

  Scenario: Editing a past trip from Travel History
    Given I have a past trip available in my travel history
    When I open the trip options menu for "Past Edit Trip"
    And I choose "Edit trip" from the trip options menu
    And I change the trip name to "Renamed Past Trip"
    And I save
    Then I see "Renamed Past Trip" in the travel history list

  Scenario: Deleting a past trip from Travel History
    Given I have a past trip available in my travel history
    When I open the trip options menu for "Past Edit Trip"
    And I choose "Delete trip" from the trip options menu
    And I confirm the trip deletion
    Then the trip "Past Edit Trip" is no longer visible in the trip list

  Scenario: Past trips no longer appear on the Trips page
    Given I have an existing trip
    And I have past trips in my travel history
    When I navigate to the trips list
    Then I do not see "Berlin Wrap" on the trips page
    And the trips page has no Past section
    And I see an "Upcoming" section with "E2E Test Trip"
