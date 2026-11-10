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

  @trip-with-untimed-event
  Scenario: Edited name, time and location persist after reload
    Given a day has an event without a time
    When I open the time picker and set a start time
    And I set the event location for "Untimed Event" using the first lookup suggestion
    And I rename the event "Untimed Event" to "Persisted dinner"
    And I reload the page
    Then the event "Persisted dinner" still shows a time and the location "Paris, France"

  @trip-with-deletable-event
  Scenario: User deletes an event
    When I delete the event named "Event to Remove"
    Then the day should not contain "Event to Remove"

  @trip-with-reorder-events
  Scenario: User reorders events by dragging
    Given a day has events "Drag First" and "Drag Second" in order
    When I drag "Drag Second" above "Drag First"
    Then the order should be "Drag Second" then "Drag First"

  @trip-with-three-reorder-events
  Scenario: Rapid successive drags in one day keep the last order after reload
    When I drag "Drag Third" above "Drag First" without waiting for the save
    And I drag "Drag Second" above "Drag Third" without waiting for the save
    Then 2 day order saves complete without failure
    And after reload the events are ordered "Drag Second", "Drag Third" then "Drag First"

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
    And exactly one checklist with item "Pack sunscreen" persists after reload
    When I check all items in the checklist
    Then the checklist should show the completion badge
    And checklist completion persists after reload
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

  Scenario: Rapid checklist toggles preserve intent through slow writes and refresh
    Given I am on the trip detail page
    When I add a checklist with item "Rapid toggle"
    And I add a second checklist item "Keep checklist open"
    Then rapid checklist toggles stay visible and persist in FIFO order

  Scenario: Checklist items write independently
    Given I am on the trip detail page
    When I add a checklist with item "Independent first"
    And I add a second checklist item "Independent second"
    Then another checklist item can save while the first write is blocked

  Scenario: Failed checklist write rolls back and next click recovers
    Given I am on the trip detail page
    When I add a checklist with item "Recover toggle"
    And I add a second checklist item "Keep checklist open"
    Then a failed checklist toggle rolls back and the next click persists

  Scenario: User renames, clears, and deletes a checklist and the changes persist
    Given I am on the trip detail page
    When I add a checklist with item "Rename me"
    And I rename the checklist to "Packing"
    Then the checklist title "Packing" persists after reload
    When I clear the checklist title "Packing"
    Then the checklist has no title after reload
    When I delete the checklist
    Then the checklist stays deleted after reload

  Scenario: A checklist created with its first item keeps its place among other timeline items
    Given I am on the trip detail page
    When I add a note "Mixed note"
    And I add a new event named "Mixed stop"
    And I add a checklist with item "Mixed checklist"
    Then one expanded checklist sits in the timeline and the order persists after reload

  Scenario: Failed checklist creation keeps the draft and a retry creates one checklist
    Given I am on the trip detail page
    When checklist creation fails once for the draft "Retry checklist"
    Then retrying the draft creates exactly one checklist that persists after reload

  Scenario: A renamed checklist title shows before the save completes
    Given I am on the trip detail page
    When I add a checklist with item "Fast title"
    Then the checklist shows the title "Instant" while its save is still in flight

  Scenario: User adds, edits, checks, unchecks and deletes checklist items and the changes persist
    Given I am on the trip detail page
    When I add a checklist with item "Passport"
    And I add a second checklist item "Charger"
    And I add a second checklist item "Adapter"
    Then the checklist items read "Passport, Charger, Adapter" in order after reload
    When I edit the checklist item "Charger" to "Charger cable"
    Then the checklist items read "Passport, Charger cable, Adapter" in order after reload
    When I check the checklist item "Passport"
    Then the checklist item "Passport" is checked after reload
    When I uncheck the checklist item "Passport"
    Then the checklist item "Passport" is unchecked after reload
    When I delete the checklist item "Charger cable"
    Then the checklist items read "Passport, Adapter" in order after reload

  Scenario: Overlapping checklist item edit, check and delete settle in intent order through slow writes
    Given I am on the trip detail page
    When I add a checklist with item "Alpha"
    And I add a second checklist item "Bravo"
    And I add a second checklist item "Charlie"
    Then overlapping checklist item writes settle in intent order despite slow requests

  Scenario: A failed checklist item edit or delete rolls back and the retry persists
    Given I am on the trip detail page
    When I add a checklist with item "Recover item"
    And I add a second checklist item "Keep item"
    Then a failed checklist item edit and delete roll back and their retries persist
