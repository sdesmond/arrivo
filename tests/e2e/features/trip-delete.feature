@feat:trip-delete
Feature: Trip deletion
  Background:
    Given I am signed in

  Scenario: Delete a trip from the listing page
    Given I have a trip available to delete from the listing page
    When I open the trip options menu for "E2E Delete Trip"
    And I choose "Delete trip" from the trip options menu
    And I confirm the trip deletion
    Then the trip "E2E Delete Trip" is no longer visible in the trip list

  Scenario: Delete a trip from its detail page
    Given I have a trip available to delete from the listing page
    When I open that trip and delete it from its detail page
    Then I return to the trips list after deletion
