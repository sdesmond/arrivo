@feat:admin-overview
Feature: Admin overview
  Scenario: Admin sees instance status rows
    Given I am signed in as an app "admin"
    And scenario-owned uploads exist for the Overview measurement
    And scenario-owned trips and documents exist across Overview accounts
    When I request app management at "/admin"
    Then I am on the app Overview
    And the Overview shows version, database health and user counts with checked times
    And the Overview version matches package.json
    And the Overview trip and document totals match the database with checked times
    And the Overview contains no private fixture details
    And the Overview storage is healthy with readable usage and exact bytes on hover
    And the Overview storage refresh is independent and keyboard accessible
    When the Overview storage probe fails
    Then the Overview storage refresh retains its stale value through repeated failures
    When the Overview storage probe recovers
    Then the Overview storage Retry recovers its value
    When the Overview storage probe fails
    And I reload the Overview under the storage fault
    Then only the Overview storage health is unavailable
    And the Overview upload bytes still match stored files
    When the Overview storage probe recovers
    Then the Overview storage Retry recovers its value
    And the Overview storage is healthy with readable usage and exact bytes on hover

  Scenario: Admin sees recent admin actions and failed sign-ins
    Given I am signed in as an app "admin"
    And scenario-owned admin actions and failed sign-ins exist in Activity
    When I request app management at "/admin"
    Then I am on the app Overview
    And the Overview lists the five newest seeded admin actions newest first
    And the Overview failed sign-in count matches Activity for the last 24 hours
    And the Overview contains no private fixture details

  Scenario: Admin sees how to support Arrivo
    Given I am signed in as an app "admin"
    When I request app management at "/admin"
    Then I am on the app Overview
    And the Overview offers a GitHub Sponsors link that opens in a new tab

  Scenario: A member cannot open Overview
    Given I am signed in as an app "member"
    When I request app management at "/admin/overview"
    Then app management is not found
