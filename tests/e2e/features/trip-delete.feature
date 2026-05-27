Feature: Trip deletion
  Background:
    Given I am signed in

  @delete-trip-fixture
  Scenario: Delete a trip from the listing page
    Given I have a trip available to delete from the listing page
    When I open the trip options menu for "E2E Delete Trip"
    And I choose "Delete trip" from the trip options menu
    And I confirm the trip deletion
    Then the trip "E2E Delete Trip" is no longer visible in the trip list
