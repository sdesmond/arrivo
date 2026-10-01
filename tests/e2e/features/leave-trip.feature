@feat:leave-trip
Feature: Leave a shared trip
  Background:
    Given I am signed in

  Scenario: An editor leaves a shared trip
    Given I am an editor on "Leave Lisbon Escape" owned by "Bo Nilsen"
    When I go to the shared trip
    Then I see the Leave trip control
    And I do not see the trip Share control
    When I leave the trip and confirm
    Then I am back on the trips list
    And the trip "Leave Lisbon Escape" is no longer visible in the trip list
    And opening the shared trip directly is denied
    And the owner still has the trip with their membership intact

  Scenario: A viewer leaves a shared trip
    Given I am a viewer on "Leave Kyoto Adventure" owned by "Ada Lovelace"
    When I go to the shared trip
    Then I see the Leave trip control
    And I do not see the trip Share control
    When I leave the trip and confirm
    Then I am back on the trips list
    And the trip "Leave Kyoto Adventure" is no longer visible in the trip list
    And opening the shared trip directly is denied
    And the owner still has the trip with their membership intact

  Scenario: Cancelling the confirmation keeps the membership
    Given I am a viewer on "Leave Nairobi Safari" owned by "Marie Curie"
    When I go to the shared trip
    And I start leaving the trip
    And I cancel leaving the trip
    Then I see the trip heading "Leave Nairobi Safari"
    And I am still a member of the shared trip

  Scenario: A manager collaborator is not offered Leave trip
    Given I am a manager on "Leave Reykjavik Getaway" owned by "Grace Hopper"
    When I go to the shared trip
    Then I do not see the Leave trip control

  Scenario: The trip creator is not offered Leave trip
    Given I have an existing trip
    Then I do not see the Leave trip control
