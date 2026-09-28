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

  Scenario: A viewer does not see Edit trip from the trips list
    Given I am a viewer on "Nairobi Safari" owned by "Marie Curie"
    When I navigate to the trips list
    And I open trip options for "Nairobi Safari"
    Then I do not see "Edit trip"

  Scenario: An editor still sees Edit trip from the trips list
    Given I am an editor on "Cairo Expedition" owned by "Alan Turing"
    When I navigate to the trips list
    And I open trip options for "Cairo Expedition"
    Then I see "Edit trip"

  Scenario: A viewer sees the itinerary read-only
    Given I am a viewer on "Hakone Retreat" owned by "Ada Lovelace" with a planned day
    When I go to the shared trip
    And I open the first itinerary day
    Then I see the event "Tea ceremony" with its time and location but no cost
    And clicking the time of "Tea ceremony" opens no dialog
    And I see no itinerary edit controls

  Scenario: An editor still sees the itinerary edit controls
    Given I am an editor on "Osaka Food Tour" owned by "Bo Nilsen" with a planned day
    When I go to the shared trip
    And I open the first itinerary day
    Then I see the itinerary edit controls
