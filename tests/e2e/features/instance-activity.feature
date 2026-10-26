@feat:instance-activity
Feature: Instance activity
  Scenario: Admin sees their own sign-in after refresh
    Given I am signed in as an instance "admin"
    When I open the instance Activity page
    And I refresh the page
    Then the Activity table lists a Sign-in row for me

  Scenario: An MFA password step alone adds no sign-in row
    Given the current account is an instance admin
    And my account has two-factor authentication on
    And I am on the sign-in page
    When I sign in with my password
    Then I should be asked for an authentication code
    And my account has 0 recorded sign-ins
    When I enter the next code from my authenticator app
    Then I should be redirected to the trips page
    And my account has 1 recorded sign-ins

  Scenario: A member cannot open Activity
    Given I am signed in as an instance "member"
    When I request instance management at "/admin/activity"
    Then instance management is not found

  Scenario: A deleted account's sign-in keeps its snapshot username
    Given I am signed in as an instance "admin"
    And another completed instance member exists
    And that member signed in and then had their account deleted
    When I open the instance Activity page
    Then the Activity table lists a Sign-in row for that deleted member

  Scenario: A wrong password for a known account is recorded against that account
    Given the current account is an instance admin
    And I am on the sign-in page
    When I submit the wrong password for my account
    Then 1 failed sign-in is recorded against my account
    And my account has 0 recorded sign-ins
    When I sign in with my password
    Then I should be redirected to the trips page
    When I open the instance Activity page
    Then the Activity table lists a Failed sign-in row for my account with an unavailable actor

  Scenario: A wrong password for an unknown account is recorded as an unknown account
    Given the current account is an instance admin
    And I am on the sign-in page
    When I submit the wrong password for an account that does not exist
    Then 1 failed sign-in is recorded against that unknown username
    When I sign in with my password
    Then I should be redirected to the trips page
    When I open the instance Activity page
    Then the Activity table lists a Failed sign-in row for that unknown username

  Scenario: A rejected direct credentials callback is recorded without an actor
    Given the current account is an instance admin
    And I am on the sign-in page
    When wrong credentials for my account are posted directly to the sign-in callback
    Then 1 failed sign-in is recorded against my account
    When I sign in with my password
    Then I should be redirected to the trips page
    When I open the instance Activity page
    Then the Activity table lists a Failed sign-in row for my account with an unavailable actor

  Scenario: A forged second-factor ticket is recorded with an unavailable identity
    Given the current account is an instance admin
    And I am on the sign-in page
    When a forged second-factor ticket is posted directly to the sign-in callback
    Then 1 failed sign-in is recorded with no identity
    When I sign in with my password
    Then I should be redirected to the trips page
    When I open the instance Activity page
    Then the Activity table lists a Failed sign-in row with an unavailable affected account

  Scenario: Logging out is recorded
    Given I am signed in as an instance "admin"
    When I sign out
    Then my account has 1 recorded "sign_out" events
    When I sign in with my password
    Then I should be redirected to the trips page
    When I open the instance Activity page
    Then the Activity table lists a Sign-out row for me

  Scenario: A role change records the admin and the affected account
    Given I am signed in as an instance "admin"
    And another completed instance member exists
    When I request instance management at "/admin/users"
    And I promote the other instance member
    Then my account has 1 recorded "role_changed" events
    And the role change names me and the other instance member
    When I open the instance Activity page
    Then the Activity table lists a Changed role row for me affecting the other instance member

  Scenario: A username change keeps the original identity in history
    Given I am signed in as an instance "admin"
    And I remember my current username
    When I open my profile page
    And I navigate to the Identity section
    And I change my username to a new one and save
    Then my account has 1 recorded "username_changed" events
    And the rename event keeps my original username and account ID
    When I open the instance Activity page
    Then the Activity table lists a Changed username row for my original username

  Scenario: A password change is recorded without a separate logout
    Given I am signed in as an instance "admin"
    When I open my profile page
    And I change my password
    Then I should be redirected to the sign-in page
    And my account has 1 recorded "password_changed" events
    And my account has 0 recorded "sign_out" events
    When I sign in with my new password
    And I open the instance Activity page
    Then the Activity table lists a Changed password row for me

  Scenario: Deleting my own account is recorded with the identity it had
    Given I am signed in as an instance "admin"
    And another completed instance admin exists
    And I remember my current username
    When I open my profile page
    And I delete my account
    Then I should be redirected to the sign-in page
    And my account has 1 recorded "account_deleted" events
    And the deletion event keeps my original username and account ID
    When the other instance admin opens the instance Activity page
    Then the Activity table lists a Deleted own account row for my original username

  Scenario: Created trip activity shows identity and ID without its name
    Given I am signed in as an instance "admin"
    When I create a private trip for Activity
    And I open the instance Activity page
    Then Activity lists one "Created trip" row for that trip without its name

  Scenario: Itinerary edits share one private Activity summary
    Given I am signed in as an instance "admin"
    And a private itinerary exists for Activity
    When I add two private itinerary notes for Activity
    And I open the instance Activity page
    Then Activity lists one "Updated trip" row for that trip without its name
