@feat:instance-bootstrap
Feature: Instance bootstrap sign-up
  Only this feature mutates the singleton instance state, so its scenarios never race another file.

  Scenario: The first sign-up on a fresh instance becomes the admin and signs back in
    Given the instance has not been set up yet
    And I am on the sign-up page
    When I sign up with a new username
    Then I should be redirected to the trips page
    And my new account is the instance admin
    And I can sign out and sign back in with my new username

  Scenario: Sign-up refuses a username that is already taken
    Given the instance has not been set up yet
    And I am on the sign-up page
    When I sign up with the username of an existing account
    Then I should see that the username is taken

  Scenario: Sign-up is closed once the instance is set up
    Given the instance is already set up
    And I am on the sign-up page
    When I sign up with a new username
    Then I should be told to ask an admin for an account
    And no account was created for that username
