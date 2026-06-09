@packing-tab
Feature: Packing tab

  Background:
    Given I am signed in
    And I have an existing trip with days

  Scenario: Empty packing state shows minimal inputs with no empty-state card
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

  Scenario: Items added via the general form are ungrouped, not filed under a section
    When I open the Packing tab
    And I add a packing label named "Electronics"
    And I add a packing item named "Phone charger"
    And I add a packing item named "Earbuds"
    Then the section "Electronics" should have no items
    And the packing item "Phone charger" should be in the Ungrouped section
    And the packing item "Earbuds" should be in the Ungrouped section

  Scenario: Ungrouped items render below labeled sections
    When I open the Packing tab
    And I add a packing item named "Passport"
    And I add a packing label named "Documents"
    And I add a packing item named "Phone charger"
    Then the packing list order should be "Documents" then "Passport" then "Phone charger"

  Scenario: User removes a packing item and the removal persists after reload
    When I open the Packing tab
    And I add a packing item named "Passport"
    And I delete the packing entry named "Passport"
    Then the packing list should not contain "Passport"
    When I reload the trip page
    Then the packing list should not contain "Passport"

  Scenario: User checks an item and the checked state persists after reload
    Given I have pre-seeded packing items for the trip
    When I open the Packing tab
    And I check the packing item named "Sunscreen"
    Then the packing item "Sunscreen" should be checked
    When I reload the trip page
    Then the packing item "Sunscreen" should be checked

  Scenario: User unchecks an item and the unchecked state persists after reload
    Given I have pre-seeded packing items for the trip
    And the packing item "Sunscreen" is already checked
    When I open the Packing tab
    And I uncheck the packing item named "Sunscreen"
    Then the packing item "Sunscreen" should be unchecked
    When I reload the trip page
    Then the packing item "Sunscreen" should be unchecked

  Scenario: Checking items updates the trip card progress count
    Given I have pre-seeded packing items for the trip
    When I navigate to the trips list
    Then the trip card for "E2E Test Trip" should show "0 / 3 packed"
    When I open the trip and go to the Packing tab
    And I check the packing item named "Sunscreen"
    When I return to the trips list
    Then the trip card for "E2E Test Trip" should show "1 / 3 packed"

  Scenario: Trip card progress excludes section labels from the packed count
    Given I have pre-seeded packing items with labels for the trip
    When I navigate to the trips list
    Then the trip card for "E2E Test Trip" should show "0 / 2 packed"

  @retry(3)
  Scenario: User keyboard-reorders an item and the new position persists after reload
    Given I have pre-seeded packing reorder items for the trip
    When I open the Packing tab
    And I keyboard-move the item "Item A" down one position
    Then the packing item "Item A" should be at position 1
    Then the packing list order should be "Item B" then "Item A" then "Item C"
    When I reload the trip page
    Then the packing item "Item A" should be at position 1
    Then the packing list order should be "Item B" then "Item A" then "Item C"

  Scenario: Section label shows strikethrough when all items beneath it are checked
    Given I have pre-seeded packing items with label and items for strikethrough
    When I open the Packing tab
    Then the section label "Documents" should not have strikethrough
    When I check the packing item named "Passport"
    And I check the packing item named "Visa"
    Then the section label "Documents" should have strikethrough

  Scenario: User adds item under a section label and it appears there
    Given I have pre-seeded packing items for contextual add
    When I open the Packing tab
    And I add an item "Travel adapter" under the section "Documents"
    Then the packing list should contain "Travel adapter"
    And "Travel adapter" should appear after "Documents" in the list

  Scenario: User adds an ungrouped item when the trip only has sections
    Given I have pre-seeded packing items for contextual add
    When I open the Packing tab
    And I add an ungrouped item named "Travel adapter"
    Then the packing list should contain "Travel adapter"
    And "Travel adapter" should appear after "Passport" in the list

  Scenario: User inline-edits an item text and it persists after reload
    Given I have pre-seeded packing items for inline editing
    When I open the Packing tab
    And I rename the packing item "Passport" to "Passport (renewed)"
    Then the packing item "Passport (renewed)" should be visible
    When I reload the trip page
    Then the packing item "Passport (renewed)" should be visible

  Scenario: User renames a section label and it persists after reload
    Given I have pre-seeded a section label for renaming
    When I open the Packing tab
    And I rename the section label "Documents" to "Travel documents"
    Then the section label "Travel documents" should be visible
    When I reload the trip page
    Then the section label "Travel documents" should be visible

  Scenario: User deletes a section label and moves its items to Ungrouped
    Given I have pre-seeded a section label with items beneath it
    When I open the Packing tab
    And I delete the section label "Documents" and move its items to Ungrouped
    Then the section label "Documents" should not be visible
    And the packing item "Passport" should be visible

  Scenario: User deletes a section label and removes its items with it
    Given I have pre-seeded a section label with items beneath it
    When I open the Packing tab
    And I delete the section label "Documents" and its items
    Then the section label "Documents" should not be visible
    And the packing list should not contain "Passport"

  @retry(2)
  Scenario: Dragging an item out to Ungrouped and back leaves other ungrouped items in place
    Given I have pre-seeded a section with items and ungrouped items
    When I open the Packing tab
    And I pointer-drag the packing item "Shirt" into the Ungrouped area
    Then the packing item "Shirt" should be in the Ungrouped section
    When I pointer-drag the packing item "Shirt" onto the packing item "Pants"
    Then the packing item "Shirt" should be in the "Clothes" section
    And the packing item "Charger" should be in the Ungrouped section
    And the packing item "Adapter" should be in the Ungrouped section
    When I reload the trip page
    Then the packing item "Charger" should be in the Ungrouped section
    And the packing item "Adapter" should be in the Ungrouped section

  Scenario: Dragging an item into an empty Ungrouped area moves it there
    Given I have pre-seeded a section with no ungrouped items
    When I open the Packing tab
    And I pointer-drag the packing item "Shirt" into the Ungrouped area
    Then the packing item "Shirt" should be in the Ungrouped section
    When I reload the trip page
    Then the packing item "Shirt" should be in the Ungrouped section

  Scenario: Dragging an item across the add input does not pull a neighbor across the section boundary
    Given I have pre-seeded two packing sections
    When I open the Packing tab
    And I pointer-drag the packing item "Toothbrush" onto the packing item "Pants"
    Then the packing item "Toothbrush" should be in the "Clothes" section
    And the packing item "Pants" should be in the "Clothes" section
    And the packing item "Shirt" should be in the "Clothes" section
    And the section "Toiletries" should have no items
    And the packing list should show the label "Toiletries"
