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
    And I set the Check-out date to today
    And I click "Save" on the reservation drawer
    Then the reservation "Sunset Hotel" appears in the "Lodging" section
