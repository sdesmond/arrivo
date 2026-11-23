@feat:template-reuse
Feature: Reuse one packing template end to end

  Background:
    Given I am signed in as the save-template user

  Scenario: A saved and edited template is reused as a trip list and a checklist, then survives its own deletion
    Given I have a trip with the lists "Carry-on" and "Extra" for template reuse
    When I open the packing tab for the save-template trip
    And I open the save-as-template dialog
    Then the save dialog announces 2 items
    When I confirm the save dialog with the name "Reuse Kit"
    Then the template "Reuse Kit" holds exactly "Passport" and "Toothbrush"
    When I open the template editor for "Reuse Kit"
    Then the template editor shows no checked items
    When I edit the template item "Toothbrush" to "Electric toothbrush"
    And I add the template label "Documents"
    Then the template "Reuse Kit" stores the items "Passport, Electric toothbrush" and the label "Documents"
    When I pull the template "Reuse Kit" onto the packing list "Extra"
    And I open day 1 in the itinerary
    And I click Add and select the packing list picker
    And I select the template "Reuse Kit" from the picker
    Then a checklist titled "Reuse Kit" should appear in day 1
    When I open the templates page
    And I delete the packing template "Reuse Kit"
    Then I should not see the packing template "Reuse Kit"
    And the template "Reuse Kit" no longer exists
    When I reopen and reload the reuse trip
    Then after reload the packing list "Extra" holds "Sunscreen, Camera, Charger, Passport, Electric toothbrush" in that order
    And after reload the "Reuse Kit" checklist keeps "Passport, Electric toothbrush" unchecked in that order
