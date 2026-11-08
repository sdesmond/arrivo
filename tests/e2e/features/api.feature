@feat:api
Feature: Absolute checklist checked-state API
  Background:
    Given a scenario-owned checklist API item

  Scenario: Editor writes absolute true and false with persistence
    Given my checklist API role is "editor"
    When I set the checklist API checked state to "true" twice
    Then the checklist API state "true" persists after reload
    When I set the checklist API checked state to "false" twice
    Then the checklist API state "false" persists after reload

  Scenario: UI uncheck persists after PATCH and reload
    When I set the checklist API checked state to "true" twice
    Then the checklist API state "true" persists after reload
    When I uncheck the checklist item through the UI
    Then the checklist API state "false" persists after reload

  Scenario: Revoked session cookie cannot write
    Given my checklist API session has been revoked
    When I attempt a checklist API write
    Then the checklist API returns 401 with code "unauthenticated" and no write

  Scenario Outline: Denied writes leave state unchanged
    Given my checklist API role is "<role>"
    When I attempt a checklist API write
    Then the checklist API returns <status> with code "<code>" and no write
    Examples:
      | role      | status | code            |
      | viewer    | 403    | forbidden       |
      | stranger  | 404    | not_found       |
      | anonymous | 401    | unauthenticated |

  Scenario Outline: Bad input and CSRF never write
    When I submit checklist API case "<case>"
    Then the checklist API returns <status> with code "<code>" and no write
    Examples:
      | case         | status | code              |
      | malformed    | 400    | bad_request       |
      | non-object   | 400    | bad_request       |
      | invalid-body | 422    | validation_failed |
      | invalid-id   | 422    | validation_failed |
      | missing-item | 404    | not_found         |
      | no-header    | 403    | forbidden         |
      | wrong-type   | 403    | forbidden         |
      | cross-origin | 403    | forbidden         |
      | same-site    | 403    | forbidden         |

  Scenario: Sequential keyed retry replays the first result
    Given the checklist API write audit is installed
    When I send 2 keyed checklist API writes of "true" one after another
    Then every keyed checklist API response succeeded with identical JSON and state "true"
    And the checklist API audit shows 1 committed update and 1 replay record

  Scenario: Concurrent keyed retries commit one write
    Given the checklist API write audit is installed
    When I send 4 keyed checklist API writes of "true" at the same time
    Then every keyed checklist API response succeeded with identical JSON and state "true"
    And the checklist API state "true" persists after reload
    And the checklist API audit shows 1 committed update and 1 replay record

  Scenario Outline: Reusing a key for a different request conflicts
    Given the checklist API write audit is installed
    When I send 1 keyed checklist API write of "true" one after another
    And I reuse the checklist API key for a different <change>
    Then the checklist API returns 409 with code "conflict" and no cached result
    And the checklist API audit shows 1 committed update and 1 replay record
    Examples:
      | change   |
      | payload  |
      | resource |

  Scenario: Expired keys execute again and replace the record
    Given the checklist API write audit is installed
    When I send 1 keyed checklist API write of "true" one after another
    And the keyed checklist API record has expired
    And I send 1 keyed checklist API write of "false" one after another
    Then every keyed checklist API response succeeded with identical JSON and state "false"
    And the checklist API audit shows 2 committed updates and 1 replay record

  Scenario Outline: Lost access never replays a cached result
    Given the checklist API write audit is installed
    When I send 1 keyed checklist API write of "true" one after another
    And my checklist API role is "<role>"
    And I retry the keyed checklist API write of "true"
    Then the checklist API returns <status> with code "<code>" and no cached result
    Examples:
      | role     | status | code      |
      | viewer   | 403    | forbidden |
      | stranger | 404    | not_found |

  Scenario: Replay returns the original JSON after an intervening opposite write
    Given the checklist API write audit is installed
    When I send 1 keyed checklist API write of "true" one after another
    And I send an unkeyed checklist API write of "false"
    And I retry the keyed checklist API write of "true"
    Then the retried keyed checklist API response equals the first with state "true"
    And the stored checklist API state is "false"
    And the checklist API audit shows 2 committed updates and 1 replay record

  Scenario: A failed replay record write rolls the mutation back and a retry succeeds
    Given the checklist API write audit is installed
    And the checklist API replay record write is set to fail
    When I send 1 keyed checklist API write of "true" one after another
    Then the checklist API returns 500 with code "server_error" and no write
    And the checklist API audit shows 0 committed updates and 0 replay records
    When the checklist API replay record write is repaired
    And I retry the keyed checklist API write of "true"
    Then every keyed checklist API response succeeded with identical JSON and state "true"
    And the checklist API audit shows 1 committed update and 1 replay record

  Scenario: A retry blocked behind an in-flight twin gets a retryable 409
    Given the checklist API write audit is installed
    And another request holds the checklist API key lock
    When I send 1 keyed checklist API write of "true" one after another
    Then the checklist API returns 409 with code "conflict" and no cached result
    And the checklist API audit shows 0 committed updates and 0 replay records
    When the checklist API key lock is released
    And I retry the keyed checklist API write of "true"
    Then every keyed checklist API response succeeded with identical JSON and state "true"
    And the checklist API audit shows 1 committed update and 1 replay record

  Scenario Outline: Invalid idempotency keys never write
    When I send a checklist API write with an <kind> idempotency key
    Then the checklist API returns 422 with code "validation_failed" and no write
    Examples:
      | kind      |
      | empty     |
      | oversized |
