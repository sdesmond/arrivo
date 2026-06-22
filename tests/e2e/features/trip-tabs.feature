@feat:trip-tabs
Feature: Trip detail tab deep links
  Background:
    Given I am signed in

  Scenario: A trip deep link opens directly on the requested tab and survives refresh
    Given I have an existing trip
    When I reopen the trip with the "Documents" tab deep link
    Then the "Documents" tab content is visible
    And the trip URL has the "Documents" tab deep link
    When I reload the browser page
    Then the "Documents" tab content is visible
    And the trip URL has the "Documents" tab deep link

  Scenario: Browser history restores previous tab selections
    Given I have an existing trip
    When I open the "Packing" trip tab
    Then the "Packing" tab content is visible
    And the trip URL has the "Packing" tab deep link
    When I open the "Itinerary" trip tab
    Then the "Itinerary" tab content is visible
    And the trip URL has no tab deep link
    When I go back in the browser
    Then the "Packing" tab content is visible
    And the trip URL has the "Packing" tab deep link
    When I go forward in the browser
    Then the "Itinerary" tab content is visible
    And the trip URL has no tab deep link
