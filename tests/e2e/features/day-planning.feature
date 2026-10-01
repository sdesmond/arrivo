@feat:day-planning
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

  @trip-with-untimed-event
  Scenario: User sets a time on an event
    Given a day has an event without a time
    When I open the time picker and set a start time
    Then the event should display the time

  Scenario: User selects an event location suggestion
    Given a day has an event named "Lunch at the market"
    When I set the event location for "Lunch at the market" using the first lookup suggestion
    And I reload the page
    Then the event "Lunch at the market" should show location "Paris, France"
    And the event "Lunch at the market" location is persisted with coordinates

  @trip-with-deletable-event
  Scenario: User deletes an event
    When I delete the event named "Event to Remove"
    Then the day should not contain "Event to Remove"

  @trip-with-reorder-events
  Scenario: User reorders events by dragging
    Given a day has events "Drag First" and "Drag Second" in order
    When I drag "Drag Second" above "Drag First"
    Then the order should be "Drag Second" then "Drag First"

  Scenario: User adds, edits, and deletes a note
    Given I am on the trip detail page
    When I add a note "Pick up sunscreen at duty free"
    Then the note "Pick up sunscreen at duty free" should be visible on the timeline
    When I edit the note "Pick up sunscreen at duty free" to "Buy sunscreen before flight"
    Then the note "Buy sunscreen before flight" should be visible on the timeline
    When I delete the note "Buy sunscreen before flight"
    Then the note "Buy sunscreen before flight" should not be visible

  Scenario: User creates, checks off, collapses, and deletes a checklist
    Given I am on the trip detail page
    When I add a checklist with item "Pack sunscreen"
    Then the checklist should be visible on the timeline
    When I check all items in the checklist
    Then the checklist should show the completion badge
    When I collapse the checklist
    Then the checklist should be collapsed
    When I delete the checklist
    Then the checklist should not be visible on the timeline

  @day-append
  Scenario: User appends a day to a single-day scheduled trip
    When I add a day to the itinerary
    Then the appended day and advanced end date are persisted

  @day-remove-empty
  Scenario: User removes an empty final day
    When I remove the final empty day
    Then only the preceding day remains scheduled

  @dateless-trip
  Scenario: Remove control is absent when only one day remains
    Given I am on the trip detail page
    Then the remove day control is not visible

  @dateless-trip
  Scenario: User adds a second day to a dateless trip without requiring dates
    Given I am on the trip detail page
    When I add a day to a dateless itinerary
    Then Day 2 is appended without a date

  @dateless-trip-with-event
  Scenario: An event on a dateless trip asks for dates instead of a time
    Given I am on the trip detail page
    When I open the first day
    Then the untimed event asks for trip dates before a time

  @dateless-trip
  Scenario: Set trip dates CTA opens the trip edit sheet for a dateless trip
    Given I am on the trip detail page
    When I click Set trip dates
    Then the trip edit sheet is open

  @day-remove-populated
  Scenario: User explicitly confirms removing a populated final day
    When I request removal of the populated final day
    Then planned content deletion is disclosed
    When I confirm destructive day removal
    Then the populated final day and its content are deleted

  @date-edit-extend-end
  Scenario: User extends a trip date range from the edit sheet
    When I open the trip edit sheet
    And I change the trip date range to the default future trip dates
    And I save the trip date change
    Then the edited trip includes the appended scheduled days

  @date-edit-extend-start
  Scenario: User extends a trip date range earlier from the edit sheet
    When I open the trip edit sheet
    And I change the trip date range to the default future trip dates
    And I save the trip date change
    Then the edited trip includes the prepended scheduled days

  @date-edit-shorten-empty
  Scenario: User shortens empty removed days without confirmation
    When I open the trip edit sheet
    And I shorten the trip date range to the first future trip day
    And I save the trip date change
    Then the empty removed days are deleted without a warning

  @date-edit-keep-unscheduled
  Scenario: User shortens a populated date range and keeps displaced events unscheduled
    When I open the trip edit sheet
    And I shorten the trip date range to the first future trip day
    And I save the trip date change
    Then the trip edit warning explains the removed trip dates
    When I keep the displaced events as unscheduled
    Then the removed day's events are persisted as unscheduled

  @date-edit-delete-events
  Scenario: User shortens a populated date range and deletes displaced events
    When I open the trip edit sheet
    And I shorten the trip date range to the first future trip day
    And I save the trip date change
    Then the trip edit warning explains the removed trip dates
    When I delete the displaced events
    Then the removed day's events are deleted after the date change

  @action-bar-geometry
  Scenario: Action bar controls measure at least 44x44px on a mobile viewport
    Given the viewport is 375 by 812
    Then the "Measured action bar" row's Time, Cost, and Docs chips and Address segments each measure at least 44 by 44 pixels
    And the "Attach geometry row" row's Attach chip and empty Address button each measure at least 44 by 44 pixels
