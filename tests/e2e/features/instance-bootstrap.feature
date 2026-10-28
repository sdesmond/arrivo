@feat:instance-bootstrap
Feature: First-run admin setup
  Only this feature mutates the singleton instance state, so its scenarios never race another file.

  Scenario: The first admin setup on a fresh instance becomes the admin and signs back in
    Given the instance has not been set up yet
    And I am on the admin setup page
    Then I see the admin setup welcome
    And Username is focused
    When I sign up with a new username
    Then I should be redirected to the trips page
    And my new account is the instance admin
    And the account creation is recorded once in Activity for my new account
    When I open the shared account menu
    And I choose Manage instance
    Then I see the Users-only instance management shell
    And I can sign out and sign back in with my new username

  Scenario: The first admin setup on a fresh instance reaches Manage instance from the mobile Profile tab
    Given the instance has not been set up yet
    And I use a mobile account viewport
    And I am on the admin setup page
    Then I see the admin setup welcome
    And Username is focused
    When I sign up with a new username
    Then I should be redirected to the trips page
    And my new account is the instance admin
    When I open the shared account menu
    Then the account menu includes instance management
    And the Profile tab has not navigated
    When I choose Manage instance
    Then I see the Users-only instance management shell
    And I can sign out and sign back in with my new username

  Scenario Outline: Fresh entry resolves to welcome setup
    Given the instance has not been set up yet
    When I open bootstrap entry "<path>"
    Then I see the admin setup welcome

    Examples:
      | path     |
      | /        |
      | /trips   |
      | /sign-in |
      | /sign-up |
      | /setup   |

  Scenario Outline: Initialized entry redirects to sign in
    Given the instance is already set up
    When I open bootstrap entry "<path>"
    Then I see the sign-in screen

    Examples:
      | path     |
      | /setup   |
      | /sign-up |
      | /sign-in |

  Scenario: A stale open setup form refuses account creation
    Given the instance has not been set up yet
    And I am on the admin setup page
    And the instance is already set up
    When I sign up with a new username
    Then I should be told setup is already complete
    And no account was created for that username
    And no account creation was recorded in Activity for that username

  Scenario: Setup refuses a username that is already taken
    Given the instance has not been set up yet
    And I am on the admin setup page
    When I sign up with the username of an existing account
    Then I should see that the username is taken

  Scenario Outline: Invalid setup is rejected on server and instance stays fresh
    Given the instance has not been set up yet
    And I am on the admin setup page
    When I submit admin setup with "<field>" set to "<value>"
    Then I see setup error "<error>"
    And no account was created for that username
    And no account creation was recorded in Activity for that username
    And setup remains open after reload

    Examples:
      | field           | value     | error                                  |
      | confirmPassword | different | Passwords do not match.                |
      | confirmPassword |           | Confirm your password.                 |
      | password        |           | Password must be at least 8 characters. |
      | password        | short     | Password must be at least 8 characters. |
      | name            |           | Name is required.                      |
      | username        | bad@email | Use letters, numbers, dots, dashes or underscores, starting with a letter or number. |
