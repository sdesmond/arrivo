@feat:pull-templates
Feature: Pull templates onto a trip packing list
  Background:
    Given I am signed in as the template pull user

  Scenario: Empty list offers pull from template via overflow menu
    Given I have a trip with no packing items for pull
    And I have a packing template available for pull
    When I open the packing tab for the pull test trip
    And I open the list options overflow menu
    Then I should see a pull templates option in the overflow menu

  Scenario: Pull a template onto a populated trip list
    Given I have a trip with a pre-seeded packing item for pull
    And I have a packing template available for pull
    When I open the packing tab for the pull test trip
    And I pull the template onto the trip
    Then the packing list should contain "Passport"
    And the packing list should contain "Phone Charger"
    And the packing list should contain "Toothbrush"
    And the pulled packing list persists after reload

  Scenario: Deduplication skips matching items across two templates on a populated trip
    Given I have a trip with a pre-seeded packing item for pull
    And I have two packing templates available for pull with a shared item
    When I open the packing tab for the pull test trip
    And I pull both templates onto the trip
    Then the packing list should contain "Toothbrush" exactly once
    And I should see a duplicate notice

  Scenario: Pull appends to an already-populated list
    Given I have a trip with a pre-seeded packing item for pull
    And I have a packing template available for pull
    When I open the packing tab for the pull test trip
    And I pull the template onto the trip
    Then the packing list should contain "Laptop"
    And the packing list should contain "Passport"
    And the packing list should contain "Phone Charger"

  Scenario: Pull into a selected second list preserves its section after reload
    Given I have a trip with two packing lists for pull
    And I have a sectioned packing template available for pull
    When I select the second packing list for pull
    And I pull the sectioned template onto the trip
    Then the selected list and its section persist after reload

  Scenario: A template section can share a name with an existing item
    Given I have a trip with two packing lists for pull
    And the second list contains an ungrouped item named "Essentials"
    And I have a sectioned packing template available for pull
    When I select the second packing list for pull
    And I pull the sectioned template onto the trip
    Then the section and its child coexist with the matching item after reload
