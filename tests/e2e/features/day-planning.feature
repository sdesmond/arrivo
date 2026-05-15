Feature: Day Planning
  Background:
    Given I am signed in
    And I have an existing trip with days

  Scenario: User adds an event to a day
    Given I am on the trip detail page
    When I add a new event named "Lunch at the market"
    Then the day should contain "Lunch at the market"

  Scenario: User edits an event's name
    Given a day has an event named "Old Event Name"
    When I edit the event name to "New Event Name"
    Then the day should show "New Event Name"

  Scenario: User sets a time on an event
    Given a day has an event without a time
    When I open the time picker and set a start time
    Then the event should display the time

  Scenario: User deletes an event
    Given a day has an event named "Event to Remove"
    When I delete that event
    Then the day should not contain "Event to Remove"

  Scenario: User reorders events by dragging
    Given a day has events "First" and "Second" in order
    When I drag "Second" above "First"
    Then the order should be "Second" then "First"

  Scenario: User adds, edits, and deletes a note
    Given I am on the trip detail page
    When I add a note "Pick up sunscreen at duty free"
    Then the note "Pick up sunscreen at duty free" should be visible on the timeline
    When I edit the note "Pick up sunscreen at duty free" to "Buy sunscreen before flight"
    Then the note "Buy sunscreen before flight" should be visible on the timeline
    When I delete the note "Buy sunscreen before flight"
    Then the note "Buy sunscreen before flight" should not be visible
