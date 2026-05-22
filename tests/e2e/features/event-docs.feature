Feature: Event Document Integration

  Background:
    Given I am signed in
    And I have an existing trip

  @reseed-pick-list
  Scenario: Pick list appears when attaching a doc to an event
    Given I am on the Itinerary tab
    And I expand Day 1
    When I click the Attach button on "E2E Event"
    Then the pick list panel shows "E2E Pick Doc"

  @reseed-pick-list
  Scenario: Upload new instead switches to file upload panel
    Given I am on the Itinerary tab
    And I expand Day 1
    When I click the Attach button on "E2E Event"
    Then the pick list panel shows "E2E Pick Doc"
    When I click "Upload new instead"
    Then the upload panel is shown with the Attach button

  @reseed-pick-list
  Scenario: Selecting a doc from pick list attaches it and closes the dialog
    Given I am on the Itinerary tab
    And I expand Day 1
    When I click the Attach button on "E2E Event"
    And I select "E2E Pick Doc" from the pick list
    Then the AddDocDialog is closed

  # Story 3.2: Delete event with attached documents

  # Event doc management: view, rename, promote

  @reseed-manage-event
  Scenario: View an event-attached document in the in-app viewer
    Given I am on the Itinerary tab
    And I expand Day 1
    When I expand the docs for event "E2E Event Manage"
    And I click the View button for "E2E Manage Doc"
    Then the document viewer is open with title "E2E Manage Doc"
    When I close the document viewer
    Then the document viewer is closed

  @reseed-manage-event
  Scenario: Rename an event-attached document
    Given I am on the Itinerary tab
    And I expand Day 1
    When I expand the docs for event "E2E Event Manage"
    And I rename the event doc "E2E Manage Doc" to "E2E Renamed Doc"
    Then the event doc "E2E Renamed Doc" is visible

  @reseed-manage-event
  Scenario: Promote an event-attached document to trip level
    Given I am on the Itinerary tab
    And I expand Day 1
    When I expand the docs for event "E2E Event Manage"
    And I promote the event doc "E2E Manage Doc" to trip level
    Then the event doc "E2E Manage Doc" is no longer visible in the event
    And the Documents tab shows "E2E Manage Doc"

  @reseed-delete-events
  Scenario: Delete event with attached docs shows confirmation dialog
    Given I am on the Itinerary tab
    And I expand Day 1
    When I delete the event "E2E Event Keep"
    Then the delete event dialog is shown
    When I click "Cancel"
    Then the delete event dialog is closed

  @reseed-delete-events
  Scenario: Keep documents promotes docs to trip-level
    Given I am on the Itinerary tab
    And I expand Day 1
    When I delete the event "E2E Event Keep"
    And I click "Keep documents"
    Then "E2E Event Keep" is no longer visible in the itinerary
    And the Documents tab shows "E2E Keep Doc"

  @reseed-delete-events
  Scenario: Delete everything removes event and its attached documents
    Given I am on the Itinerary tab
    And I expand Day 1
    When I delete the event "E2E Event Erase"
    And I click "Delete everything"
    Then "E2E Event Erase" is no longer visible in the itinerary
    And the Documents tab does not show "E2E Erase Doc"
