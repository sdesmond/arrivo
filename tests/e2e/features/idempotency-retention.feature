@feat:idempotency-retention
Feature: Idempotency key retention
  Replay records only matter while a retry can still arrive, so maintenance deletes them once they are
  older than the retention window.

  Scenario: Dynamic requests delete expired replay records and keep live ones
    Given I am signed in
    And I have an expired replay record and a live one
    When I request the dynamic trips page
    Then my expired replay record is deleted
    And my live replay record is kept

  Scenario Outline: Isolated PostgreSQL replay record sweep
    Given an isolated idempotency key table
    Then the replay record sweep verifies "<case>"
    Examples:
      | case                        |
      | cutoff                      |
      | more than one batch         |
      | row held by a writer        |
      | statement failure isolation |
