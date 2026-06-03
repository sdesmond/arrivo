Feature: Pull templates onto a trip packing list
  Background:
    Given I am signed in as the template pull user

  Scenario: Empty state offers pull from template
    Given I have a trip with no packing items for pull
    And I have a packing template available for pull
    When I open the packing tab for the pull test trip
    Then I should see a "Pull from a template" button

  Scenario: Pull a template onto an empty trip list
    Given I have a trip with no packing items for pull
    And I have a packing template available for pull
    When I open the packing tab for the pull test trip
    And I pull the template onto the trip
    Then the packing list should contain "Passport"
    And the packing list should contain "Phone Charger"
    And the packing list should contain "Toothbrush"

  Scenario: Deduplication skips matching items across two templates
    Given I have a trip with no packing items for pull
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
