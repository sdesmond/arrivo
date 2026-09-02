@feat:viewer-trip-access
Feature: Viewer Trip Access
  Background:
    Given I am signed in

  Scenario: A viewer sees a read-only trip with no Budget tab or cover editing
    Given I am a viewer on "Kyoto Adventure" owned by "Ada Lovelace"
    When I go to the shared trip
    Then I see the trip heading "Kyoto Adventure"
    And I do not see a "Budget" tab
    And I do not see the cover options control

  Scenario: An editor collaborator still sees the Budget tab
    Given I am an editor on "Lisbon Escape" owned by "Bo Nilsen"
    When I go to the shared trip
    Then I see a "Budget" tab

  Scenario: A manager collaborator still sees the Budget tab
    Given I am a manager on "Reykjavik Getaway" owned by "Grace Hopper"
    When I go to the shared trip
    Then I see a "Budget" tab
