Feature: User profile page

  Scenario: Navigate to profile from sidebar
    Given I am signed in
    When I click the user area in the sidebar
    Then I should be on the profile page

  Scenario: Update display name
    Given I am on the profile page
    When I navigate to the Identity section
    And I update my name to "E2E Profile User"
    And I save the Identity section
    Then my name "E2E Profile User" should appear in the sidebar

  Scenario: Update preferences
    Given I am on the profile page
    When I navigate to the Preferences section
    And I set currency to "EUR"
    And I save the Preferences section
    Then the currency preference should persist after reload

  Scenario: Identity section is shown by default
    Given I am on the profile page
    Then the Identity section should be active
    And the Identity content should be visible

  Scenario: Switching to Traveler section shows loyalty, passport, and wishlist
    Given I am on the profile page
    When I navigate to the Traveler section
    Then the Traveler content should be visible
    And the Identity content should not be visible
