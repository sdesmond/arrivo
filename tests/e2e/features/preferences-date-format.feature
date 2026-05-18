Feature: Date format preference

  Scenario: Setting Day/Month format applies to trip cards
    Given I am signed in
    And I am on the profile page
    When I navigate to the Preferences section
    And I select the "Day/Month" date format
    And I save the Preferences section
    And I navigate to the trips page
    Then the trip card dates should be in DD/MM/YYYY format

  Scenario: Setting Month/Day format applies to trip cards
    Given I am signed in
    And I am on the profile page
    When I navigate to the Preferences section
    And I select the "Month/Day" date format
    And I save the Preferences section
    And I navigate to the trips page
    Then the trip card dates should be in MM/DD/YYYY format
