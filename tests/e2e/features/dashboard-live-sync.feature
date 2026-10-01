@feat:dashboard-live-sync
Feature: Dashboard live sync
  Scenario: A contributor demoted to viewer loses dashboard edit access without a reload
    Given I am signed in
    And I have an editor contributor viewing the dashboard in their own session
    When I demote the dashboard contributor to viewer and save
    Then the contributor's dashboard no longer offers Edit trip without reloading

  Scenario: A contributor removed while viewing the dashboard sees revocation and loses the trip
    Given I am signed in
    And I have an editor contributor viewing the dashboard in their own session
    When I remove the dashboard contributor from the trip and save
    Then the dashboard contributor sees a message that they were removed from the trip
    When the dashboard contributor clicks OK
    Then the removed trip is absent from the contributor's dashboard

  Scenario: A contributor's dashboard drops a trip deleted elsewhere without a reload
    Given I am signed in
    And I have an editor contributor viewing the dashboard in their own session
    When I delete the trip
    Then the deleted trip is absent from the contributor's dashboard
