@feat:update-notice
Feature: Update-available notice
  Scenario: Admin sees that a newer release is available
    Given I am signed in as an app "admin"
    Then the sidebar links to release "99.0.0"

  Scenario: Member is not told about releases
    Given I am signed in as an app "member"
    Then the sidebar shows no release notice
