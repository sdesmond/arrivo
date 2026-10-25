@feat:account-menu
Feature: Account menu and instance management shell
  Scenario: Late role responses preserve Settings navigation
    Given account role responses are delayed
    And I am signed in as an instance "admin"
    When I wait for pending account role reads
    And I open the shared account menu
    And I choose account Settings
    When I release delayed account role responses
    And I open the shared account menu
    Then the account menu includes instance management
    And late account role reads keep me on Settings

  Scenario: Admin opens instance management from the desktop account menu
    Given I am signed in as an instance "admin"
    When I open the shared account menu
    Then the account menu includes instance management
    When I choose Manage instance
    Then I see the Users-only instance management shell

  Scenario: Member has personal settings and logout without instance access
    Given I am signed in as an instance "member"
    When I open the shared account menu
    Then the account menu excludes instance management
    And the account menu offers Settings and Log out
    When I request instance management at "/admin"
    Then instance management is not found

  Scenario: Mobile Profile opens the shared menu and Settings
    Given I am signed in as an instance "member"
    And I use a mobile account viewport
    When I open the shared account menu
    Then the account menu offers Settings and Log out
    And the Profile tab has not navigated
    When I choose account Settings
    Then I should be on the profile page

  Scenario: Demotion removes management on the next client navigation
    Given I am signed in as an instance "admin"
    When I open the shared account menu
    Then the account menu includes instance management
    When my instance admin role is removed in another session
    And I choose account Settings
    And I open the shared account menu
    Then the account menu excludes instance management
    When I request instance management at "/admin"
    Then instance management is not found

  Scenario: Demotion blocks the Users page even with an existing admin layout
    Given I am signed in as an instance "admin"
    When I request instance management at "/admin/users?authority-check=1"
    Then I see the Users-only instance management shell
    When my instance admin role is removed in another session
    And I follow Users in the existing instance navigation
    Then client instance navigation is not found
    When I request instance management at "/admin/users"
    Then instance management is not found

  Scenario: Demotion removes management after Travel History query navigation
    Given I am signed in as an instance "admin"
    When I open Travel History from the sidebar
    And I open the shared account menu
    Then the account menu includes instance management
    When my instance admin role is removed in another session
    And I switch Travel History to Spending through query navigation
    And I open the shared account menu
    Then the account menu excludes instance management
