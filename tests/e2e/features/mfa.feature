@feat:mfa
Feature: Two-factor authentication

  Scenario: Turn on two-factor authentication and sign in with a code
    Given I am on the profile page
    When I open the Security section
    And I set up two-factor authentication with my authenticator app
    Then I should see 10 recovery codes
    When I confirm I saved my recovery codes
    Then I should be redirected to the sign-in page
    And I should see the sign-in notice "Two-factor authentication is on"
    When I sign in with my password
    Then I should be asked for an authentication code
    When I enter the next code from my authenticator app
    Then I should be redirected to the trips page

  Scenario: A recovery code signs in only once
    Given my account has two-factor authentication on
    And I am on the sign-in page
    When I sign in with my password
    And I enter a recovery code
    Then I should be redirected to the trips page
    When I sign out
    And I sign in with my password
    And I enter a recovery code
    Then I should see the two-factor error "That code didn't work. Try again."

  Scenario: Turn off two-factor authentication
    Given my account has two-factor authentication on
    And I am on the sign-in page
    When I sign in with my password
    And I enter the next code from my authenticator app
    Then I should be redirected to the trips page
    When I open my profile's Security section
    And I turn off two-factor authentication with my password and a code
    Then I should be redirected to the sign-in page
    When I sign in with my password
    Then I should be redirected to the trips page

  Scenario: Don't ask for a code on this browser skips it next time
    Given my account has two-factor authentication on
    And I am on the sign-in page
    When I sign in with my password
    And I enter the next code from my authenticator app and ask not to be asked again on this browser
    Then I should be redirected to the trips page
    When I sign out
    And I sign in with my password
    Then I should be redirected to the trips page
    When I open my profile's Security section
    And I remove this browser
    Then I should be redirected to the sign-in page
    When I sign in with my password
    Then I should be asked for an authentication code
