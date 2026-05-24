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

  @seed-untimed-event
  Scenario: User sets a time on an event
    Given a day has an event without a time
    When I open the time picker and set a start time
    Then the event should display the time

  @reseed-day-delete
  Scenario: User deletes an event
    When I delete the event named "Event to Remove"
    Then the day should not contain "Event to Remove"

  @seed-reorder-events
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

  @itinerary-empty
  Scenario: Empty state shows Add event, Add note, and Add checklist buttons when a trip has no scheduled days
    Given I navigate to the trip with no itinerary
    Then the itinerary empty state shows buttons for adding events, notes, and checklists

  @day-append
  Scenario: User appends a day to a single-day scheduled trip
    When I add a day to the itinerary
    Then the appended day and advanced end date are persisted

  @day-remove-empty
  Scenario: User removes an empty final day
    When I remove the final empty day
    Then only the preceding day remains scheduled

  @day-remove-only
  Scenario: User cancels and then confirms removal of the only day
    When I request removal of the only day and cancel
    Then no day or date changes are persisted
    When I confirm removal of the only day
    Then the trip is persisted and displayed as unscheduled

  @day-remove-populated
  Scenario: User explicitly confirms removing a populated final day
    When I request removal of the populated final day
    Then planned content deletion is disclosed
    When I confirm destructive day removal
    Then the populated final day and its content are deleted
