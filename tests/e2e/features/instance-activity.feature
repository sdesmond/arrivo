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
