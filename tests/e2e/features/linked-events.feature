@feat:linked-events
Feature: Linked Events

  Scenario: Lodging reservation shows Check-in and Check-out on the Itinerary
    Given I am signed in
    And the trip has a Lodging reservation with Check-in on Day 1 and Check-out on Day 2
    When I view the Itinerary tab
    Then I see a "Check-in" Linked Event on Day 1 with a Hotel icon and a "Linked" badge
    And I see a "Check-out" Linked Event on Day 2 with a Hotel icon and a "Linked" badge

  Scenario: Manual events stay draggable when a Linked Event sits above them
    Given I am signed in
    And the trip has a Lodging reservation with Check-in on Day 1 and draggable events "Morning Walk" and "Afternoon Walk" on Day 1
    When I drag "Afternoon Walk" above "Morning Walk"
    Then the order should be "Afternoon Walk" then "Morning Walk"
    And I see a "Check-in" Linked Event on Day 1 with a Hotel icon and a "Linked" badge

  Scenario: Flight reservation departing and arriving the same day shows as one Linked Event
    Given I am signed in
    And the trip has a Flight reservation with Delta departing and arriving on Day 1
    When I view the Itinerary tab
    Then I see a single "Delta" Linked Event on Day 1 with a Plane icon and a "Linked" badge
    And I do not see separate "Departure" or "Arrival" Linked Events on Day 1

  Scenario: Reservation before trip startDate creates a new Day 1
    Given I am signed in
    And I start from the default future three-day trip
    When I add a Lodging reservation from the day before the trip at "15:00" to trip day 1 at "11:00"
    And I view the Itinerary tab
    Then I see a new Day 1 with a "Check-in" Linked Event
    And the previous Day 1 is now Day 2

  Scenario: Reservation after trip endDate creates a new last Day
    Given I am signed in
    And I start from the default future three-day trip
    When I add a Lodging reservation from the day after the trip at "15:00" to two days after the trip at "11:00"
    And I view the Itinerary tab
    Then I see a new Day 4 with a "Check-in" Linked Event
    And I see a new Day 5 with a "Check-out" Linked Event

  Scenario: Now Card shows a Linked Event in the current-time window
    Given I am signed in
    And the trip has a Lodging reservation whose Check-in is "now"
    When I view the trip list
    Then the Now Card shows the "Check-in" Linked Event with the "Now" pill and "Linked" badge

  Scenario: Tapping the itinerary CTA opens Reservations with the type picker
    Given I am signed in
    And I start from the default future three-day trip
    When I view the Itinerary tab
    And I tap the itinerary reservations CTA
    Then I land on the Reservations tab with the reservation type picker open

  Scenario: Tapping a Linked Event opens Reservations with the row highlighted
    Given I am signed in
    And the trip has a Lodging reservation with Check-in on Day 1 and Check-out on Day 2
    When I view the Itinerary tab
    And I tap the "Check-in" Linked Event on Day 1
    Then I land on the Reservations tab with the "Lodging" section expanded and the "Torel Avantgarde" row highlighted

  Scenario: Shortening trip dates past a reservation warns and keeping retains the reservation
    Given I am signed in
    And the trip has a Lodging reservation with Check-in on Day 1 and Check-out on Day 2
    When I open the trip edit sheet
    And I shorten the trip date range to the first future trip day
    And I save the trip date change
    Then the trip edit warning lists the "Torel Avantgarde" reservation
    When I keep the displaced events as unscheduled
    Then the "Torel Avantgarde" reservation still exists

  Scenario: A kept reservation stays visible in the Reservations tab
    Given I am signed in
    And the trip has a Lodging reservation with Check-in on Day 1 and Check-out on Day 2
    When I open the trip edit sheet
    And I shorten the trip date range to the first future trip day
    And I save the trip date change
    And I keep the displaced events as unscheduled
    And I am on the Reservations tab
    Then I see the "Torel Avantgarde" reservation in the Reservations tab

  Scenario: Shortening trip dates past a reservation and removing deletes the reservation
    Given I am signed in
    And the trip has a Lodging reservation with Check-in on Day 1 and Check-out on Day 2
    When I open the trip edit sheet
    And I shorten the trip date range to the first future trip day
    And I save the trip date change
    Then the trip edit warning lists the "Torel Avantgarde" reservation
    When I remove the displaced events and reservations
    Then the "Torel Avantgarde" reservation no longer exists

  Scenario: Editing a reservation date past the trip end extends the trip dates
    Given I am signed in
    And the trip has a Lodging reservation with Check-in on Day 1 and Check-out on Day 2
    When I am on the Reservations tab
    And I move the reservation check-out to two days after the trip's last day
    Then the trip now ends two days after its original last day
