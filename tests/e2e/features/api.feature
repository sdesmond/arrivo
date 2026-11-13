@feat:api
Feature: Absolute checklist checked-state API
  Background:
    Given a scenario-owned checklist API item

  Scenario Outline: Cached itinerary replay denies access lost after a successful write
    Given the mixed day for the day order API
    And scenario-owned trip notes for the trip note API
    And my checklist API role is "editor"
    When I commit the keyed itinerary operation "<operation>"
    And my checklist API role is "<role>"
    And I replay the exact committed itinerary request
    Then the itinerary replay returns <status> with code "<code>" and preserves the committed snapshot
    Examples:
      | operation        | role     | status | code      |
      | event-create     | viewer   | 403    | forbidden |
      | event-create     | stranger | 404    | not_found |
      | event-edit       | viewer   | 403    | forbidden |
      | event-edit       | stranger | 404    | not_found |
      | event-delete     | viewer   | 403    | forbidden |
      | event-delete     | stranger | 404    | not_found |
      | day-order        | viewer   | 403    | forbidden |
      | day-order        | stranger | 404    | not_found |
      | day-note-create  | viewer   | 403    | forbidden |
      | day-note-create  | stranger | 404    | not_found |
      | day-note-edit    | viewer   | 403    | forbidden |
      | day-note-edit    | stranger | 404    | not_found |
      | day-note-delete  | viewer   | 403    | forbidden |
      | day-note-delete  | stranger | 404    | not_found |
      | trip-note-create | viewer   | 403    | forbidden |
      | trip-note-create | stranger | 404    | not_found |
      | trip-note-edit   | viewer   | 403    | forbidden |
      | trip-note-edit   | stranger | 404    | not_found |
      | trip-note-delete | viewer   | 403    | forbidden |
      | trip-note-delete | stranger | 404    | not_found |
      | trip-note-order  | viewer   | 403    | forbidden |
      | trip-note-order  | stranger | 404    | not_found |
      | day-edit         | viewer   | 403    | forbidden |
      | day-edit         | stranger | 404    | not_found |
      | day-append       | viewer   | 403    | forbidden |
      | day-append       | stranger | 404    | not_found |
      | day-delete       | viewer   | 403    | forbidden |
      | day-delete       | stranger | 404    | not_found |

  Scenario: Changed day order with the same key conflicts and preserves the first order
    Given the mixed day for the day order API
    And my checklist API role is "editor"
    When I PUT the reversed day order with an Idempotency-Key
    Then the day order API returns 200
    And after reload the day stores the reversed order
    When I PUT the original day order with the same Idempotency-Key
    Then the day order API returns 409 with code "conflict"
    And after reload the day stores the reversed order

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

  Scenario: Lifecycle UUID retry after another insert shifted the position replays the stored checklist
    Given my checklist API role is "editor"
    When I create a checklist with its first item through the lifecycle API concurrently
    And I create another checklist at the lifecycle position
    And I retry the lifecycle checklist creation
    Then the lifecycle retry returns the original checklist at its shifted position
    And the day holds the original and the shifting checklist once after reload

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
    And I resend the same checklist item content and checked state
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

  Scenario: Editor reorders a mixed day through the API and a keyed retry replays without writing
    Given my checklist API role is "editor"
    And the mixed day for the day order API
    When I PUT the reversed day order with an Idempotency-Key
    Then the day order API returns 200
    And after reload the day stores the reversed order
    And the day order API response lists the reversed order
    When another editor stores the original day order directly
    And I retry the same keyed day order PUT
    Then the day order API returns 200
    And the day stores the original order

  Scenario: A list already in stored order succeeds without changing the day
    Given my checklist API role is "editor"
    And the mixed day for the day order API
    When I PUT the stored day order
    Then the day order API returns 200
    And the day stores the original order

  Scenario Outline: A stale or foreign day order list is a conflict that writes nothing
    Given my checklist API role is "editor"
    And the mixed day for the day order API
    When I PUT the day order case "<case>"
    Then the day order API returns 409 with code "conflict"
    And the day stores the original order
    And the untouched day is unchanged
    Examples:
      | case         |
      | missing-item |
      | extra-item   |
      | foreign-item |
      | wrong-type   |

  Scenario: A repeated item in a day order list is rejected before any write
    Given my checklist API role is "editor"
    And the mixed day for the day order API
    When I PUT the day order case "duplicate"
    Then the day order API returns 422 with code "validation_failed"
    And the day stores the original order

  Scenario Outline: Denied day order writes leave the day unchanged
    Given my checklist API role is "<role>"
    And the mixed day for the day order API
    When I PUT the reversed day order
    Then the day order API returns <status> with code "<code>"
    And the day stores the original order
    Examples:
      | role      | status | code            |
      | viewer    | 403    | forbidden       |
      | stranger  | 404    | not_found       |
      | anonymous | 401    | unauthenticated |

  Scenario: Editor inserts events after an event, at a position and at the end through the API
    Given my checklist API role is "editor"
    And the mixed day for the day order API
    When I create the event "After first" after the first event through the day API
    Then the event create API returns 200
    And after reload the event "After first" sits at timeline index 1
    When I create the event "At front" at position 0 through the day API
    Then the event create API returns 200
    And after reload the event "At front" sits at timeline index 0
    When I create the event "At end" at the end through the day API
    Then the event create API returns 200
    And after reload the event "At end" sits at timeline index 6

  Scenario: A same-ID event create replays after another insert shifted it and rejects reuse
    Given my checklist API role is "editor"
    And the mixed day for the day order API
    When I create the event "Retry me" with a client ID at position 1 through the day API
    And I create the event "Shifter" at position 1 through the day API
    And I retry the client ID event creation
    Then the retried event keeps its shifted position and the day holds it once
    When I reuse the client ID for the event "Different"
    Then the event create API returns 409 with code "conflict"
    And the day holds the client ID event once

  Scenario: Keyed event creates replay once and conflict on a different body
    Given my checklist API role is "editor"
    And the mixed day for the day order API
    When I send the keyed event create "Keyed stop" twice
    Then both keyed event creates return identical JSON naming "Keyed stop"
    And the day holds 1 event named "Keyed stop"
    When I reuse the event create key with the name "Other stop"
    Then the event create API returns 409 with code "conflict"
    And the day holds 1 event named "Keyed stop"

  Scenario: An event create on a day that no longer exists is not found
    Given my checklist API role is "editor"
    And the mixed day for the day order API
    When I create the event "Orphan" on a day that no longer exists
    Then the event create API returns 404 with code "not_found"

  Scenario Outline: Denied event creates leave the day unchanged
    Given my checklist API role is "<role>"
    And the mixed day for the day order API
    When I create the event "Denied" at the end through the day API
    Then the event create API returns <status> with code "<code>"
    And the day stores the original order
    Examples:
      | role      | status | code            |
      | viewer    | 403    | forbidden       |
      | stranger  | 404    | not_found       |
      | anonymous | 401    | unauthenticated |

  Scenario Outline: Invalid event creates never write
    Given my checklist API role is "editor"
    And the mixed day for the day order API
    When I submit event create case "<case>"
    Then the event create API returns 422 with code "validation_failed"
    And the day stores the original order
    Examples:
      | case              |
      | blank-name        |
      | null-field        |
      | unknown-key       |
      | linked-day        |
      | linked-event-id   |
      | linked-after-id   |
      | negative-position |

  Scenario: Editor deletes events keeping and discarding documents and the discarded file is removed
    Given scenario-owned events with documents for the event delete API
    And my checklist API role is "editor"
    When I delete the "keep" event through the event delete API
    Then the event delete API returns 204
    And after reload the "keep" event is gone and its document is a trip document with its file kept
    When I delete the "discard" event through the event delete API
    Then the event delete API returns 204
    And after reload the "discard" event, its document and its expense are gone and its file is removed
    And no file deletion is left queued

  Scenario: A file left queued by a crash is removed by the next maintenance pass
    Given a stored file is left queued for deletion
    When I open the app
    Then the queued file and its queue row are removed

  Scenario: Editor deletes a day-less event
    Given scenario-owned events with documents for the event delete API
    And my checklist API role is "editor"
    When I delete the "day-less" event through the event delete API
    Then the event delete API returns 204
    And the "day-less" event is gone

  Scenario: Repeated and keyed event deletes succeed without further effect
    Given scenario-owned events with documents for the event delete API
    And my checklist API role is "editor"
    When I send the keyed "discard" event delete twice
    Then both keyed event deletes return 204
    And the "discard" event is gone
    When I delete the "discard" event through the event delete API
    Then the event delete API returns 204

  Scenario: A failed replay record write rolls an event delete back and keeps its file
    Given scenario-owned events with documents for the event delete API
    And my checklist API role is "editor"
    And the checklist API replay record write is set to fail
    When I send the keyed "discard" event delete twice
    Then the event delete API returns 500 with code "server_error"
    And the "discard" event, its document and its file are untouched
    When the checklist API replay record write is repaired
    And I send the keyed "discard" event delete twice
    Then both keyed event deletes return 204
    And the "discard" event is gone

  Scenario Outline: Denied event deletes leave the event and its documents unchanged
    Given scenario-owned events with documents for the event delete API
    And my checklist API role is "<role>"
    When I delete the "discard" event through the event delete API
    Then the event delete API returns <status> with code "<code>"
    And the "discard" event, its document and its file are untouched
    Examples:
      | role      | status | code            |
      | viewer    | 403    | forbidden       |
      | stranger  | 404    | not_found       |
      | anonymous | 401    | unauthenticated |

  Scenario Outline: Invalid event deletes never write
    Given scenario-owned events with documents for the event delete API
    And my checklist API role is "editor"
    When I submit event delete case "<case>"
    Then the event delete API returns 422 with code "validation_failed"
    And the "discard" event, its document and its file are untouched
    Examples:
      | case               |
      | missing-trip       |
      | linked-id          |
      | non-boolean-keep   |
      | unknown-key        |

  Scenario: Editor inserts notes at a position and at the end through the API among events and checklists
    Given my checklist API role is "editor"
    And the mixed day for the day order API
    When I create the note "At front" at position 0 through the day API
    Then the note API returns 200
    And after reload the note "At front" sits at timeline index 0
    When I create the note "Between" at position 3 through the day API
    Then the note API returns 200
    And after reload the note "Between" sits at timeline index 3
    When I create the note "At end" at the end through the day API
    Then the note API returns 200
    And after reload the note "At end" sits at timeline index 6
    And the original items keep their relative order

  Scenario: A same-ID note create replays after another insert shifted it and rejects reuse
    Given my checklist API role is "editor"
    And the mixed day for the day order API
    When I create the note "Retry me" with a client ID at position 1 through the day API
    And I create the note "Shifter" at position 1 through the day API
    And I retry the client ID note creation
    Then the retried note keeps its shifted position and the day holds it once
    When I reuse the client ID for the note "Different"
    Then the note API returns 409 with code "conflict"
    And the day holds the client ID note once

  Scenario: Keyed note creates replay once and conflict on a different body
    Given my checklist API role is "editor"
    And the mixed day for the day order API
    When I send the keyed note create "Keyed note" twice
    Then both keyed note requests return identical JSON naming "Keyed note"
    And the day holds 1 note with the content "Keyed note"
    When I reuse the note create key with the content "Other note"
    Then the note API returns 409 with code "conflict"
    And the day holds 1 note with the content "Keyed note"

  Scenario: A note create on a day that no longer exists is not found
    Given my checklist API role is "editor"
    And the mixed day for the day order API
    When I create the note "Orphan" on a day that no longer exists
    Then the note API returns 404 with code "not_found"

  Scenario Outline: Denied note creates leave the day unchanged
    Given my checklist API role is "<role>"
    And the mixed day for the day order API
    When I create the note "Denied" at the end through the day API
    Then the note API returns <status> with code "<code>"
    And the day stores the original order
    Examples:
      | role      | status | code            |
      | viewer    | 403    | forbidden       |
      | stranger  | 404    | not_found       |
      | anonymous | 401    | unauthenticated |

  Scenario Outline: Invalid note creates never write
    Given my checklist API role is "editor"
    And the mixed day for the day order API
    When I submit note create case "<case>"
    Then the note API returns 422 with code "validation_failed"
    And the day stores the original order
    Examples:
      | case              |
      | missing-content   |
      | over-long-content |
      | non-text-content  |
      | unknown-key       |
      | linked-day        |
      | linked-note-id    |
      | negative-position |

  Scenario: Editor edits a note and repeating the same text writes nothing
    Given my checklist API role is "editor"
    And the mixed day for the day order API
    When I patch the existing note with "Edited note"
    Then the note API returns 200
    And after reload the existing note holds "Edited note" in its original place
    When I patch the existing note with "Edited note"
    Then the note API returns 200
    And the existing note was not rewritten

  Scenario: Keyed note edits replay once and conflict on a different body
    Given my checklist API role is "editor"
    And the mixed day for the day order API
    When I send the keyed note edit "Keyed edit" twice
    Then both keyed note requests return identical JSON naming "Keyed edit"
    And the existing note holds "Keyed edit"
    When I reuse the note edit key with the content "Other edit"
    Then the note API returns 409 with code "conflict"
    And the existing note holds "Keyed edit"

  Scenario: Editing a note that does not exist is not found
    Given my checklist API role is "editor"
    And the mixed day for the day order API
    When I patch a note that does not exist
    Then the note API returns 404 with code "not_found"

  Scenario Outline: Denied note edits leave the note unchanged
    Given my checklist API role is "<role>"
    And the mixed day for the day order API
    When I patch the existing note with "Denied edit"
    Then the note API returns <status> with code "<code>"
    And the existing note was not rewritten
    Examples:
      | role      | status | code            |
      | viewer    | 403    | forbidden       |
      | stranger  | 404    | not_found       |
      | anonymous | 401    | unauthenticated |

  Scenario Outline: Invalid note edits never write
    Given my checklist API role is "editor"
    And the mixed day for the day order API
    When I submit note edit case "<case>"
    Then the note API returns 422 with code "validation_failed"
    And the day stores the original order
    Examples:
      | case              |
      | missing-content   |
      | over-long-content |
      | unknown-key       |
      | linked-id         |

  Scenario: Editor deletes a note and the other items keep their order
    Given my checklist API role is "editor"
    And the mixed day for the day order API
    When I delete the existing note through the note API
    Then the note API returns 204
    And after reload the existing note is gone and the other items keep their order
    When I delete the existing note through the note API
    Then the note API returns 204

  Scenario: Keyed note deletes succeed twice without further effect
    Given my checklist API role is "editor"
    And the mixed day for the day order API
    When I send the keyed note delete twice
    Then both keyed note deletes return 204
    And the existing note is gone

  Scenario Outline: Denied note deletes leave the note in place
    Given my checklist API role is "<role>"
    And the mixed day for the day order API
    When I delete the existing note through the note API
    Then the note API returns <status> with code "<code>"
    And the day stores the original order
    Examples:
      | role      | status | code            |
      | viewer    | 403    | forbidden       |
      | stranger  | 404    | not_found       |
      | anonymous | 401    | unauthenticated |

  Scenario Outline: Invalid note deletes never write
    Given my checklist API role is "editor"
    And the mixed day for the day order API
    When I submit note delete case "<case>"
    Then the note API returns 422 with code "validation_failed"
    And the day stores the original order
    Examples:
      | case         |
      | missing-trip |
      | linked-id    |
      | unknown-key  |

  Scenario: Editor prepends trip notes through the API and every note shifts down
    Given scenario-owned trip notes for the trip note API
    And my checklist API role is "editor"
    When I create the trip note "Newest" through the trip note API
    Then the trip note API returns 200
    And after reload the stored trip note titles are "Newest, First note, Second note, Third note"
    And the stored trip note positions run from 0 without gaps

  Scenario: A same-ID trip note create replays after another create shifted it and rejects reuse
    Given scenario-owned trip notes for the trip note API
    And my checklist API role is "editor"
    When I create the trip note "Retry me" with a client ID through the trip note API
    And I create the trip note "Shifter" through the trip note API
    And I retry the client ID trip note creation
    Then the retried trip note keeps its shifted position and the trip holds it once
    When I reuse the client ID for the trip note "Different"
    Then the trip note API returns 409 with code "conflict"
    And the trip holds the client ID trip note once

  Scenario: Keyed trip note creates replay once and conflict on a different body
    Given scenario-owned trip notes for the trip note API
    And my checklist API role is "editor"
    When I send the keyed trip note create "Keyed note" twice
    Then both keyed trip note requests return identical JSON titled "Keyed note"
    And the trip holds 1 trip note titled "Keyed note"
    When I reuse the trip note create key with the title "Other note"
    Then the trip note API returns 409 with code "conflict"
    And the trip holds 1 trip note titled "Keyed note"

  Scenario: Anonymous trip note create stays anonymous if browser cookies return
    Given scenario-owned trip notes for the trip note API
    And I remember the signed-in browser cookies
    And my checklist API role is "anonymous"
    And the signed-in browser cookies return
    When I create the trip note "Denied" through the trip note API
    Then the trip note API returns 401 with code "unauthenticated"
    And the signed-in browser cookies remain available
    And the stored trip notes keep their original order

  Scenario Outline: Denied trip note creates leave the notes unchanged
    Given scenario-owned trip notes for the trip note API
    And my checklist API role is "<role>"
    When I create the trip note "Denied" through the trip note API
    Then the trip note API returns <status> with code "<code>"
    And the stored trip notes keep their original order
    Examples:
      | role      | status | code            |
      | viewer    | 403    | forbidden       |
      | stranger  | 404    | not_found       |
      | anonymous | 401    | unauthenticated |

  Scenario Outline: Invalid trip note creates never write
    Given scenario-owned trip notes for the trip note API
    And my checklist API role is "editor"
    When I submit trip note create case "<case>"
    Then the trip note API returns 422 with code "validation_failed"
    And the stored trip notes keep their original order
    Examples:
      | case            |
      | empty           |
      | blank-both      |
      | null-title      |
      | over-long-title |
      | over-long-body  |
      | non-text-body   |
      | unknown-key     |
      | linked-note-id  |

  Scenario: Editor edits one field of a trip note, clears the other and repeating writes nothing
    Given scenario-owned trip notes for the trip note API
    And my checklist API role is "editor"
    When I patch the first trip note with:
      """
      { "title": "  Edited first  " }
      """
    Then the trip note API returns 200
    And the stored first trip note matches:
      """
      { "title": "Edited first", "body": "First body" }
      """
    When I patch the first trip note with:
      """
      { "body": null }
      """
    Then the trip note API returns 200
    And the stored first trip note matches:
      """
      { "title": "Edited first", "body": null }
      """
    When I patch the first trip note with:
      """
      { "title": "Edited first", "body": "   " }
      """
    Then the trip note API returns 200
    And the first trip note was not rewritten
    And after reload the stored trip note titles are "Edited first, Second note, Third note"

  Scenario: An edit that would leave a trip note blank is rejected
    Given scenario-owned trip notes for the trip note API
    And my checklist API role is "editor"
    When I patch the second trip note with:
      """
      { "title": null }
      """
    Then the trip note API returns 422 with code "validation_failed"
    And the stored second trip note matches:
      """
      { "title": "Second note", "body": null }
      """

  Scenario: Keyed trip note edits replay once and conflict on a different body
    Given scenario-owned trip notes for the trip note API
    And my checklist API role is "editor"
    When I send the keyed trip note edit "Keyed edit" twice
    Then both keyed trip note requests return identical JSON titled "Keyed edit"
    And the stored first trip note matches:
      """
      { "title": "Keyed edit" }
      """
    When I reuse the trip note edit key with the title "Other edit"
    Then the trip note API returns 409 with code "conflict"
    And the stored first trip note matches:
      """
      { "title": "Keyed edit" }
      """

  Scenario: Editing a trip note that does not exist is not found
    Given scenario-owned trip notes for the trip note API
    And my checklist API role is "editor"
    When I patch a trip note that does not exist
    Then the trip note API returns 404 with code "not_found"

  Scenario Outline: Denied trip note edits leave the note unchanged
    Given scenario-owned trip notes for the trip note API
    And my checklist API role is "<role>"
    When I patch the first trip note with:
      """
      { "title": "Denied edit" }
      """
    Then the trip note API returns <status> with code "<code>"
    And the first trip note was not rewritten
    Examples:
      | role      | status | code            |
      | viewer    | 403    | forbidden       |
      | stranger  | 404    | not_found       |
      | anonymous | 401    | unauthenticated |

  Scenario Outline: Invalid trip note edits never write
    Given scenario-owned trip notes for the trip note API
    And my checklist API role is "editor"
    When I submit trip note edit case "<case>"
    Then the trip note API returns 422 with code "validation_failed"
    And the stored first trip note matches:
      """
      { "title": "First note", "body": "First body" }
      """
    Examples:
      | case            |
      | empty           |
      | over-long-title |
      | unknown-key     |
      | linked-id       |

  Scenario: Editor deletes a trip note and deleting it again succeeds without effect
    Given scenario-owned trip notes for the trip note API
    And my checklist API role is "editor"
    When I delete the first trip note through the trip note API
    Then the trip note API returns 204
    And the first trip note is gone and the others keep their order
    When I delete the first trip note through the trip note API
    Then the trip note API returns 204

  Scenario: Keyed trip note deletes succeed twice without further effect
    Given scenario-owned trip notes for the trip note API
    And my checklist API role is "editor"
    When I send the keyed trip note delete twice
    Then both keyed trip note deletes return 204
    And the first trip note is gone and the others keep their order

  Scenario Outline: Denied trip note deletes leave the note in place
    Given scenario-owned trip notes for the trip note API
    And my checklist API role is "<role>"
    When I delete the first trip note through the trip note API
    Then the trip note API returns <status> with code "<code>"
    And the stored trip notes keep their original order
    Examples:
      | role      | status | code            |
      | viewer    | 403    | forbidden       |
      | stranger  | 404    | not_found       |
      | anonymous | 401    | unauthenticated |

  Scenario Outline: Invalid trip note deletes never write
    Given scenario-owned trip notes for the trip note API
    And my checklist API role is "editor"
    When I submit trip note delete case "<case>"
    Then the trip note API returns 422 with code "validation_failed"
    And the stored trip notes keep their original order
    Examples:
      | case         |
      | missing-trip |
      | linked-id    |
      | unknown-key  |

  Scenario: Editor reorders trip notes and an unchanged order is accepted
    Given scenario-owned trip notes for the trip note API
    And my checklist API role is "editor"
    When I PUT the reversed trip note order
    Then the trip note API returns 200
    And after reload the stored trip note titles are "Third note, Second note, First note"
    And the stored trip note positions run from 0 without gaps
    When I PUT the stored trip note order
    Then the trip note API returns 200
    And the stored trip note positions run from 0 without gaps

  Scenario Outline: A stale trip note order is a conflict and writes nothing
    Given scenario-owned trip notes for the trip note API
    And my checklist API role is "editor"
    When I PUT the trip note order case "<case>"
    Then the trip note API returns 409 with code "conflict"
    And the stored trip notes keep their original order
    Examples:
      | case         |
      | missing-note |
      | extra-note   |
      | foreign-note |

  Scenario: A trip note added by another editor makes the loaded order stale
    Given scenario-owned trip notes for the trip note API
    And my checklist API role is "editor"
    When another editor adds a trip note directly
    And I PUT the stored trip note order
    Then the trip note API returns 409 with code "conflict"
    And the stored trip note titles are "First note, Second note, Third note, Added elsewhere"

  Scenario: Keyed trip note orders replay once and conflict on a different order
    Given scenario-owned trip notes for the trip note API
    And my checklist API role is "editor"
    When I PUT the reversed trip note order with an Idempotency-Key
    And I retry the same keyed trip note order PUT
    Then both keyed trip note order requests return the same order
    When I PUT the stored trip note order with an Idempotency-Key
    Then the trip note API returns 409 with code "conflict"
    And the stored trip note titles are "Third note, Second note, First note"

  Scenario Outline: Denied trip note orders leave the notes unchanged
    Given scenario-owned trip notes for the trip note API
    And my checklist API role is "<role>"
    When I PUT the reversed trip note order
    Then the trip note API returns <status> with code "<code>"
    And the stored trip notes keep their original order
    Examples:
      | role      | status | code            |
      | viewer    | 403    | forbidden       |
      | stranger  | 404    | not_found       |
      | anonymous | 401    | unauthenticated |

  Scenario Outline: Invalid trip note orders never write
    Given scenario-owned trip notes for the trip note API
    And my checklist API role is "editor"
    When I submit trip note order case "<case>"
    Then the trip note API returns 422 with code "validation_failed"
    And the stored trip notes keep their original order
    Examples:
      | case        |
      | duplicate   |
      | linked-id   |
      | unknown-key |
      | too-many    |
      | no-list     |

  Scenario: Editor partially edits a day and clears text fields with null
    Given scenario-owned days for the day API
    And my checklist API role is "editor"
    When I patch the second day through the day API with:
      """
      { "label": "Old town", "subtitle": "Walking day", "weather": "Sunny", "travelSummary": "On foot" }
      """
    Then the day API returns 200
    And after reload the second day is stored as:
      """
      { "label": "Old town", "subtitle": "Walking day", "weather": "Sunny", "travelSummary": "On foot" }
      """
    When I patch the second day through the day API with:
      """
      { "subtitle": null }
      """
    Then the day API returns 200
    And after reload the second day is stored as:
      """
      { "label": "Old town", "subtitle": null, "weather": "Sunny", "travelSummary": "On foot" }
      """
    When I patch the second day through the day API with:
      """
      {}
      """
    Then the day API returns 200
    And the day API response is the second day as stored
    And after reload the second day is stored as:
      """
      { "label": "Old town", "subtitle": null, "weather": "Sunny", "travelSummary": "On foot" }
      """

  Scenario: Keyed day edits replay once and conflict on a different body
    Given scenario-owned days for the day API
    And my checklist API role is "editor"
    When I send the keyed day edit "Keyed day" twice
    Then the day API returns 200
    And after reload the second day is stored as:
      """
      { "label": "Keyed day" }
      """
    When I reuse the day edit key with the label "Other day"
    Then the day API returns 409 with code "conflict"
    And after reload the second day is stored as:
      """
      { "label": "Keyed day" }
      """

  Scenario: Editing a day that does not exist is not found
    Given scenario-owned days for the day API
    And my checklist API role is "editor"
    When I patch a day that does not exist through the day API
    Then the day API returns 404 with code "not_found"

  Scenario Outline: Denied day edits leave the days unchanged
    Given scenario-owned days for the day API
    And my checklist API role is "<role>"
    When I patch the second day through the day API with:
      """
      { "label": "Hacked" }
      """
    Then the day API returns <status> with code "<code>"
    And the stored days keep their original state
    Examples:
      | role      | status | code            |
      | viewer    | 403    | forbidden       |
      | stranger  | 404    | not_found       |
      | anonymous | 401    | unauthenticated |

  Scenario Outline: Invalid day edits never write
    Given scenario-owned days for the day API
    And my checklist API role is "editor"
    When I submit day edit case "<case>"
    Then the day API returns 422 with code "validation_failed"
    And the stored days keep their original state
    Examples:
      | case               |
      | null-label         |
      | over-long-label    |
      | over-long-subtitle |
      | non-text-weather   |
      | unknown-key        |
      | malformed-id       |

  Scenario: Editor appends a day, the trip end date follows and a same-ID retry replays
    Given scenario-owned days for the day API
    And my checklist API role is "editor"
    When I append a day with a client ID through the day API
    Then the appended day follows the last date and the trip ends on it
    When I retry the client ID day append
    Then the retry returns the stored day and the trip holds it once
    And the trip holds 4 days

  Scenario: Keyed day appends replay once and conflict on a different body
    Given scenario-owned days for the day API
    And my checklist API role is "editor"
    When I send the keyed day append twice
    Then both keyed day requests return identical JSON for the client ID day
    And the trip holds 4 days
    When I reuse the day append key without a client ID
    Then the day API returns 409 with code "conflict"
    And the trip holds 4 days

  Scenario: A day append at the 45-day cap is rejected and writes nothing
    Given scenario-owned days for the day API
    And the trip holds 45 days for the day API
    And my checklist API role is "editor"
    When I append a day through the day API
    Then the day API returns 422 with code "validation_failed"
    And the day API error message is "Max trip length is 45 days. Please shorten your date range."
    And the stored days keep their original state

  Scenario Outline: Denied day appends leave the trip unchanged
    Given scenario-owned days for the day API
    And my checklist API role is "<role>"
    When I append a day through the day API
    Then the day API returns <status> with code "<code>"
    And the stored days keep their original state
    Examples:
      | role      | status | code            |
      | viewer    | 403    | forbidden       |
      | stranger  | 404    | not_found       |
      | anonymous | 401    | unauthenticated |

  Scenario Outline: Invalid day appends never write
    Given scenario-owned days for the day API
    And my checklist API role is "editor"
    When I submit day append case "<case>"
    Then the day API returns 422 with code "validation_failed"
    And the stored days keep their original state
    Examples:
      | case         |
      | malformed-id |
      | unknown-key  |
      | date-key     |

  Scenario: Editor removes an empty last day, the end date moves back and a repeat succeeds without effect
    Given scenario-owned days for the day API
    And my checklist API role is "editor"
    When I delete the last day through the day API
    Then the day API returns 204
    And the last day is gone and the trip ends on the second day's date
    When I delete the last day through the day API
    Then the day API returns 204
    And the trip holds 2 days

  Scenario: A populated last day needs confirmation and a confirmed removal deletes its content and files
    Given scenario-owned days for the day API
    And the last day holds an event with a document file for the day API
    And my checklist API role is "editor"
    When I delete the last day through the day API
    Then the day API returns 409 with code "confirmation_required"
    And the populated last day, its event and its file are untouched
    When I delete the last day through the day API confirming the destructive removal
    Then the day API returns 204
    And the populated last day, its event, document and file are gone

  Scenario: Keyed day deletes succeed twice without further effect
    Given scenario-owned days for the day API
    And my checklist API role is "editor"
    When I send the keyed day delete twice
    Then both keyed day deletes return 204
    And the last day is gone and the trip ends on the second day's date

  Scenario Outline: A day that is not the last cannot be removed
    Given scenario-owned days for the day API
    And my checklist API role is "editor"
    When I delete the <which> day through the day API
    Then the day API returns 409 with code "conflict"
    And the stored days keep their original state
    Examples:
      | which  |
      | first  |
      | second |

  Scenario: The only remaining day cannot be removed
    Given scenario-owned days for the day API
    And the trip holds only its first day for the day API
    And my checklist API role is "editor"
    When I delete the first day through the day API
    Then the day API returns 409 with code "conflict"
    And the stored days keep their original state

  Scenario Outline: Denied day deletes leave the trip unchanged
    Given scenario-owned days for the day API
    And the last day holds an event with a document file for the day API
    And my checklist API role is "<role>"
    When I delete the last day through the day API confirming the destructive removal
    Then the day API returns <status> with code "<code>"
    And the populated last day, its event and its file are untouched
    Examples:
      | role      | status | code            |
      | viewer    | 403    | forbidden       |
      | stranger  | 404    | not_found       |
      | anonymous | 401    | unauthenticated |

  Scenario Outline: Invalid day deletes never write
    Given scenario-owned days for the day API
    And my checklist API role is "editor"
    When I submit day delete case "<case>"
    Then the day API returns 422 with code "validation_failed"
    And the stored days keep their original state
    Examples:
      | case             |
      | missing-trip     |
      | malformed-id     |
      | unknown-key      |
      | bad-confirmation |

  Scenario: Editor uploads a trip document through the API and it persists
    Given my checklist API role is "editor"
    When I upload "boarding.pdf" as a PDF through the document API
    Then the document API returns 200
    And the uploaded document is a PDF trip document named "boarding.pdf"
    And the trip holds 1 uploaded file
    And after reload the Documents tab lists "boarding.pdf"

  Scenario: A same-id retry of the same file returns the stored document and keeps one file
    Given my checklist API role is "editor"
    When I upload "retry.pdf" as a PDF with the scenario document id through the document API
    And I upload "retry.pdf" as a PDF with the scenario document id through the document API
    Then both document API uploads return the same stored document
    And the trip stores 1 trip document
    And the trip holds 1 uploaded file

  Scenario: Reusing a document id for a different file conflicts and stores nothing more
    Given my checklist API role is "editor"
    When I upload "first.pdf" as a PDF with the scenario document id through the document API
    And I upload "second.pdf" as a PDF with the scenario document id through the document API
    Then the document API returns 409 with code "conflict"
    And the trip stores 1 trip document
    And the trip holds 1 uploaded file

  Scenario: A document id held by a trip the user cannot see is never returned
    Given my checklist API role is "editor"
    And a document with the scenario document id exists in a trip I cannot see
    When I upload "probe.pdf" as a PDF with the scenario document id through the document API
    Then the document API returns 404 with code "not_found"
    And the response does not reveal the hidden document
    And the trip holds 0 uploaded files

  Scenario Outline: Denied document uploads store nothing
    Given my checklist API role is "<role>"
    When I upload "denied.pdf" as a PDF through the document API
    Then the document API returns <status> with code "<code>"
    And the trip stores 0 trip documents
    And the trip holds 0 uploaded files
    Examples:
      | role     | status | code      |
      | viewer   | 403    | forbidden |
      | stranger | 404    | not_found |

  Scenario Outline: Bad document uploads never store anything
    Given my checklist API role is "editor"
    When I submit document upload case "<case>"
    Then the document API returns <status> with code "<code>"
    And the trip stores 0 trip documents
    And the trip holds 0 uploaded files
    Examples:
      | case             | status | code               |
      | oversize-file    | 413    | payload_too_large  |
      | oversize-body    | 413    | payload_too_large  |
      | disallowed-type  | 422    | validation_failed  |
      | mismatched-type  | 422    | validation_failed  |
      | missing-file     | 422    | validation_failed  |
      | bad-id           | 422    | validation_failed  |
      | unknown-field    | 422    | validation_failed  |
      | keyed            | 400    | bad_request        |
      | no-client-header | 403    | forbidden          |
      | cross-origin     | 403    | forbidden          |

  Scenario Outline: Scoped uploads persist once across a client-id replay
    Given a scenario-owned "<scope>" document API target
    And my checklist API role is "editor"
    When I upload "scoped.pdf" as a PDF with the scenario document id through the document API
    Then the document API returns 200
    And the returned document belongs to its intended scope
    When I upload "scoped.pdf" as a PDF with the scenario document id through the document API
    Then both document API uploads return the same stored document
    And the scoped document API stores 1 document and 1 file
    Examples:
      | scope       |
      | event       |
      | reservation |

  Scenario Outline: Scoped upload authorization runs before storage
    Given a scenario-owned "<scope>" document API target
    And my checklist API role is "<role>"
    When I upload "denied.pdf" as a PDF through the document API
    Then the document API returns <status> with code "<code>"
    And the scoped document API stores 0 documents and 0 files
    Examples:
      | scope       | role     | status | code      |
      | event       | viewer   | 403    | forbidden |
      | event       | stranger | 404    | not_found |
      | reservation | viewer   | 403    | forbidden |
      | reservation | stranger | 404    | not_found |

  Scenario Outline: Scoped upload policy and cross-site failures leave no files or rows
    Given a scenario-owned "<scope>" document API target
    And my checklist API role is "editor"
    When I submit document upload case "<case>"
    Then the document API returns <status> with code "<code>"
    And the scoped document API stores 0 documents and 0 files
    Examples:
      | scope       | case             | status | code              |
      | event       | oversize-file    | 413    | payload_too_large |
      | event       | oversize-body    | 413    | payload_too_large |
      | event       | unknown-field    | 422    | validation_failed |
      | event       | keyed            | 400    | bad_request       |
      | event       | disallowed-type  | 422    | validation_failed |
      | event       | mismatched-type  | 422    | validation_failed |
      | event       | missing-file     | 422    | validation_failed |
      | event       | bad-id           | 422    | validation_failed |
      | event       | invalid-target   | 422    | validation_failed |
      | event       | missing-target   | 404    | not_found         |
      | event       | no-client-header | 403    | forbidden         |
      | event       | cross-origin     | 403    | forbidden         |
      | reservation | oversize-file    | 413    | payload_too_large |
      | reservation | oversize-body    | 413    | payload_too_large |
      | reservation | unknown-field    | 422    | validation_failed |
      | reservation | keyed            | 400    | bad_request       |
      | reservation | disallowed-type  | 422    | validation_failed |
      | reservation | mismatched-type  | 422    | validation_failed |
      | reservation | missing-file     | 422    | validation_failed |
      | reservation | bad-id           | 422    | validation_failed |
      | reservation | invalid-target   | 422    | validation_failed |
      | reservation | missing-target   | 404    | not_found         |
      | reservation | no-client-header | 403    | forbidden         |
      | reservation | cross-origin     | 403    | forbidden         |

  Scenario Outline: Scoped upload conflicts discard the second file
    Given a scenario-owned "<scope>" document API target
    And my checklist API role is "editor"
    When I upload "scoped.pdf" as a PDF with the scenario document id through the document API
    And I upload "changed.pdf" as a PDF with the scenario document id through the document API
    Then the document API returns 409 with code "conflict"
    And the scoped document API stores 1 document and 1 file
    Examples:
      | scope       |
      | event       |
      | reservation |

  Scenario Outline: Scoped uploads conceal inaccessible document IDs
    Given a scenario-owned "<scope>" document API target
    And my checklist API role is "editor"
    And a document with the scenario document id exists in a trip I cannot see
    When I upload "probe.pdf" as a PDF with the scenario document id through the document API
    Then the document API returns 404 with code "not_found"
    And the response does not reveal the hidden document
    And the scoped document API stores 0 documents and 0 files
    Examples:
      | scope       |
      | event       |
      | reservation |

  Scenario Outline: Concurrent scoped same-id uploads retain one attachment and file
    Given a scenario-owned "<scope>" document API target
    And my checklist API role is "editor"
    When I concurrently retry the scoped document upload
    Then every concurrent document upload returns the same stored document
    And the scoped document API stores 1 document and 1 file
    Examples:
      | scope       |
      | event       |
      | reservation |

  Scenario Outline: Scoped same-id collisions preserve the original target and remove losing files
    Given a scenario-owned "<scope>" document API target
    And my checklist API role is "editor"
    When I upload "scoped.pdf" as a PDF with the scenario document id through the document API
    Then the document API returns 200
    When I reuse the document id on a different "<change>"
    Then the document API returns 409 with code "conflict"
    And the scoped document API stores 1 document and 1 file
    Examples:
      | scope       | change |
      | event       | target |
      | event       | scope  |
      | reservation | target |
      | reservation | scope  |

  Scenario Outline: Rename and delete document mutations persist with replay and repeat deletion
    Given a scenario-owned "<scope>" document ready for mutation
    When I submit document mutation "PATCH" case "keyed"
    Then the document API returns 200
    When the document name is changed behind the API to "Behind.pdf"
    And I submit document mutation "PATCH" case "keyed"
    Then the last two document mutation responses match
    And the document mutation persisted name "Behind.pdf"
    When I submit document mutation "DELETE" case "keyed"
    Then the document API returns 204
    When I submit document mutation "DELETE" case "keyed"
    Then the last two document mutation responses match
    When I submit document mutation "DELETE" case "normal"
    Then the document API returns 204
    And the document mutation removed its row and file
    Examples:
      | scope       |
      | trip        |
      | event       |
      | reservation |

  Scenario Outline: Document mutations validate names and refuse out of scope fields
    Given a scenario-owned "<scope>" document ready for mutation
    When I submit document mutation "PATCH" case "<case>"
    Then the document API returns 422 with code "validation_failed"
    And the document mutation persisted name "original.pdf"
    Examples:
      | scope       | case          |
      | trip        | blank         |
      | event       | long          |
      | reservation | blank         |
      | reservation | long          |
      | trip        | unknown-field |

  Scenario Outline: Document mutations enforce access and same site protections
    Given a scenario-owned "reservation" document ready for mutation
    And my checklist API role is "<role>"
    When I submit document mutation "<method>" case "<case>"
    Then the document API returns <status> with code "<code>"
    And the document mutation persisted name "original.pdf"
    Examples:
      | method | role     | case             | status | code      |
      | PATCH  | viewer   | normal           | 403    | forbidden |
      | DELETE | viewer   | normal           | 403    | forbidden |
      | PATCH  | stranger | normal           | 404    | not_found |
      | DELETE | stranger | normal           | 404    | not_found |
      | PATCH  | editor   | no-client-header | 403    | forbidden |
      | DELETE | editor   | no-client-header | 403    | forbidden |
      | PATCH  | editor   | cross-origin     | 403    | forbidden |
      | DELETE | editor   | cross-origin     | 403    | forbidden |
      | PATCH  | editor   | unknown          | 404    | not_found |
      | DELETE | editor   | foreign-trip     | 404    | not_found |

  Scenario: An empty document patch leaves its stored name intact
    Given a scenario-owned "trip" document ready for mutation
    When I submit document mutation "PATCH" case "empty"
    Then the document API returns 200
    And the document mutation persisted name "original.pdf"

  Scenario: A rolled-back document delete keeps its row and file without queue residue
    Given a scenario-owned "reservation" document ready for mutation
    When I force the scenario document delete transaction to roll back
    Then the document API returns 500 with code "server_error"
    And the document mutation persisted name "original.pdf"
    And the rolled-back document has no queued file deletion

  Scenario Outline: Document scope attach retries and promotion persist
    Given a scenario-owned "trip" document ready for mutation
    When I set the document scope to "<scope>" case "normal"
    Then the document API returns 200
    And the document has persisted "<scope>" scope
    When I set the document scope to "<scope>" case "normal"
    Then the last two document mutation responses match
    And the document has persisted "<scope>" scope
    When I set the document scope to "<scope>" case "promote"
    Then the document API returns 200
    And the document has persisted "trip" scope
    Examples:
      | scope       |
      | event       |
      | reservation |

  Scenario: Moving a reservation document to an event clears reservation scope
    Given a scenario-owned "reservation" document ready for mutation
    When I set the document scope to "event" case "normal"
    Then the document API returns 200
    And the document has persisted "event" scope

  Scenario Outline: Keyed document scope replay preserves later promotion
    Given a scenario-owned "trip" document ready for mutation
    When I set the document scope to "<scope>" case "keyed"
    Then the document API returns 200
    And the document has persisted "<scope>" scope
    When I set the document scope to "<scope>" case "promote"
    Then the document API returns 200
    And the document has persisted "trip" scope
    When I set the document scope to "<scope>" case "keyed"
    Then the document API returns 200
    And the document has persisted "trip" scope
    Examples:
      | scope       |
      | event       |
      | reservation |

  Scenario Outline: Document scope validation and trip isolation preserve original scope
    Given a scenario-owned "trip" document ready for mutation
    When I set the document scope to "<scope>" case "<case>"
    Then the document API returns <status> with code "<code>"
    And the document has persisted "trip" scope
    Examples:
      | scope       | case      | status | code              |
      | event       | missing   | 404    | not_found         |
      | reservation | missing   | 404    | not_found         |
      | event       | foreign   | 404    | not_found         |
      | reservation | foreign   | 404    | not_found         |
      | event       | both      | 422    | validation_failed |
      | reservation | both-null | 422    | validation_failed |
      | event       | linked    | 422    | validation_failed |
      | reservation | linked    | 422    | validation_failed |
      | event       | malformed | 422    | validation_failed |
      | reservation | malformed | 422    | validation_failed |

  Scenario Outline: Document scope changes require editor and same-site client
    Given a scenario-owned "trip" document ready for mutation
    And my checklist API role is "<role>"
    When I set the document scope to "<scope>" case "<case>"
    Then the document API returns <status> with code "<code>"
    And the document has persisted "trip" scope
    Examples:
      | scope       | role     | case             | status | code      |
      | event       | viewer   | normal           | 403    | forbidden |
      | reservation | viewer   | normal           | 403    | forbidden |
      | event       | stranger | normal           | 404    | not_found |
      | reservation | stranger | normal           | 404    | not_found |
      | event       | editor   | cross-origin     | 403    | forbidden |
      | reservation | editor   | cross-origin     | 403    | forbidden |
      | event       | editor   | no-client-header | 403    | forbidden |
      | reservation | editor   | no-client-header | 403    | forbidden |

  Scenario Outline: Mixed-trip document ancestry is concealed from rename, empty patch and delete
    Given a scenario-owned "trip" document ready for mutation
    And the scenario document claims "<claim>" of another trip I also edit
    When I submit document mutation "<method>" case "<case>"
    Then the document API returns 404 with code "not_found"
    And the corrupted document row and file are unchanged
    Examples:
      | claim        | method | case             |
      | reservation  | PATCH  | normal           |
      | reservation  | PATCH  | empty            |
      | reservation  | DELETE | normal           |
      | reservation  | DELETE | owned-other-trip |
      | event        | PATCH  | normal           |
      | event        | DELETE | owned-other-trip |
      | legacy mixed | PATCH  | normal           |
      | legacy mixed | PATCH  | empty            |
      | legacy mixed | DELETE | normal           |
      | legacy mixed | DELETE | owned-other-trip |

  Scenario Outline: Mixed-trip document ancestry blocks attaching and promoting
    Given a scenario-owned "trip" document ready for mutation
    And the scenario document claims "<claim>" of another trip I also edit
    When I set the document scope to "<scope>" case "<case>"
    Then the document API returns 404 with code "not_found"
    And the corrupted document row and file are unchanged
    Examples:
      | claim        | scope       | case    |
      | reservation  | event       | normal  |
      | event        | reservation | normal  |
      | legacy mixed | reservation | normal  |
      | legacy mixed | event       | normal  |
      | legacy mixed | event       | promote |
      | event        | reservation | promote |

  Scenario: A keyed document rename is not replayed once the document ancestry is inconsistent
    Given a scenario-owned "trip" document ready for mutation
    When I submit document mutation "PATCH" case "keyed"
    Then the document API returns 200
    Given the scenario document claims "reservation" of another trip I also edit
    When I submit document mutation "PATCH" case "keyed"
    Then the document API returns 404 with code "not_found"
    And the last document API response does not contain "Renamed.pdf"
    And the corrupted document row and file are unchanged

  Scenario: A keyed document scope change is not replayed once the document ancestry is inconsistent
    Given a scenario-owned "trip" document ready for mutation
    When I set the document scope to "event" case "keyed"
    Then the document API returns 200
    Given the scenario document claims "reservation" of another trip I also edit
    When I set the document scope to "event" case "keyed"
    Then the document API returns 404 with code "not_found"
    And the last document API response does not contain "original.pdf"
    And the corrupted document row and file are unchanged

  Scenario: Editor selects and removes a cover through the API
    Given a scenario-owned trip for the cover API
    When I select an attributed cover through the API
    Then the attributed API cover persists
    When I remove the cover through the API
    Then the API cover is a graphic without attribution

  Scenario Outline: Cover API rejects unsafe input atomically
    Given a scenario-owned trip for the cover API
    When I submit cover API case "<case>"
    Then the cover API returns <status> without changing the cover
    Examples:
      | case                | status |
      | unsafe-image        | 422    |
      | unsafe-photographer | 422    |
      | foreign-storage     | 422    |
      | unknown-field       | 422    |
      | delete-field        | 422    |
      | cross-site          | 403    |

  Scenario Outline: Cover API enforces collaborator access
    Given a scenario-owned trip for the cover API
    And my cover API role is "<role>"
    When I submit cover API case "valid"
    Then the cover API returns <status> without changing the cover
    Examples:
      | role     | status |
      | viewer   | 403    |
      | stranger | 404    |

  Scenario: Keyed cover replays retain their original result after later changes
    Given a scenario-owned trip for the cover API
    When I replay keyed cover writes after later changes
    Then the attributed API cover persists

  Scenario: Stored map cover is deleted only after committed removal
    Given a scenario-owned trip for the cover API
    And a stored map cover owned by the cover API trip
    When I remove the cover through the API
    Then the API cover is a graphic without attribution
    And the replaced stored cover file is removed after commit

  Scenario: Cover rollback retains original row and stored map file
    Given a scenario-owned trip for the cover API
    And a stored map cover owned by the cover API trip
    When I force the cover cleanup transaction to roll back
    Then the rolled-back cover file and row remain

  Scenario: Editor uploads a GIF then a PNG cover through the API and attribution is cleared
    Given a scenario-owned trip for the cover API
    When I select an attributed cover through the API
    And I upload a "GIF" cover through the API
    Then the API cover is a stored upload without attribution
    When I upload a "PNG" cover through the API
    Then the API cover is a stored upload without attribution

  Scenario: Cover upload replaces a stored cover and removes the old file after commit
    Given a scenario-owned trip for the cover API
    And a stored map cover owned by the cover API trip
    When I upload a "PNG" cover through the API
    Then the API cover is a stored upload without attribution
    And the replaced stored cover file is removed after commit

  Scenario Outline: Cover upload API rejects unsafe input atomically
    Given a scenario-owned trip for the cover API
    When I submit cover upload API case "<case>"
    Then the cover API returns <status> without changing the cover
    And the cover upload API returns <status> with code "<code>"
    And the cover upload stored no new file
    Examples:
      | case             | status | code              |
      | oversize-file    | 413    | payload_too_large |
      | oversize-body    | 413    | payload_too_large |
      | disallowed-type  | 422    | validation_failed |
      | mismatched-type  | 422    | validation_failed |
      | missing-file     | 422    | validation_failed |
      | unknown-field    | 422    | validation_failed |
      | keyed            | 400    | bad_request       |
      | no-client-header | 403    | forbidden         |
      | cross-origin     | 403    | forbidden         |

  Scenario Outline: Cover upload API enforces collaborator access
    Given a scenario-owned trip for the cover API
    And my cover API role is "<role>"
    When I submit cover upload API case "valid"
    Then the cover API returns <status> without changing the cover
    And the cover upload stored no new file
    Examples:
      | role     | status |
      | viewer   | 403    |
      | stranger | 404    |

  Scenario: Cover upload rollback keeps the old cover and removes the new file
    Given a scenario-owned trip for the cover API
    And a stored map cover owned by the cover API trip
    When I force the cover cleanup transaction to roll back during an upload
    Then the cover API returns 500 without changing the cover
    And the rolled-back cover upload left no new file
    And the rolled-back cover file and row remain
