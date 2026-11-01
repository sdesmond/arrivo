@feat:add-user-dialog
Feature: Admin creates an account and shares its setup link
  Scenario: Desktop creation preserves pending account and clears one-time result
    Given I am signed in as an app "admin"
    When I request app management at "/admin/users"
    And I create a fresh account through Add User
    Then the Add User result is focused and shareable
    When I close and reopen Add User
    Then Add User has a blank form without a setup link
    And the added account persists as pending after reload

  Scenario: Mobile creation clears one-time result
    Given I am signed in as an app "admin"
    And I use a mobile account viewport
    When I request app management at "/admin/users"
    And I create a fresh account through Add User
    Then the Add User result is focused and shareable
    When I close and reopen Add User
    Then Add User has a blank form without a setup link
    And the added account persists as pending after reload

  Scenario: Invalid and taken usernames cannot create another account
    Given I am signed in as an app "admin"
    When I request app management at "/admin/users"
    And I submit an invalid Add User username
    Then Add User explains the username error
    When I submit an existing Add User username
    Then Add User reports the username is taken without a duplicate

  Scenario: Lost creation response reconciles committed account before retry
    Given I am signed in as an app "admin"
    When I request app management at "/admin/users"
    And the Add User response is lost after account creation
    Then Add User reports an existing account without recovering its link
    And the added account persists as pending after reload
