Feature: User profile page

  Scenario: Navigate to profile from sidebar
    Given I am signed in
    When I click the user area in the sidebar
    Then I should be on the profile page

  Scenario: Update display name
    Given I am on the profile page
    When I update my name to "E2E Profile User"
    And I save the Identity section
    Then my name "E2E Profile User" should appear in the sidebar

  Scenario: Update preferences
    Given I am on the profile page
    When I set currency to "EUR"
    And I save the Preferences section
    Then the currency preference should persist after reload
