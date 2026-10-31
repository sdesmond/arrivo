@feat:admin-overview
Feature: Admin overview
  Scenario: Admin sees instance status rows
    Given I am signed in as an app "admin"
    And scenario-owned uploads exist for the Overview measurement
    When I request app management at "/admin"
    Then I am on the app Overview
    And the Overview shows version, database health and user counts with checked times
    And the Overview version matches package.json
    And the Overview storage is healthy with readable usage and exact bytes on hover
    When the Overview storage probe fails
    Then only the Overview storage health is unavailable
    And the Overview upload bytes still match stored files
    When the Overview storage probe recovers
    Then the Overview storage is healthy with readable usage and exact bytes on hover

  Scenario: A member cannot open Overview
    Given I am signed in as an app "member"
    When I request app management at "/admin/overview"
    Then app management is not found
