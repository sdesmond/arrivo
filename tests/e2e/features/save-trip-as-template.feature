@save-trip-as-template
Feature: Save trip packing list as a template

  Background:
    Given I am signed in as the save-template user

  Scenario: Save a trip packing list as a named template
    Given I have a trip with packing items for save-as-template
    When I open the packing tab for the save-template trip
    And I save the packing list as template named "E2E Save Test"
    Then I should see the save-template success feedback
    And the template library should contain "E2E Save Test"

  Scenario: Save button stays disabled when name is empty
    Given I have a trip with packing items for save-as-template
    When I open the packing tab for the save-template trip
    And I open the save-as-template dialog
    And I submit the save dialog without a name
    Then I should see the template name validation error

  Scenario: Original trip list is unchanged after save
    Given I have a trip with packing items for save-as-template
    When I open the packing tab for the save-template trip
    And I save the packing list as template named "Unchanged Test"
    Then the packing tab still shows "Passport"
    And the packing tab still shows "Toothbrush"

  Scenario: Checked items become unchecked in saved template (AC3)
    Given I have a trip with packing items for save-as-template
    When I open the packing tab for the save-template trip
    And I save the packing list as template named "Checked Test"
    Then the saved template should have no checked items
