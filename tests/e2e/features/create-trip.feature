@feat:create-trip
Feature: Create Trip

  Background:
    Given I am signed in

  Scenario: Create a trip with a date range navigates to trip page with Day 1 expanded
    When I open the New Trip dialog
    And I type "E2E Date Trip" in the title field
    And I select the default future trip dates
    And I click the Create button
    Then I am on the trip detail page for "E2E Date Trip"
    And Day 1 is expanded

  Scenario: Creating a trip with dates shows staggered day card animation
    When I open the New Trip dialog
    And I type "E2E Animated Trip" in the title field
    And I select the alternate future trip dates
    And I click the Create button
    Then I am on the trip detail page for "E2E Animated Trip"
    And the day cards have the stagger animation class

  Scenario: Create a dateless trip navigates to trip page with Day 1 expanded
    When I open the New Trip dialog
    And I type "E2E Dateless Trip" in the title field
    And I click the Create button
    Then I am on the trip detail page for "E2E Dateless Trip"
    And Day 1 is expanded

  Scenario: Create button shows loading state while submitting
    When I open the New Trip dialog
    And I type "E2E Pending Trip" in the title field
    And I click the Create button
    Then the Create button is not clickable during submission

  Scenario: Create a trip with a destination populates the destination field and creates the trip
    When I open the New Trip dialog
    And I type "E2E Destination Trip" in the title field
    And I type "Par" in the destination field
    And the destination suggestions appear
    And I select the first destination suggestion
    Then the destination field shows the selected place name
    When I click the Create button
    Then I am on the trip detail page for "E2E Destination Trip"
