@feat:admin-account-deletion
Feature: Admin deletes accounts and their trips pass on privately

  Scenario: An admin reviews and deletes a completed account without seeing its private trips
    Given I am signed in as an app "admin"
    And a completed account owns a private trip shared with an editor and a viewer
    When I request app management at "/admin/users"
    And I review deleting the completed account
    Then the review reports 1 passing on and 0 deleted
    And the review exposes no trip or collaborator detail
    When I confirm the reviewed deletion
    Then the completed account is gone and its trip passes to the "editor"
    And I am still signed in on Users
    And account deletion Activity identifies only the admin and target

  Scenario: A trip with only viewers left is deleted with the account
    Given I am signed in as an app "admin"
    And a completed account owns a private trip shared with only a viewer
    When I request app management at "/admin/users"
    And I review deleting the completed account
    Then the review reports 0 passing on and 1 deleted
    When I confirm the reviewed deletion
    Then the completed account is gone and its trip no longer exists

  Scenario: A different successor needs a renewed confirmation even when the counts match
    Given I am signed in as an app "admin"
    And a completed account owns a private trip shared with two editors
    When I request app management at "/admin/users"
    And I review deleting the completed account
    And the first editor leaves the trip after review
    And I confirm the reviewed deletion
    Then the dialog asks for a renewed confirmation and nothing was deleted
    When I confirm the reviewed deletion
    Then the completed account is gone and its trip passes to the "second editor"

  Scenario: An admin deleting their own account is signed out
    Given I am signed in as an app "admin"
    When I request app management at "/admin/users"
    And I review deleting my own account
    And I confirm deleting my own account after review
    Then I am signed out and my account is gone

  Scenario Outline: Succession picks the role, then the earliest added, then the lowest user ID
    Given an isolated admin deletion app with admins "boss" and members "owner,first,second"
    And owner will own trip shared
    And first will be <first role> on trip shared since "<first since>"
    And second will be <second role> on trip shared since "<second since>"
    When the admin boss deletes owner after reviewing
    Then the admin deletion succeeded
    And the admin deletion removed the account of owner
    And trip shared was passed to "<heir>"
    Examples:
      | first role | first since              | second role | second since             | heir                                  |
      | editor     | 2026-01-01T00:00:00.000Z | manager     | 2026-02-01T00:00:00.000Z | second                                |
      | editor     | 2026-02-01T00:00:00.000Z | editor      | 2026-01-01T00:00:00.000Z | second                                |
      | manager    | 2026-01-01T00:00:00.000Z | manager     | 2026-02-01T00:00:00.000Z | first                                 |
      | editor     | 2026-01-01T00:00:00.000Z | editor      | 2026-01-01T00:00:00.000Z | the lower ID of first and second      |

  Scenario: Viewers and seats without an account cannot inherit
    Given an isolated admin deletion app with admins "boss" and members "owner,viewer"
    And owner will own trip shared
    And viewer will be viewer on trip shared since "2026-01-01T00:00:00.000Z"
    And trip shared has a seat without an account
    When the admin boss deletes owner after reviewing
    Then the admin deletion succeeded
    And trip shared was removed

  Scenario: A pending account is deleted through the same review
    Given an isolated admin deletion app with admins "boss" and members "pending:pending"
    When the admin boss deletes pending after reviewing
    Then the admin deletion succeeded
    And the admin deletion removed the account of pending

  Scenario: The last completed admin cannot delete their own account
    Given an isolated admin deletion app with admins "boss" and members "owner,idle:pending"
    And owner will own trip shared
    When the admin boss deletes boss after reviewing
    Then the admin deletion was refused as "last-admin"
    And the admin deletion kept the account of boss
    And trip shared is still owned by owner

  Scenario: Changed successors with unchanged counts leave everything as it was until reconfirmed
    Given an isolated admin deletion app with admins "boss" and members "owner,first,second"
    And owner will own trip shared
    And first will be editor on trip shared since "2026-01-01T00:00:00.000Z"
    And second will be editor on trip shared since "2026-02-01T00:00:00.000Z"
    When the admin boss reviews deleting owner
    And first leaves trip shared before the admin confirms
    And the admin boss confirms deleting owner with the earlier review
    Then the admin deletion was refused as "changed"
    And the refusal carries a new review with 1 passing on and 0 deleted
    And the admin deletion kept the account of owner
    And trip shared is still owned by owner
    When the admin boss confirms deleting owner with the refreshed review
    Then the admin deletion succeeded
    And trip shared was passed to "second"

  Scenario: An admin demoted while their deletion waits is refused without writes
    Given an isolated admin deletion app with admins "boss,other" and members "owner,heir"
    And owner will own trip shared
    And heir will be editor on trip shared since "2026-01-01T00:00:00.000Z"
    When a role change making boss a member holds its locks while the admin boss deletes owner
    Then the admin deletion was refused as "forbidden"
    And the admin deletion kept the account of owner
    And trip shared is still owned by owner

  Scenario: Two admins deleting each other yield exactly one outcome
    Given an isolated admin deletion app with admins "alpha,beta" and members ""
    When the admin alpha deleting beta holds its locks while the admin beta deleting alpha runs
    Then the first admin deletion succeeded
    And the second admin deletion was refused as "forbidden"
    And the admin deletion kept the account of alpha
    And the admin deletion removed the account of beta
    And exactly 1 completed admin remains
