@feat:schedule-conflict
Feature: Schedule conflict detection
  Background:
    Given I am signed in
    And I have an existing trip with days

  @trip-with-schedule-conflict
  Scenario: Two adjacent timed Located Items with too little travel time show a conflict
    Given I am on the trip detail page
    Then the schedule conflict badge is visible
    And the "Museum" row shows a schedule conflict icon

  @trip-without-schedule-conflict
  Scenario: Two adjacent timed Located Items with plenty of travel time show no conflict
    Given I am on the trip detail page
    Then the schedule conflict badge is not visible
    And the "Museum" row shows no schedule conflict icon

  @trip-with-freeform-between-located-items
  Scenario: A Freeform Item between two Located Items never shows a conflict icon itself
    Given I am on the trip detail page
    Then the schedule conflict badge is visible
    And the "Pack snacks" row shows no schedule conflict icon
