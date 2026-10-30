@feat:integrated-recovery-and-deletion
Feature: Reset, recovery and deletion together retire a member's access without leaking secrets

  Scenario: An admin reset ends the live session, device and recovery link but keeps MFA
    Given I am signed in as an app "admin"
    And another completed app member exists
    And the other member holds a live session in a second browser context
    And the other member has MFA enabled
    And the other member has a trusted device and recovery authorization
    When I request app management at "/admin/users"
    And I generate a password reset link for the other member
    And I open the generated password reset link as a recipient
    And I complete the password reset with "replacement-password-1"
    Then the live member session reaches sign-in
    And the trusted device and recovery authorization are revoked
    And the other member's authenticator is still enrolled
    And the recovery link page is unavailable
    When the other member signs in with the new password
    Then I should be asked for an authentication code
    When the other member enters their authenticator code
    Then I should be redirected to the trips page
    And the admin Activity page exposes no credentials or private trip detail

  Scenario: Operator recovery ends the live session and retires the sibling reset link
    Given I am signed in as an app "admin"
    And another completed app member exists
    And the other member holds a live session in a second browser context
    And the other member is an admin with MFA, a trusted device and a reset link
    When the operator issues a recovery link for the other member
    And I open the recovery link as the recipient
    Then the recovery form shows a new authenticator key
    When I complete recovery with password "replacement-password-1" and the correct authenticator code
    Then I see ten recovery codes once
    And the live member session reaches sign-in
    And the reset link page is unavailable
    And reloading does not show the recovery codes again
    And the admin Activity page exposes no credentials or private trip detail

  Scenario: Admin deletion passes the trip on and retires every outstanding link and session
    Given I am signed in as an app "admin"
    And a completed account owns a private trip shared with an editor and a viewer
    And the account owner holds a live session in a second browser context
    And the account owner has an outstanding reset link and recovery link
    When I request app management at "/admin/users"
    And I review deleting the completed account
    Then the review exposes no trip or collaborator detail
    When I confirm the reviewed deletion
    Then the completed account is gone and its trip passes to the "editor"
    And the live member session is refused
    And the reset link page is unavailable
    And the recovery link page is unavailable
    And I am still signed in on Users
    And the admin Activity page exposes no credentials or private trip detail
