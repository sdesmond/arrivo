@packing-lists
Feature: Multiple packing lists per trip

  Background:
    Given I am signed in
    And I have an existing trip with days

  Scenario: Empty packing tab shows New List prompt
    When I open the Packing tab
    Then I should see the packing lists empty state

  Scenario: User creates a packing list and it appears in the library
    When I open the Packing tab
    And I create a new packing list named "Carry-On"
    Then the packing list library should show "Carry-On"

  Scenario: User drills into a packing list and adds an item
    Given I have a seeded packing list named "Carry-On"
    When I open the Packing tab
    And I open the packing list "Carry-On"
    And I add a packing item named "Passport"
    Then the packing list should contain "Passport"

  Scenario: User inserts a template as a checklist from the itinerary
    Given I have a seeded packing template named "Beach Pack" with items
    When I open day 1 in the itinerary
    And I click Add and select the packing list picker
    And I select the template "Beach Pack" from the picker
    Then a checklist titled "Beach Pack" should appear in day 1
