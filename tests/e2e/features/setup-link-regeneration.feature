@feat:setup-link-regeneration
Feature: Regenerate unfinished accounts' setup links
  Scenario Outline: Pending and expired accounts retain their identity and get a fresh link
    Given I am signed in as an instance "admin"
    And a regeneration target with a "<state>" setup link
    When I request instance management at "/admin/users"
    Then the regeneration row shows "<label>"
    When I generate the target's replacement setup link
    Then regeneration keeps the account ID and gives a fresh 24-hour setup link
    And regeneration Activity identifies only the admin and target
    And the prior setup link is rejected and the replacement opens setup
    Examples:
      | state   | label         |
      | pending | Pending setup |
      | expired | Setup expired |

  Scenario Outline: Stale unfinished rows cannot recreate changed accounts
    Given I am signed in as an instance "admin"
    And a regeneration target with a "pending" setup link
    When I request instance management at "/admin/users"
    And the regeneration target becomes "<state>" after Users loaded
    And I generate the target's replacement setup link
    Then Users reconciles the "<state>" regeneration target without issuance
    Examples:
      | state     |
      | completed |
      | deleted   |

  Scenario: Lost response requires a successful current-state check before explicit replacement
    Given I am signed in as an instance "admin"
    And a regeneration target with a "pending" setup link
    When I request instance management at "/admin/users"
    And regeneration commits but its response and first state check are lost
    Then regeneration remains locked across close and reopen
    When I check regeneration state again
    Then regeneration permits only deliberate replacement of the lost result

  Scenario: Replacement races serialize with setup completion and actor demotion
    Given an isolated regeneration instance
    Then regeneration waiting behind completion refuses the completed account
    And regeneration waiting behind admin demotion is forbidden

  Scenario: Failed replacement preserves old authorization
    Given an isolated regeneration instance
    Then an authorization insert failure rolls back regeneration invalidation
