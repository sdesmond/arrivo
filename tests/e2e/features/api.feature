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
