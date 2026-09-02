@feat:editor-trip-access
Feature: Editor Trip Management Access
  Background:
    Given I am signed in

  Scenario: An editor keeps itinerary access without trip management controls
    Given I am an editor on "Editor Access Trip" owned by "Ada Lovelace"
    When I go to the shared trip
    Then I see a "Budget" tab
    And I do not see the trip Share control
    When I open the shared trip edit sheet
    Then I do not see the trip Delete control
    And I do not see the People section

  Scenario: A manager sees trip management controls
    Given I am a manager on "Manager Access Trip" owned by "Grace Hopper"
    When I go to the shared trip
    Then I see the trip Share control
    When I open the shared trip edit sheet
    Then I see the trip Delete control
    And I see the People section
