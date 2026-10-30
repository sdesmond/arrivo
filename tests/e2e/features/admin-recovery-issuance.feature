@feat:admin-recovery-issuance
Feature: Request-independent admin recovery issuance
  Scenario: Hash-only recovery issuance preserves credentials and records operator identity
    Given an isolated admin recovery app
    Then admin recovery stores only a digest with exact purpose and expiry

  Scenario: Recovery replacement is purpose-bound and rolls back atomically
    Given an isolated admin recovery app
    Then admin recovery replacements preserve other purposes and rollback

  Scenario: Invalid origins and ineligible accounts leave no writes
    Given an isolated admin recovery app
    Then admin recovery refuses invalid origins and ineligible targets

  Scenario: Failed Activity cannot undo committed recovery
    Given an isolated admin recovery app
    Then rejected recovery Activity leaves a usable committed link

  Scenario: Concurrent operator issuance serializes replacement
    Given an isolated admin recovery app
    Then concurrent admin recoveries leave exactly one usable link

  Scenario Outline: Waiting issuance refuses stale stable identity
    Given an isolated admin recovery app
    Then waiting admin recovery refuses locked "<mutation>"
    Examples:
      | mutation |
      | demotion |
      | deletion |
      | rename   |
