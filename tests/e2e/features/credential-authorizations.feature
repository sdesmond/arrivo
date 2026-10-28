@feat:credential-authorizations
Feature: Purpose-bound credential authorizations
  Scenario: Hash-only lifecycle and replacement rollback
    Given an isolated credential authorization instance
    Then credential issuance stores hashes and validates without consuming
    And credential replacements are atomic and purpose bound

  Scenario: Completion rollback and reset family invalidation
    Given an isolated credential authorization instance
    Then failed credential completion rolls back credentials and authorization
    And completing either reset purpose invalidates both families

  Scenario: Competing completion commits exactly once
    Given an isolated credential authorization instance
    Then concurrent credential completions commit exactly once

  Scenario: Waiting operations recheck authority and expiry
    Given an isolated credential authorization instance
    Then waiting credential issuance rechecks admin authority

  Scenario: Expiry is checked after lock contention
    Given an isolated credential authorization instance
    Then waiting credential completion rechecks expiry

  Scenario: Account deletion cascades all authorizations
    Given an isolated credential authorization instance
    Then deleting credential account removes every authorization
