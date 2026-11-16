@feat:request-deadline
Feature: API request deadline
  Aborting a request in the browser does not stop the server, so an API write commits only before its
  request deadline and rolls back after it, rather than landing after the write that followed it.

  Scenario Outline: Isolated PostgreSQL write deadline
    Given an isolated deadline probe table
    Then the guarded write verifies "<case>"
    Examples:
      | case                             |
      | commit in time                   |
      | slow statement                   |
      | lock held by another writer      |
      | work that ends after the deadline |
