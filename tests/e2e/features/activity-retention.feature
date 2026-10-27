@feat:activity-retention
Feature: Activity retention and physical cleanup
  Scenario: Saving retention persists and records a safe event
    Given I am signed in as an instance "admin"
    And Activity retention starts at 90 days
    When I open the instance Activity page
    And I choose Activity retention of 180 days
    And I save Activity retention
    Then saved Activity retention is 180 days after reload
    And my retention change event contains no private metadata

  Scenario: Cancelled shortening does not save
    Given I am signed in as an instance "admin"
    And Activity retention starts at 90 days
    When I open the instance Activity page
    And I choose Activity retention of 30 days
    And I request shorter Activity retention
    Then Cancel has initial retention confirmation focus
    When I cancel shorter Activity retention
    Then saved Activity retention is 90 days after reload

  Scenario: Keyboard and mobile confirmation
    Given I am signed in as an instance "admin"
    And Activity retention starts at 90 days
    And I am on a mobile viewport
    When I open the instance Activity page
    And I choose shorter retention using keyboard
    And I request shorter Activity retention
    Then retention confirmation is a mobile bottom sheet
    And Cancel has initial retention confirmation focus
    When I dismiss retention confirmation using Escape
    Then retention Save regains focus

  Scenario: Failed save preserves selection and saved policy
    Given I am signed in as an instance "admin"
    And Activity retention starts at 90 days
    When I open the instance Activity page
    And I choose Activity retention of 180 days
    And retention action requests fail
    And I attempt to save Activity retention
    Then retention reports failure and keeps 180 days selected

  Scenario: Lost authority refuses retention save
    Given I am signed in as an instance "admin"
    And Activity retention starts at 90 days
    When I open the instance Activity page
    And I choose Activity retention of 180 days
    And my instance administrator role is removed
    And I save Activity retention
    Then retention reports denied authority

  Scenario: Dynamic requests clean up without new Activity writes
    Given I am signed in as an instance "admin"
    And Activity retention starts at 90 days
    And scenario-owned expired Activity exists
    When I request the dynamic trips page
    Then scenario-owned expired Activity is physically removed

  Scenario Outline: Isolated PostgreSQL retention invariants
    Given an isolated retention database
    Then PostgreSQL retention verifies "<case>"
    Examples:
      | case |
      | migration |
      | cutoff and overlapping batches |
      | bounded oldest deletion |
      | nonwaiting maintenance contention |
      | statement failure isolation |
      | writer first race |
      | cleanup first race |
      | stale policy and rollback |
      | expired history stays readable |
