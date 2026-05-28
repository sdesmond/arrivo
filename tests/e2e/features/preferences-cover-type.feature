Feature: Cover type preference

  Scenario: Setting Map as default cover type persists after reload
    Given I am signed in
    And I am on the profile page
    When I navigate to the Preferences section
    And I select the "Map" cover type
    And I save the Preferences section
    Then the "Map" cover type should be selected after reload

  Scenario: Setting Graphic as default cover type persists after reload
    Given I am signed in
    And I am on the profile page
    When I navigate to the Preferences section
    And I select the "Graphic" cover type
    And I save the Preferences section
    Then the "Graphic" cover type should be selected after reload
