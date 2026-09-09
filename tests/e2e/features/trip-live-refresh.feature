@feat:trip-live-refresh
Feature: Trip page live refresh
  Scenario: An itinerary edit in a second tab appears in the first tab without a reload
    Given I have an existing trip with days
    And a day has an event named "Live Refresh Event"
    When I open the trip in a second tab
    And in the second tab I edit the event name to "Live Refresh Event Updated"
    Then the trip page shows "Live Refresh Event Updated" without reloading
    When in the second tab I edit the event name to "Live Refresh Event Final"
    Then the trip page shows "Live Refresh Event Final" without reloading

  Scenario: A contributor demoted to viewer loses the Budget tab on their open trip page
    Given I am signed in
    And I have a trip with an editor contributor viewing it in their own session
    When I demote the contributor to viewer and save
    Then the contributor's open trip page no longer shows a "Budget" tab

  Scenario: A contributor viewing the trip is redirected when it is deleted elsewhere
    Given I am signed in
    And I have a trip with an editor contributor viewing it in their own session
    When I delete the trip
    Then the contributor's open trip page redirects to the trips list with a deletion notice
