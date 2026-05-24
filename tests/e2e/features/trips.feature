Feature: Trip Management
  Background:
    Given I am signed in

  Scenario: User edits a trip's name
    Given I have an existing trip
    When I open the trip edit sheet
    And I change the trip name to "Renamed Trip"
    And I save
    Then the trip should display "Renamed Trip"

  Scenario: Keyboard user can open the trip edit sheet and dismiss it
    Given I have an existing trip
    When I tab to the edit button and press Enter
    Then the edit sheet should open with focus inside
    When I press Escape
    Then the sheet should close and focus should return to the edit button

  Scenario: Dateless trip appears in Unscheduled section
    Given I am signed in
    When I open the New Trip dialog
    And I type "Unscheduled Test Trip" in the title field
    And I click the Create button
    Then I am on the trip detail page for "Unscheduled Test Trip"
    When I navigate to the trips list
    Then I see an "Unscheduled" section with "Unscheduled Test Trip"
