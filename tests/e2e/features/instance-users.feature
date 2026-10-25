@feat:instance-users
Feature: Instance user roles
  Scenario: Admin promotes a member and gives up instance authority
    Given I am signed in as an instance "admin"
    And another completed instance member exists
    When I request instance management at "/admin/users"
    And I promote the other instance member
    Then the other instance member is persistently an admin
    When I remove my own instance admin role
    Then I land on personal settings after demotion
    When I open the shared account menu
    Then the account menu excludes instance management
    When I request instance management at "/admin"
    Then instance management is not found

  Scenario: Admin promotes a member and gives up instance authority on mobile
    Given I am signed in as an instance "admin"
    And I use a mobile account viewport
    And another completed instance member exists
    When I request instance management at "/admin/users"
    And I promote the other instance member
    Then the other instance member is persistently an admin
    When I remove my own instance admin role
    Then I land on personal settings after demotion
    When I open the shared account menu
    Then the account menu excludes instance management
    When I request instance management at "/admin"
    Then instance management is not found
