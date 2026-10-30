@feat:admin-overview
Feature: Admin overview
  Scenario: Admin sees instance status rows
    Given I am signed in as an app "admin"
    When I request app management at "/admin"
    Then I am on the app Overview
    And the Overview shows version, database health and user counts with checked times
    And the Overview version matches package.json

  Scenario: A member cannot open Overview
    Given I am signed in as an app "member"
    When I request app management at "/admin/overview"
    Then app management is not found
