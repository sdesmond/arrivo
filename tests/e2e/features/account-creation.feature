@feat:account-creation
Feature: Admin account creation with a setup link
  Scenario: Creating an account stores only the setup digest
    Given an isolated account creation instance
    Then adding a user creates a passwordless member with a hashed 24-hour setup authorization

  Scenario: A taken username is refused without a second account
    Given an isolated account creation instance
    Then adding a taken username in any case creates no account or authorization

  Scenario: Concurrent adds of one username create exactly one account
    Given an isolated account creation instance
    Then two concurrent adds of the same username commit exactly once

  Scenario: An admin demoted while waiting is refused
    Given an isolated account creation instance
    Then an add waiting behind the actor's demotion is refused with no account

  Scenario: A failed authorization rolls the account back
    Given an isolated account creation instance
    Then a failing setup authorization insert leaves no account behind
