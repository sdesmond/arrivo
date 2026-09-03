@feat:trip-sharing
Feature: Trip sharing dialog
  Background:
    Given I am signed in

  Scenario: A manager views active, pending, and declined sharing rows
    Given I have a trip with sharing rows
    When I go to the current trip
    And I open the sharing dialog
    Then I see the sharing dialog creator row
    And I see the active sharing row
    And I see the pending sharing row
    And I see the declined sharing row
    And I do not see the expired pending sharing row

  Scenario: An editor cannot open trip sharing
    Given I am an editor on "Editor Share Trip" owned by "Ada Lovelace"
    When I go to the shared trip
    Then I do not see the trip Share control

  Scenario: A viewer cannot open trip sharing
    Given I am a viewer on "Viewer Share Trip" owned by "Grace Hopper"
    When I go to the shared trip
    Then I do not see the trip Share control
