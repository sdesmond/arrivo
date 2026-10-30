@feat:password-reset
Feature: Administrator password reset
  Scenario: A reset link changes the password only when completed
    Given I am signed in as an app "admin"
    And another completed app member exists
    When I request app management at "/admin/users"
    And I generate a password reset link for the other member
    Then the other member's original password remains valid
    When I open the generated password reset link as a recipient
    And I complete the password reset with "replacement-password-1"
    Then the other member's new password is saved and the link is unavailable
    When the other member signs in with the new password
    Then I should be redirected to the trips page

  Scenario: A replacement makes an opened reset context unavailable
    Given I am signed in as an app "admin"
    And another completed app member exists
    When I request app management at "/admin/users"
    And I generate a password reset link for the other member
    And I open the generated password reset link as a recipient
    And the reset link is replaced
    And I reload the page
    Then I see the reset link unavailable page

  Scenario: Concurrent completions consume one authorization and preserve MFA
    Given I am signed in as an app "admin"
    And another completed app member exists
    When two reset completions compete for the same account
    Then exactly one reset completion succeeds and MFA remains unchanged

  Scenario: Completing reset revokes trusted devices and recovery links
    Given I am signed in as an app "admin"
    And another completed app member exists
    And the other member has a trusted device and recovery authorization
    When I reset the other member's password through the lifecycle service
    Then the trusted device and recovery authorization are revoked

  Scenario: A password change waiting for the account lock cannot overwrite a reset
    Given I am signed in as an app "admin"
    And another completed app member exists
    When the member's password change races a reset
    Then the reset password wins and the old session cannot change it

  Scenario: Reset keeps the recipient's existing MFA
    Given I am signed in as an app "admin"
    And another completed app member exists
    And the other member has MFA enabled
    When I request app management at "/admin/users"
    And I generate a password reset link for the other member
    And I open the generated password reset link as a recipient
    And I complete the password reset with "replacement-password-1"
    And the other member signs in with the new password
    Then I should be asked for an authentication code
    When the other member enters their authenticator code
    Then I should be redirected to the trips page

  Scenario: Global sign-out waiting for the account lock cannot revoke post-reset authentication
    Given I am signed in as an app "admin"
    And another completed app member exists
    When the member's "global sign-out" races a reset
    Then fresh authentication survives and the stale browser reaches sign-in without a success notice

  Scenario: Device removal waiting for the account lock cannot remove a post-reset device
    Given I am signed in as an app "admin"
    And another completed app member exists
    When the member's "device removal" races a reset
    Then fresh authentication survives and the stale browser reaches sign-in without a success notice

  Scenario: A cross-origin reset submission is rejected
    Given I am signed in as an app "admin"
    And another completed app member exists
    When I request app management at "/admin/users"
    And I generate a password reset link for the other member
    And I open the generated password reset link as a recipient
    And I submit a cross-origin password reset
    Then the other member's original password remains valid
