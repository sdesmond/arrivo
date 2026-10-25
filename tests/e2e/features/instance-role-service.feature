@feat:instance-role-service
Feature: Instance role-change service
  The service runs directly against an isolated database schema, so the baseline admin never masks a last-admin defect.

  Scenario: An admin promotes a completed member
    Given an isolated instance with a completed admin and a completed member
    When the admin changes the member's role to admin
    Then the role change succeeds
    And the member's stored role is admin

  Scenario: An admin demotes another admin while a completed admin remains
    Given an isolated instance with two completed admins
    When the first admin changes the second admin's role to member
    Then the role change succeeds
    And the second admin's stored role is member

  Scenario: The last completed admin cannot be demoted while unfinished admins exist
    Given an isolated instance with one completed admin and one unfinished admin
    When the completed admin changes their own role to member
    Then the role change is refused as last-admin
    And the completed admin's stored role is admin

  Scenario: A passwordless account cannot be promoted
    Given an isolated instance with a completed admin and an unfinished member
    When the admin changes the unfinished member's role to admin
    Then the role change is refused as unfinished-account
    And the unfinished member's stored role is member

  Scenario: Overlapping self-demotions leave one completed admin
    Given an isolated instance with two completed admins
    When both admins demote themselves at the same time
    Then exactly one self-demotion succeeds and the other is refused as last-admin
    And exactly one admin remains stored

  Scenario: An admin demoted while waiting for the locks is refused
    Given an isolated instance with two completed admins and a completed member
    When the second admin's promotion of the member waits behind the first admin demoting the second admin
    Then the promotion is refused as forbidden
    And the member's stored role is member

  Scenario: The last completed admin cannot delete their own account while unfinished admins exist
    Given an isolated instance with one completed admin and one unfinished admin
    When the completed admin deletes their own account
    Then the account deletion is refused as last-admin
    And the completed admin's account still exists

  Scenario: Overlapping self-deletions leave one completed admin
    Given an isolated instance with two completed admins
    When both admins delete their own accounts at the same time
    Then exactly one deletion succeeds and the other is refused as last-admin
    And exactly one account remains stored
