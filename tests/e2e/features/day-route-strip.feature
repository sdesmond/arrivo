@feat:day-route-strip
Feature: Day route strip
  Background:
    Given I am signed in
    And I have an existing trip with days

  Scenario: A day without multiple located items has no route strip
    Given I am on the trip detail page
    Then no day route strip is visible

  @trip-with-located-events
  Scenario: A day with two or more located items shows a route strip
    Given I am on the trip detail page
    Then a day route strip is visible
