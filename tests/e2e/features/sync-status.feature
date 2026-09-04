@feat:sync-status
Feature: Live sync status
  Scenario: Signed-in user sees live sync connect in the app shell
    Given I am signed in
    Then the live sync status shows "Connected"
