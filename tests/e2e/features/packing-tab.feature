@packing-tab
Feature: Packing tab
  Background:
    Given I am signed in
    And I have an existing trip with days

  Scenario: Empty packing state shows a prompt to start
    When I open the Packing tab
    Then I should see the empty packing state

  Scenario: User adds a packing item and it persists after reload
    When I open the Packing tab
    And I add a packing item named "Passport"
    Then the packing list should contain "Passport"
    When I reload the trip page
    Then the packing list should contain "Passport"

  Scenario: User adds and removes a section label and removal persists after reload
    When I open the Packing tab
    And I add a packing label named "Documents"
    Then the packing list should show the label "Documents"
    When I delete the packing entry named "Documents"
    Then the packing list should not contain "Documents"
    When I reload the trip page
    Then the packing list should not contain "Documents"

  Scenario: Items added after a section label appear under that label
    When I open the Packing tab
    And I add a packing label named "Electronics"
    And I add a packing item named "Phone charger"
    And I add a packing item named "Earbuds"
    Then the packing list order should be "Electronics" then "Phone charger" then "Earbuds"

  Scenario: Ungrouped items render below labeled sections
    When I open the Packing tab
    And I add a packing item named "Passport"
    And I add a packing label named "Documents"
    And I add a packing item named "Phone charger"
    Then the packing list order should be "Documents" then "Phone charger" then "Passport"

  Scenario: User removes a packing item and the removal persists after reload
    When I open the Packing tab
    And I add a packing item named "Passport"
    And I delete the packing entry named "Passport"
    Then the packing list should not contain "Passport"
    When I reload the trip page
    Then the packing list should not contain "Passport"
