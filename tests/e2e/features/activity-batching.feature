@feat:activity-batching
Feature: Activity edit batching
  The merge service runs directly against an isolated database schema, so concurrent writers and the shared table never interfere.

  Scenario: Edits exactly ten minutes apart become one row
    Given an isolated Activity store
    When alice edits trip Lisbon at offsets "0,600000" ms
    Then the store holds 1 row
    And the row for alice on trip Lisbon spans "0" to "600000" ms

  Scenario: An earlier edit exactly ten minutes before a row joins it
    Given an isolated Activity store
    When alice edits trip Lisbon at offsets "600000,0" ms
    Then the store holds 1 row
    And the row for alice on trip Lisbon spans "0" to "600000" ms

  Scenario: An earlier edit one millisecond past ten minutes before a row stays separate
    Given an isolated Activity store
    When alice edits trip Lisbon at offsets "600001,0" ms
    Then the store holds 2 rows

  Scenario: Edits at 0, 10 and 20 minutes give one row in a different arrival order
    Given an isolated Activity store
    When alice edits trip Lisbon at offsets "600000,1200000,0" ms
    Then the store holds 1 row
    And the row for alice on trip Lisbon spans "0" to "1200000" ms

  Scenario: A gap one millisecond past ten minutes starts a second row
    Given an isolated Activity store
    When alice edits trip Lisbon at offsets "0,600001" ms
    Then the store holds 2 rows

  Scenario: A late-arriving edit bridges two earlier rows
    Given an isolated Activity store
    When alice edits trip Lisbon at offsets "0,1200000,600000" ms
    Then the store holds 1 row
    And the row for alice on trip Lisbon spans "0" to "1200000" ms

  Scenario: A late-arriving edit inside a row never shrinks it
    Given an isolated Activity store
    When alice edits trip Lisbon at offsets "0,300000,600000,150000" ms
    Then the store holds 1 row
    And the row for alice on trip Lisbon spans "0" to "600000" ms

  Scenario: Edits arriving at the same time leave one row
    Given an isolated Activity store
    When alice edits trip Lisbon at offsets "0" and "300000" ms at the same time
    Then the store holds 1 row
    And the row for alice on trip Lisbon spans "0" to "300000" ms

  Scenario: Different actors and trips are never merged
    Given an isolated Activity store
    When alice edits trip Lisbon at offsets "0" ms
    And bob edits trip Lisbon at offsets "60000" ms
    And alice edits trip Porto at offsets "120000" ms
    Then the store holds 3 rows

  Scenario: A rename starts a new row and renaming back rejoins the first
    Given an isolated Activity store
    When alice edits trip Lisbon at offsets "0" ms
    And alice edits trip Lisbon as username "alice2" at offsets "300000" ms
    And alice edits trip Lisbon at offsets "480000" ms
    Then the store holds 2 rows
    And the row for alice on trip Lisbon spans "0" to "480000" ms
    And the row for username alice2 spans "300000" to "300000" ms

  Scenario: A burst of edits stores only the summary row
    Given an isolated Activity store
    When alice edits trip Lisbon at offsets "0,60000,120000,180000,240000" ms
    Then the store holds 1 row
