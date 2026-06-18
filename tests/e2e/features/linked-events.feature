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
