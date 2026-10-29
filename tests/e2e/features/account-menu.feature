@feat:account-menu
Feature: Account menu and app management shell
  Scenario: Late role responses preserve Settings navigation
    Given account role responses are delayed
    And I am signed in as an app "admin"
    When I wait for pending account role reads
    And I open the shared account menu
    And I choose account Settings
    When I release delayed account role responses
    And I open the shared account menu
    Then the account menu includes app management
    And late account role reads keep me on Settings

  Scenario: Admin opens app management from the desktop account menu
    Given I am signed in as an app "admin"
    When I open the shared account menu
    Then the account menu includes app management
    When I choose Manage app
    Then I see the Users-only app management shell

  Scenario: Member has personal settings and logout without app access
    Given I am signed in as an app "member"
    When I open the shared account menu
    Then the account menu excludes app management
    And the account menu offers Settings and Log out
    When I request app management at "/admin"
    Then app management is not found

  Scenario: Admin opens app management from the mobile Profile tab
    Given I am signed in as an app "admin"
    And I use a mobile account viewport
    When I open the shared account menu
    Then the account menu includes app management
    And the Profile tab has not navigated
    When I choose Manage app
    Then I see the Users-only app management shell

  Scenario: Mobile Profile opens the shared menu and Settings
    Given I am signed in as an app "member"
    And I use a mobile account viewport
    When I open the shared account menu
    Then the account menu offers Settings and Log out
    And the Profile tab has not navigated
    When I choose account Settings
    Then I should be on the profile page

  Scenario: Demotion removes management on the next client navigation
    Given I am signed in as an app "admin"
    When I open the shared account menu
    Then the account menu includes app management
    When my app admin role is removed in another session
    And I choose account Settings
    And I open the shared account menu
    Then the account menu excludes app management
    When I request app management at "/admin"
    Then app management is not found

  Scenario: Demotion blocks the Users page even with an existing admin layout
    Given I am signed in as an app "admin"
    When I request app management at "/admin/users?authority-check=1"
    Then I see the Users-only app management shell
    When my app admin role is removed in another session
    And I follow Users in the existing app navigation
    Then client app navigation is not found
    When I request app management at "/admin/users"
    Then app management is not found

  Scenario: Demotion removes management after Travel History query navigation
    Given I am signed in as an app "admin"
    When I open Travel History from the sidebar
    And I open the shared account menu
    Then the account menu includes app management
    When my app admin role is removed in another session
    And I switch Travel History to Spending through query navigation
    And I open the shared account menu
    Then the account menu excludes app management
