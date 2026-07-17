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
