@feat:auth
Feature: Authentication
  Scenario: User signs in with valid credentials
    Given I am on the sign-in page
    When I enter valid credentials
    And I submit the sign-in form
    Then I should be redirected to the trips page

  Scenario: User sees an error with invalid credentials
    Given I am on the sign-in page
    When I enter an incorrect password
    And I submit the sign-in form
    Then I should see a sign-in error message

  Scenario: User signs out
    Given I am signed in
    When I sign out
    Then I should be redirected to the sign-in page

  Scenario: Keyboard user can sign in
    Given I am on the sign-in page
    When I tab to the username field and type valid credentials
    And I press Enter to submit
    Then I should be redirected to the trips page

  Scenario: Account locks after repeated failed sign-ins
    Given I am on the sign-in page
    When I enter the wrong password for my account 5 times
    And I sign in to my account with the correct password
    Then I should see a sign-in lockout message

  Scenario: A browser I've signed in from isn't locked out by failed attempts elsewhere
    Given I have signed in and out on this browser
    When someone enters the wrong password for my account 5 times on another browser
    And I sign in to my account with the correct password
    Then I should be redirected to the trips page

  Scenario: Keep me signed in
    Given I am on the sign-in page
    When I sign in to my account with Keep me signed in ticked
    Then I should be redirected to the trips page

  Scenario: New user signs up with a username and signs back in with it
    Given I am on the sign-up page
    When I sign up with a new username
    Then I should be redirected to the trips page
    And I can sign out and sign back in with my new username

  Scenario: Sign-up refuses a username that is already taken
    Given I am on the sign-up page
    When I sign up with the username of an existing account
    Then I should see that the username is taken
