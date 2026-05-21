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
