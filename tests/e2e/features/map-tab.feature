@feat:map-tab
Feature: Map tab
  Background:
    Given I am signed in

  @trip-with-map-pins
  Scenario: A trip with located items renders the map with visible pins
    Given I have an existing trip with days
    When I open the Map tab
    Then the map is visible with located stops

  @trip-with-reservation-map-pin
  Scenario: A trip with a located reservation renders its stop on the map
    Given I have an existing trip with days
    When I open the Map tab
    Then the map is visible with the reservation stop

  Scenario: A trip with zero located items shows the neutral empty state
    Given I have an existing trip with days
    When I open the Map tab
    Then no map is rendered and the located stops empty state is shown

  @map-day-selector
  Scenario: Selecting a day shows only that day's located stops
    Given I have a trip with located stops on two days
    When I open the Map tab
    And I select map scope "Day 1"
    Then only Day 1 located stops are shown on the map

  @map-day-selector
  Scenario: Selecting Whole Trip returns to every located stop
    Given I have a trip with located stops on two days
    When I open the Map tab
    And I select map scope "Day 1"
    And I select map scope "Whole Trip"
    Then every located stop is shown on the map

  @map-day-selector-overflow
  Scenario: Day selector scrolls horizontally with many days
    Given I have a trip with many days
    When I open the Map tab on a narrow viewport
    Then the map day selector is horizontally scrollable

  @map-deep-link
  Scenario: Tapping the Day Route Strip thumbnail deep-links into the Map tab scoped to that day
    Given I have a trip with a routed day and another located stop
    When I tap the day 1 route strip thumbnail
    Then the Map tab is open with day 1 selected
    When I select map scope "Whole Trip"
    Then the Whole Trip scope is selected
