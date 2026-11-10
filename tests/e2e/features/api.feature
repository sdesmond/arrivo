@feat:api
Feature: Absolute checklist checked-state API
  Background:
    Given a scenario-owned checklist API item

  Scenario Outline: Distinct-trip lifecycle UUID races serialize globally
    When I concurrently create lifecycle checklists in distinct trips sharing a "<resource>" UUID
    Then the cross-trip lifecycle collision has one winner and an untouched loser
    Examples:
      | resource   |
      | checklist  |
      | first-item |

  Scenario: Lifecycle create and concurrent UUID retries preserve mixed ordering
    Given my checklist API role is "editor"
    When I create a checklist with its first item through the lifecycle API concurrently
    Then lifecycle creation persists once with mixed timeline ordering after reload
    When I reuse the lifecycle checklist UUID with different content
    Then the lifecycle API returns 409

  Scenario: Lifecycle title partial updates and repeated deletion persist
    Given my checklist API role is "editor"
    When I create a checklist with its first item through the lifecycle API concurrently
    And I rename, omit and clear the lifecycle checklist title
    Then the lifecycle checklist title is cleared after reload
    When I delete the lifecycle checklist twice
    Then the lifecycle checklist is absent after reload

  Scenario Outline: Lifecycle authorization loss denies keyed creation replay
    When I create a keyed lifecycle checklist
    And my checklist API role is "<role>"
    And I retry the keyed lifecycle creation
    Then the lifecycle API returns <status>
    Examples:
      | role     | status |
      | viewer   | 403    |
      | stranger | 404    |

  Scenario: Lifecycle replay failure rolls creation and timeline shifts back
    Given the checklist API replay record write is set to fail
    When I attempt keyed lifecycle creation
    Then the lifecycle API returns 500
    And lifecycle creation left no rows or timeline shifts
    When the checklist API replay record write is repaired
    And I create a keyed lifecycle checklist
    Then lifecycle creation persists once with mixed timeline ordering after reload

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

  Scenario Outline: Metadata is public and identical with or without a session
    Given I am "<audience>" for the API metadata
    When I request the API metadata
    Then the API metadata is exactly the public version and capabilities
    Examples:
      | audience  |
      | anonymous |
      | signed-in |

  Scenario: Item creation with a client UUID is retry-safe and rejects UUID reuse
    Given my checklist API role is "editor"
    When I create a checklist item with a client UUID concurrently
    Then the checklist item persists once after the original item after reload
    When I reuse the checklist item UUID with different content
    Then the lifecycle API returns 409
    And the checklist item keeps its original content

  Scenario Outline: Distinct-trip item UUID races serialize globally
    When I concurrently create checklist items in distinct trips sharing a "<resource>" UUID
    Then the cross-trip item collision has one winner and an untouched loser
    Examples:
      | resource   |
      | item       |
      | first-item |

  Scenario: Item partial updates preserve omitted fields and reject invalid bodies
    Given my checklist API role is "editor"
    When I patch the checklist item content, checked state and an empty body
    Then the checklist item has the patched content and checked state after reload

  Scenario: Item deletion is concealed across trips and repeatable
    Given my checklist API role is "editor"
    When I delete the checklist item with the wrong trip and then twice
    Then the checklist item is absent after reload

  Scenario Outline: Denied item writes leave the checklist unchanged
    Given my checklist API role is "<role>"
    When I attempt the checklist item API operation "<operation>"
    Then the checklist item API returns <status> with code "<code>" and the item list is unchanged
    Examples:
      | role      | operation | status | code            |
      | viewer    | create    | 403    | forbidden       |
      | viewer    | delete    | 403    | forbidden       |
      | stranger  | create    | 404    | not_found       |
      | stranger  | delete    | 404    | not_found       |
      | anonymous | create    | 401    | unauthenticated |
      | anonymous | delete    | 401    | unauthenticated |

  Scenario: Keyed item creation replays one row and rejects a changed body
    Given my checklist API role is "editor"
    When I send 2 keyed checklist item creations one after another
    Then exactly one checklist item was created for that key
    When I reuse the item creation key with different content
    Then the checklist item API returns 409 with code "conflict" and no new item

  Scenario Outline: Lost access never replays a cached item creation
    Given my checklist API role is "editor"
    When I send 1 keyed checklist item creations one after another
    And my checklist API role is "<role>"
    And I retry the keyed checklist item creation
    Then the checklist item retry returns <status> with code "<code>" and no extra item
    Examples:
      | role     | status | code      |
      | viewer   | 403    | forbidden |
      | stranger | 404    | not_found |

  Scenario Outline: Packing source creation copies ordered unchecked items and keeps later appends last
    Given my checklist API role is "editor"
    And a scenario-owned "<source>" packing source
    When I create a checklist from that source through the API 3 times concurrently
    Then the source checklist persists once with ordered unchecked items and shifted timeline after reload
    When I append an item to the source checklist through the API
    Then the appended item sorts after every copied item
    When I reuse the source checklist UUID at a different position
    Then the lifecycle API returns 409
    And the source checklist keeps its single set of items
    Examples:
      | source       |
      | template     |
      | packing-list |

  Scenario Outline: Keyed source creation replays the original after the source changes
    Given my checklist API role is "editor"
    And a scenario-owned "<source>" packing source
    When I create a keyed checklist from that source
    And the packing source is renamed
    And I retry the keyed source creation
    Then the keyed source retry returns the original checklist and no extra rows
    Examples:
      | source       |
      | template     |
      | packing-list |

  Scenario Outline: Lost source access never replays a cached source creation
    Given my checklist API role is "editor"
    And a scenario-owned "<source>" packing source
    When I create a keyed checklist from that source
    And the packing source is deleted
    And I retry the keyed source creation
    Then the keyed source retry is concealed as 404 and leaks no cached checklist
    Examples:
      | source       |
      | template     |
      | packing-list |

  Scenario Outline: Source creation outside the actor's reach changes nothing
    Given my checklist API role is "editor"
    And a scenario-owned "template" packing source
    When I attempt a source checklist creation with a "<case>" source
    Then the lifecycle API returns 404
    And the source creation changed no rows or positions
    Examples:
      | case             |
      | foreign-template |
      | missing-template |
      | other-trip-list  |
      | other-trip-day   |

  Scenario Outline: Denied source creation leaves the timeline unchanged
    Given a scenario-owned "template" packing source
    And my checklist API role is "<role>"
    When I attempt a source checklist creation
    Then the lifecycle API returns <status>
    And the source creation changed no rows or positions
    Examples:
      | role      | status |
      | viewer    | 403    |
      | stranger  | 404    |
      | anonymous | 401    |

  Scenario Outline: Denied lifecycle writes leave the timeline unchanged
    Given my checklist API role is "<role>"
    When I submit "valid" to the "<endpoint>" checklist endpoint
    Then the checklist write endpoint returns <status> with code "<code>" and changed nothing
    Examples:
      | role      | endpoint         | status | code            |
      | viewer    | lifecycle-create | 403    | forbidden       |
      | viewer    | lifecycle-rename | 403    | forbidden       |
      | viewer    | lifecycle-delete | 403    | forbidden       |
      | stranger  | lifecycle-create | 404    | not_found       |
      | stranger  | lifecycle-rename | 404    | not_found       |
      | stranger  | lifecycle-delete | 404    | not_found       |
      | anonymous | lifecycle-create | 401    | unauthenticated |
      | anonymous | lifecycle-rename | 401    | unauthenticated |
      | anonymous | lifecycle-delete | 401    | unauthenticated |

  Scenario Outline: Bad input and CSRF never write through the lifecycle, item and source endpoints
    Given a scenario-owned "template" packing source
    When I submit "<case>" to the "<endpoint>" checklist endpoint
    Then the checklist write endpoint returns <status> with code "<code>" and changed nothing
    Examples:
      | endpoint         | case         | status | code              |
      | lifecycle-create | malformed    | 400    | bad_request       |
      | lifecycle-create | non-object   | 400    | bad_request       |
      | lifecycle-create | invalid-body | 422    | validation_failed |
      | lifecycle-create | no-header    | 403    | forbidden         |
      | lifecycle-create | wrong-type   | 403    | forbidden         |
      | lifecycle-create | cross-origin | 403    | forbidden         |
      | lifecycle-rename | malformed    | 400    | bad_request       |
      | lifecycle-rename | non-object   | 400    | bad_request       |
      | lifecycle-rename | invalid-body | 422    | validation_failed |
      | lifecycle-rename | no-header    | 403    | forbidden         |
      | lifecycle-rename | wrong-type   | 403    | forbidden         |
      | lifecycle-rename | cross-origin | 403    | forbidden         |
      | lifecycle-delete | malformed    | 400    | bad_request       |
      | lifecycle-delete | non-object   | 400    | bad_request       |
      | lifecycle-delete | invalid-body | 422    | validation_failed |
      | lifecycle-delete | no-header    | 403    | forbidden         |
      | lifecycle-delete | wrong-type   | 403    | forbidden         |
      | lifecycle-delete | cross-origin | 403    | forbidden         |
      | item-create      | malformed    | 400    | bad_request       |
      | item-create      | non-object   | 400    | bad_request       |
      | item-create      | invalid-body | 422    | validation_failed |
      | item-create      | no-header    | 403    | forbidden         |
      | item-create      | wrong-type   | 403    | forbidden         |
      | item-create      | cross-origin | 403    | forbidden         |
      | item-delete      | malformed    | 400    | bad_request       |
      | item-delete      | non-object   | 400    | bad_request       |
      | item-delete      | invalid-body | 422    | validation_failed |
      | item-delete      | no-header    | 403    | forbidden         |
      | item-delete      | wrong-type   | 403    | forbidden         |
      | item-delete      | cross-origin | 403    | forbidden         |
      | source-create    | malformed    | 400    | bad_request       |
      | source-create    | non-object   | 400    | bad_request       |
      | source-create    | invalid-body | 422    | validation_failed |
      | source-create    | no-header    | 403    | forbidden         |
      | source-create    | wrong-type   | 403    | forbidden         |
      | source-create    | cross-origin | 403    | forbidden         |

  Scenario Outline: Reusing an idempotency key for a different body conflicts
    Given a scenario-owned "template" packing source
    When I send keyed "<operation>" and then reuse its key with a different body
    Then the reused key returns 409 with code "conflict" and the first write stands
    Examples:
      | operation        |
      | lifecycle-create |
      | lifecycle-rename |
      | source-create    |

  Scenario: Editor partially edits a scheduled event and clears fields with null
    Given scenario-owned scheduled and day-less events for the event API
    And my checklist API role is "editor"
    When I patch the "scheduled" event through the event API with:
      """
      { "name": "Renamed dinner", "locationName": "New bistro" }
      """
    Then the event API returns 200
    And after reload the "scheduled" event is stored as:
      """
      {
        "name": "Renamed dinner",
        "locationName": "New bistro",
        "locationAddress": "1 API St",
        "note": "API note",
        "confirmationNumber": "API123",
        "startAt": "2026-08-02T19:00:00.000Z"
      }
      """
    When I patch the "scheduled" event through the event API with:
      """
      { "note": null, "confirmationNumber": null, "startAt": "" }
      """
    Then the event API returns 200
    And after reload the "scheduled" event is stored as:
      """
      { "name": "Renamed dinner", "locationName": "New bistro", "note": null, "confirmationNumber": null, "startAt": null }
      """
    When I patch the "scheduled" event through the event API with:
      """
      {}
      """
    Then the event API returns 200
    And the "scheduled" event is stored as:
      """
      { "name": "Renamed dinner", "note": null, "startAt": null }
      """

  Scenario: Editor edits a day-less event
    Given scenario-owned scheduled and day-less events for the event API
    And my checklist API role is "editor"
    When I patch the "day-less" event through the event API with:
      """
      { "name": "Renamed floating", "note": null }
      """
    Then the event API returns 200
    And after reload the "day-less" event is stored as:
      """
      { "name": "Renamed floating", "note": null, "dayId": null }
      """

  Scenario Outline: Denied event edits leave the event unchanged
    Given scenario-owned scheduled and day-less events for the event API
    And my checklist API role is "<role>"
    When I patch the "scheduled" event through the event API with:
      """
      { "name": "Hacked" }
      """
    Then the event API returns <status> with code "<code>"
    And the "scheduled" event is stored as:
      """
      { "name": "API dinner", "note": "API note" }
      """
    Examples:
      | role      | status | code            |
      | viewer    | 403    | forbidden       |
      | stranger  | 404    | not_found       |
      | anonymous | 401    | unauthenticated |

  Scenario Outline: Invalid event edits never write
    Given scenario-owned scheduled and day-less events for the event API
    And my checklist API role is "editor"
    When I submit event API case "<case>"
    Then the event API returns 422 with code "validation_failed"
    And the "scheduled" event is stored as:
      """
      { "name": "API dinner", "note": "API note" }
      """
    Examples:
      | case         |
      | blank-name   |
      | null-name    |
      | bad-latitude |
      | unknown-key  |
      | position-key |
      | linked-id    |
      | malformed-id |

  Scenario: Keyed event edits replay once and conflict on a different body
    Given scenario-owned scheduled and day-less events for the event API
    And my checklist API role is "editor"
    When I send the keyed "scheduled" event edit "Keyed name" twice
    Then both keyed event edits return identical JSON naming "Keyed name"
    When I reuse the event edit key with the name "Other name"
    Then the event API returns 409 with code "conflict"
    And the "scheduled" event is stored as:
      """
      { "name": "Keyed name" }
      """
