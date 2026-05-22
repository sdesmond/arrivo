Feature: Event Document Integration

  Background:
    Given I am signed in
    And I have an existing trip

  Scenario: Pick list appears when attaching a doc to an event
    Given I am on the Itinerary tab
    And I expand Day 1
    When I click the Attach button on "E2E Event"
    Then the pick list panel shows "E2E Boarding Pass"

  Scenario: Upload new instead switches to file upload panel
    Given I am on the Itinerary tab
    And I expand Day 1
    When I click the Attach button on "E2E Event"
    Then the pick list panel shows "E2E Boarding Pass"
    When I click "Upload new instead"
    Then the upload panel is shown with the Attach button

  Scenario: Selecting a doc from pick list attaches it and closes the dialog
    Given I am on the Itinerary tab
    And I expand Day 1
    When I click the Attach button on "E2E Event"
    And I select "E2E Boarding Pass" from the pick list
    Then the AddDocDialog is closed

  # Story 3.2: Delete event with attached documents

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
