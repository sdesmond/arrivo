@feat:sync-status
Feature: Live sync status

  Scenario: A healthy connection shows no sync indicator
    Given I am signed in
    Then the trips page has finished loading
    And no live sync problem indicator is shown

  Scenario: A dropped connection raises a reconnecting icon that reveals its label on focus
    Given I am signed in
    When I interrupt the live sync connection
    Then the live sync problem indicator shows "Reconnecting"
    When I move keyboard focus to the live sync problem indicator
    Then the live sync tooltip shows "Reconnecting"

  Scenario: Tapping the problem icon reveals its label
    Given I am signed in
    When I interrupt the live sync connection
    Then the live sync problem indicator shows "Reconnecting"
    When I tap the live sync problem indicator
    Then the live sync tooltip shows "Reconnecting"

  Scenario: A dead channel reports it cannot sync and clears once the channel recovers
    Given I am signed in
    When I interrupt the live sync connection
    Then the live sync problem indicator eventually shows "Unable to sync"
    When I restore the live sync connection
    Then no live sync problem indicator is shown
