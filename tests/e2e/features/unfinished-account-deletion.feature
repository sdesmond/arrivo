@feat:unfinished-account-deletion
Feature: Delete unfinished accounts
  Scenario Outline: Admin deletes a pending or expired account and its setup link admits no one
    Given I am signed in as an app "admin"
    And a regeneration target with a "<state>" setup link
    When I request app management at "/admin/users"
    And I delete the unfinished account in Users
    Then the unfinished account is gone after refresh
    And its old setup link admits no one
    And deletion Activity identifies only the admin and target
    Examples:
      | state   |
      | pending |
      | expired |

  Scenario: A target completed after Users loaded is refused and kept
    Given I am signed in as an app "admin"
    And a regeneration target with a "pending" setup link
    When I request app management at "/admin/users"
    And the regeneration target becomes "completed" after Users loaded
    And I delete the unfinished account in Users
    Then the completed account remains with no deletion Activity

  Scenario: A stale already-deleted row does not reappear
    Given I am signed in as an app "admin"
    And a regeneration target with a "pending" setup link
    When I request app management at "/admin/users"
    And the regeneration target becomes "deleted" after Users loaded
    And I delete the unfinished account in Users
    Then the unfinished account is gone after refresh
    And there is no deletion Activity for the target

  Scenario: Deletion races with setup completion yield one outcome
    Given an isolated deletion app
    Then deletion waiting behind completion refuses the completed account
    And completion waiting behind deletion finds no authorization
