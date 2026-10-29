@feat:integrated-onboarding
Feature: Integrated administrator-issued onboarding
  Scenario: An administrator adds one account and its recipient finishes setup
    Given I am signed in as an instance "admin"
    When I request instance management at "/admin/users"
    When I create a fresh account through Add User
    And the recipient opens the administrator-issued link
    Then the recipient must supply Name, password and confirmation for the fixed username
    When the recipient completes setup and signs in again
    Then Users and the recipient identify the original account and the link is consumed

  Scenario: Adding a pending account keeps bootstrap closed and rejects normalized duplicates
    Given I am signed in as an instance "admin"
    When I request instance management at "/admin/users"
    When I create a fresh account through Add User
    Then bootstrap remains closed with the added account still pending
    When I submit the added username again with different casing
    Then the duplicate creates neither an account nor another authorization

  Scenario: A setup-only context cannot access any protected surface
    Given I am signed in
    And authorized protected resources and a captured mutation exist
    And a pending account with a fresh setup link
    When I open the setup link
    Then setup-only requests refuse app routes, the captured action, stored file and both feeds

  Scenario: A held setup context stops working after expiry
    Given the instance is already set up
    And a pending account with a fresh setup link
    When I open the setup link
    And the held setup link expires
    And I reload the page
    Then I see the setup link unavailable page
    And the pending account has no password

  Scenario: A deleted account's unopened link refuses entry
    Given the instance is already set up
    And a pending account with a fresh setup link
    When the pending account is deleted
    And I open the setup link
    Then I see the setup link unavailable page

