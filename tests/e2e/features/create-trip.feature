@cleanup-created-trip
Feature: Create Trip

  Background:
    Given I am signed in

  Scenario: Create a trip with a date range navigates to trip page with Day 1 expanded
    When I open the New Trip dialog
    And I type "E2E Date Trip" in the title field
    And I select dates "2026-08-01" to "2026-08-03"
    And I click the Create button
    Then I am on the trip detail page for "E2E Date Trip"
    And Day 1 is expanded

  Scenario: Create a dateless trip navigates to trip page with empty itinerary
    When I open the New Trip dialog
    And I type "E2E Dateless Trip" in the title field
    And I click the Create button
    Then I am on the trip detail page for "E2E Dateless Trip"
    And the itinerary shows the empty state

  Scenario: Create button shows loading state while submitting
    When I open the New Trip dialog
    And I type "E2E Pending Trip" in the title field
    And I click the Create button
    Then the Create button is not clickable during submission
