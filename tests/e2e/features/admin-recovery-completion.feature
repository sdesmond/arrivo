@feat:admin-recovery-completion
Feature: Admin recovery completion in the browser
  Scenario: A recovery link replaces password and MFA, shows new codes once and requires fresh sign-in
    Given I am signed in as an app "admin"
    And another completed app member exists
    And the other member is an admin with MFA, a trusted device and a reset link
    When the operator issues a recovery link for the other member
    And I open the recovery link as the recipient
    Then the recovery form shows a new authenticator key
    When I complete recovery with password "replacement-password-1" and the correct authenticator code
    Then I see ten recovery codes once
    And the other member's credentials are fully replaced
    And Activity shows operator issuance and secret-free completion for the other member
    And reloading does not show the recovery codes again

  Scenario: Completed recovery signs in with the new password and authenticator
    Given I am signed in as an app "admin"
    And another completed app member exists
    And the other member is an admin with MFA, a trusted device and a reset link
    When the operator issues a recovery link for the other member
    And I open the recovery link as the recipient
    Then the recovery form shows a new authenticator key
    When I complete recovery with password "replacement-password-1" and the correct authenticator code
    Then I see ten recovery codes once
    When I acknowledge the recovery codes
    And the other member signs in with the new password
    Then I should be asked for an authentication code
    When the other member enters the recovered authenticator code
    Then I should be redirected to the trips page

  Scenario: Opening or abandoning a recovery link changes nothing
    Given I am signed in as an app "admin"
    And another completed app member exists
    And the other member is an admin with MFA, a trusted device and a reset link
    When the operator issues a recovery link for the other member
    And I open the recovery link as the recipient
    Then the recovery form shows a new authenticator key
    And reloading shows the same authenticator key
    And the other member's credentials are unchanged
    And the other member's reset link still works

  Scenario: An expired recovery link is unavailable and changes nothing
    Given I am signed in as an app "admin"
    And another completed app member exists
    And the other member is an admin with MFA, a trusted device and a reset link
    When the operator issues a recovery link for the other member
    And I open the recovery link as the recipient
    And the recovery link expires
    And I reload the page
    Then I see the recovery link unavailable page
    And the other member's credentials are unchanged

  Scenario: A replaced recovery link makes an opened context unavailable
    Given I am signed in as an app "admin"
    And another completed app member exists
    And the other member is an admin with MFA, a trusted device and a reset link
    When the operator issues a recovery link for the other member
    And I open the recovery link as the recipient
    And the operator replaces the recovery link
    And I reload the page
    Then I see the recovery link unavailable page
    And the other member's credentials are unchanged

  Scenario: A competing password reset refuses the recovery submission
    Given I am signed in as an app "admin"
    And another completed app member exists
    And the other member is an admin with MFA, a trusted device and a reset link
    When the operator issues a recovery link for the other member
    And I open the recovery link as the recipient
    Then the recovery form shows a new authenticator key
    When a password reset completes for the other member
    And I complete recovery with password "replacement-password-1" and the correct authenticator code
    Then I see the recovery link unavailable page
    And the competing reset's password stands and MFA is unchanged

  Scenario: Bad input changes nothing and keeps the pending authenticator key
    Given I am signed in as an app "admin"
    And another completed app member exists
    And the other member is an admin with MFA, a trusted device and a reset link
    When the operator issues a recovery link for the other member
    And I open the recovery link as the recipient
    Then the recovery form shows a new authenticator key
    When I submit recovery with password "replacement-password-1" and code "000000"
    Then I see a recovery error "That code didn't work"
    And reloading shows the same authenticator key
    And the other member's credentials are unchanged

  Scenario: The immediate two-factor reset command is gone
    Then no immediate two-factor reset command or documentation remains
