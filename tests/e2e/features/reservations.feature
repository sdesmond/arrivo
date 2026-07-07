@feat:reservations
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
    And I set the "Check-in" date to trip day 1
    And I set the "Check-in" time to "09:00"
    And I set the "Check-out" date to trip day 1
    And I set the "Check-out" time to "11:00"
    And I click "Save" on the reservation drawer
    Then the reservation "Sunset Hotel" appears in the "Lodging" section

  Scenario: Add a Flight reservation with selected location suggestions
    When I click "Add Reservation"
    And I select the "Flight" reservation type
    Then the "Add Flight Reservation" drawer is open
    When I fill in the reservation provider with "Acme Air"
    And I set the "Departure" date to trip day 1
    And I set the "Departure" time to "09:00"
    And I choose the first lookup suggestion for the "Departure" reservation address
    And I choose the first lookup suggestion for the "Arrival" reservation address
    And I click "Save" on the reservation drawer
    Then the reservation "Acme Air" appears in the "Flight" section
    And the reservation "Acme Air" shows the "Departure" address "Paris, France"
    And the reservation "Acme Air" shows the "Arrival" address "Paris, France"
    When I reload the page
    And the "Flight" reservation section is expanded
    Then the reservation "Acme Air" shows the "Departure" address "Paris, France"
    And the reservation "Acme Air" shows the "Arrival" address "Paris, France"
    And the reservation "Acme Air" location fields are persisted

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

  Scenario: Attach a document to a reservation
    Given the trip has a Lodging reservation
    And the "Lodging" reservation section is expanded
    When I attach a file to the reservation "Original Hotel Name"
    Then the document "test-doc.pdf" appears on the reservation "Original Hotel Name"

  Scenario: Delete a reservation with an attached document
    Given the trip has a Lodging reservation with an attached document
    And the "Lodging" reservation section is expanded
    When I delete the reservation "Original Hotel Name"
    And I confirm the deletion
    Then the reservation "Original Hotel Name" is no longer shown

  Scenario: Pick an existing trip document for a reservation
    Given the trip has a Lodging reservation and a trip-level document "E2E Trip Pick Doc"
    And the "Lodging" reservation section is expanded
    When I click "Attach"
    And I select "E2E Trip Pick Doc" from the pick list
    Then the document "E2E Trip Pick Doc" appears on the reservation "Original Hotel Name"

  Scenario: Rename a reservation document
    Given the trip has a Lodging reservation with an attached document
    And the "Lodging" reservation section is expanded
    When I rename the reservation doc "test-doc.pdf" to "Renamed Confirmation.pdf"
    Then the reservation doc "Renamed Confirmation.pdf" is visible

  Scenario: Promote a reservation document to trip level
    Given the trip has a Lodging reservation with an attached document
    And the "Lodging" reservation section is expanded
    When I promote the reservation doc "test-doc.pdf" to trip level
    Then the reservation doc "test-doc.pdf" is no longer visible on the reservation
    And the Documents tab shows "test-doc.pdf"

  @dateless-trip
  Scenario: Dateless trip shows a prompt to set trip dates instead of the reservations empty state
    Then I see the "Set trip dates to add reservations" empty state
    And no reservation type sections are shown
    When I view the Itinerary tab
    And I tap the itinerary reservations CTA
    Then I see the "Set trip dates to add reservations" empty state
    When I click Set trip dates
    Then the trip edit sheet is open
    And I change the trip date range to the default future trip dates
    And I save the trip date change
    Then I see the "No reservations yet" empty state
    And the Add Reservation button is visible
