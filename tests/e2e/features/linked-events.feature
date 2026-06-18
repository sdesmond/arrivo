Feature: Linked Events

  Scenario: Lodging reservation shows Check-in and Check-out on the Itinerary
    Given I am signed in
    And the trip has a Lodging reservation with Check-in on Day 1 and Check-out on Day 2
    When I view the Itinerary tab
    Then I see a "Check-in" Linked Event on Day 1 with a Hotel icon and a "Linked" badge
    And I see a "Check-out" Linked Event on Day 2 with a Hotel icon and a "Linked" badge
