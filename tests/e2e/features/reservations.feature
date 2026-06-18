Feature: Reservations

  Background:
    Given I am signed in
    And I have an existing trip
    And I am on the Reservations tab

  Scenario: Add a Lodging reservation
    When I click "Add Reservation"
    And I select the "Lodging" reservation type
    Then the "Add Lodging Reservation" drawer is open
    When I fill in the reservation provider with "Sunset Hotel"
    And I set the "Check-in" date to today
    And I set the "Check-in" time to "09:00"
    And I set the "Check-out" date to today
    And I set the "Check-out" time to "11:00"
    And I click "Save" on the reservation drawer
    Then the reservation "Sunset Hotel" appears in the "Lodging" section

  Scenario: Empty Reservations tab shows the no-reservations empty state
    Then I see the "No reservations yet" empty state
    And no reservation type sections are shown

  Scenario: Reservation sections render across multiple types in soonest-first order
    Given the trip has reservations across multiple types
    Then the "Lodging" reservation section appears before the "Flight" reservation section

  Scenario: Edit a reservation's provider and check-in time inline
    Given the trip has a Lodging reservation
    And the "Lodging" reservation section is expanded
    When I edit the reservation provider to "Updated Hotel Name"
    And I edit the "Check-in" anchor time to "10:00"
    And I reload the page
    And the "Lodging" reservation section is expanded
    Then the reservation provider shows "Updated Hotel Name"
    And the "Check-in" anchor shows a time of "10:00"

  Scenario: Delete a reservation removes it, its section, and shows the empty state
    Given the trip has a Lodging reservation
    And the "Lodging" reservation section is expanded
    When I delete the reservation "Original Hotel Name"
    And I confirm the deletion
    Then the reservation "Original Hotel Name" is no longer shown
    And no reservation type sections are shown
    And I see the "No reservations yet" empty state
