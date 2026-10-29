@feat:app-users
Feature: App user roles
  Scenario: Admin promotes a member and gives up app authority
    Given I am signed in as an app "admin"
    And another completed app member exists
    When I request app management at "/admin/users"
    And I promote the other app member
    Then the other app member is persistently an admin
    When I remove my own app admin role
    Then I land on personal settings after demotion
    When I open the shared account menu
    Then the account menu excludes app management
    When I request app management at "/admin"
    Then app management is not found

  Scenario: Admin promotes a member and gives up app authority on mobile
    Given I am signed in as an app "admin"
    And I use a mobile account viewport
    And another completed app member exists
    When I request app management at "/admin/users"
    And I promote the other app member
    Then the other app member is persistently an admin
    When I remove my own app admin role
    Then I land on personal settings after demotion
    When I open the shared account menu
    Then the account menu excludes app management
    When I request app management at "/admin"
    Then app management is not found
