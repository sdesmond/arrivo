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
    And I start from a three-day trip dated July 1, 2026 through July 3, 2026
    When I add a Lodging reservation from "2026-06-30" at "15:00" to "2026-07-01" at "11:00"
    And I view the Itinerary tab
    Then I see a new Day 1 with a "Check-in" Linked Event
    And the previous Day 1 is now Day 2

  Scenario: Reservation after trip endDate creates a new last Day
    Given I am signed in
    And I start from a three-day trip dated July 1, 2026 through July 3, 2026
    When I add a Lodging reservation from "2026-07-04" at "15:00" to "2026-07-05" at "11:00"
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
    And I start from a three-day trip dated July 1, 2026 through July 3, 2026
    When I view the Itinerary tab
    And I tap the itinerary reservations CTA
    Then I land on the Reservations tab with the reservation type picker open

  Scenario: Tapping a Linked Event opens Reservations with the row highlighted
    Given I am signed in
    And the trip has a Lodging reservation with Check-in on Day 1 and Check-out on Day 2
    When I view the Itinerary tab
    And I tap the "Check-in" Linked Event on Day 1
    Then I land on the Reservations tab with the "Lodging" section expanded and the "Torel Avantgarde" row highlighted
