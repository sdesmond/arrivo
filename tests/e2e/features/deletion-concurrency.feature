@feat:deletion-concurrency
Feature: Account deletion against concurrent writers
  Each scenario runs the service calls against an isolated schema with the real foreign keys, holding one
  operation at its locks until the other is verifiably queued behind it.

  Scenario: Trip creation queued behind a deleting owner is refused cleanly
    Given an isolated app with an admin and members "owner"
    When "deletion of owner" holds its locks while "trip creation by owner" runs
    Then "deletion of owner" succeeded
    And "trip creation by owner" was refused with "Signed-in user could not be resolved before trip creation."
    And neither operation hit a deadlock
    And the account of owner no longer exists
    And no trip remains

  Scenario: A trip created before the owner's deletion is handled by the deletion
    Given an isolated app with an admin and members "owner"
    When "trip creation by owner" holds its locks while "deletion of owner" runs
    Then "trip creation by owner" succeeded
    And "deletion of owner" succeeded
    And neither operation hit a deadlock
    And the account of owner no longer exists
    And no trip remains

  Scenario: An invitee deleting their account while accepting leaves no partial state
    Given an isolated app with an admin and members "owner,invitee"
    And owner owns trip shared
    And invitee has a pending editor invitation offer to trip shared from owner
    When "deletion of invitee" holds its locks while "acceptance of invitation offer by invitee" runs
    Then "deletion of invitee" succeeded
    And "acceptance of invitation offer by invitee" accepted nothing
    And neither operation hit a deadlock
    And the account of invitee no longer exists
    And no collaborator row lacks an account
    And no invitation remains

  Scenario: An invitation accepted before the invitee's deletion is removed with the account
    Given an isolated app with an admin and members "owner,invitee"
    And owner owns trip shared
    And invitee has a pending editor invitation offer to trip shared from owner
    When "acceptance of invitation offer by invitee" holds its locks while "deletion of invitee" runs
    Then "acceptance of invitation offer by invitee" succeeded
    And "deletion of invitee" succeeded
    And neither operation hit a deadlock
    And the account of invitee no longer exists
    And no collaborator row lacks an account
    And no invitation remains

  Scenario: An owner's deletion cannot deadlock with an invitee's acceptance
    The held collaborator insert keeps the invitee's user row share-locked, so the acceptance queues on the invitee
    lock and the deletion on the held insert; either may take the trip lock first once it is released.
    Given an isolated app with an admin and members "owner,invitee"
    And owner owns trip shared
    And invitee has a pending editor invitation offer to trip shared from owner
    When "acceptance of invitation offer by invitee" is held at its collaborator insert while "deletion of owner" runs and then releases
    Then "deletion of owner" succeeded
    And neither operation hit a deadlock
    And the account of invitee still exists
    And no collaborator row lacks an account
    And no invitation remains
    And trip shared no longer exists

  Scenario: A manager removing the chosen heir makes the owner's deletion stale
    Given an isolated app with an admin and members "owner,manager,heir"
    And owner owns trip shared
    And manager is manager on trip shared
    And heir is editor on trip shared
    And owner chooses to transfer trip shared to heir
    When "removal of heir from trip shared by manager" holds its locks while "deletion of owner" runs
    Then "removal of heir from trip shared by manager" succeeded
    And "deletion of owner" was refused as stale
    And neither operation hit a deadlock
    And the account of owner still exists
    And trip shared is owned by owner

  Scenario: A manager removing the heir after the deletion is refused as the new creator
    Given an isolated app with an admin and members "owner,manager,heir"
    And owner owns trip shared
    And manager is manager on trip shared
    And heir is editor on trip shared
    And owner chooses to transfer trip shared to heir
    When "deletion of owner" holds its locks while "removal of heir from trip shared by manager" runs
    Then "deletion of owner" succeeded
    And "removal of heir from trip shared by manager" was refused with "The trip creator's seat cannot be changed."
    And neither operation hit a deadlock
    And trip shared is owned by heir
    And heir holds the manager role on trip shared as creator true

  Scenario: A manager re-roling the chosen heir before the deletion still lets the transfer proceed
    A viewer-or-editor heir is a valid choice either way, so the deletion promotes whoever holds the seat.
    Given an isolated app with an admin and members "owner,manager,heir"
    And owner owns trip shared
    And manager is manager on trip shared
    And heir is editor on trip shared
    And owner chooses to transfer trip shared to heir
    When "role change of heir on trip shared by manager" holds its locks while "deletion of owner" runs
    Then "role change of heir on trip shared by manager" succeeded
    And "deletion of owner" succeeded
    And neither operation hit a deadlock
    And the account of owner no longer exists
    And trip shared is owned by heir
    And heir holds the manager role on trip shared as creator true

  Scenario: A manager re-roling the heir after the deletion is refused as the new creator
    Given an isolated app with an admin and members "owner,manager,heir"
    And owner owns trip shared
    And manager is manager on trip shared
    And heir is editor on trip shared
    And owner chooses to transfer trip shared to heir
    When "deletion of owner" holds its locks while "role change of heir on trip shared by manager" runs
    Then "deletion of owner" succeeded
    And "role change of heir on trip shared by manager" was refused with "The trip creator's seat cannot be changed."
    And neither operation hit a deadlock
    And heir holds the manager role on trip shared as creator true

  Scenario: A member leaving before the deletion makes the owner's choice stale
    Given an isolated app with an admin and members "owner,heir"
    And owner owns trip shared
    And heir is editor on trip shared
    And owner chooses to transfer trip shared to heir
    When "leaving of trip shared by heir" holds its locks while "deletion of owner" runs
    Then "leaving of trip shared by heir" succeeded
    And "deletion of owner" was refused as stale
    And neither operation hit a deadlock
    And trip shared is owned by owner
    And heir is not a member of trip shared

  Scenario: A member leaving after the deletion is refused as the new creator
    Given an isolated app with an admin and members "owner,heir"
    And owner owns trip shared
    And heir is editor on trip shared
    And owner chooses to transfer trip shared to heir
    When "deletion of owner" holds its locks while "leaving of trip shared by heir" runs
    Then "deletion of owner" succeeded
    And "leaving of trip shared by heir" was refused with "The trip creator can't leave this trip."
    And neither operation hit a deadlock
    And heir holds the manager role on trip shared as creator true

  Scenario: A manager's change to a trip deleted with the owner is refused as stale
    Given an isolated app with an admin and members "owner,manager,viewer"
    And owner owns trip shared
    And manager is manager on trip shared
    And viewer is viewer on trip shared
    And owner chooses to delete trip shared
    When "deletion of owner" holds its locks while "removal of viewer from trip shared by manager" runs
    Then "deletion of owner" succeeded
    And "removal of viewer from trip shared by manager" was refused as stale
    And neither operation hit a deadlock
    And trip shared no longer exists

  Scenario: A manager invited someone after the manager's account was deleted
    Given an isolated app with an admin and members "owner,manager,guest"
    And owner owns trip shared
    And manager is manager on trip shared
    When "deletion of manager" holds its locks while "invite of guest to trip shared by manager" runs
    Then "deletion of manager" succeeded
    And "invite of guest to trip shared by manager" reported the inviter gone
    And neither operation hit a deadlock
    And the account of manager no longer exists
    And no invitation remains

  Scenario: No invitation survives from a manager who invites and then deletes their account
    Given an isolated app with an admin and members "owner,manager,guest"
    And owner owns trip shared
    And manager is manager on trip shared
    When "invite of guest to trip shared by manager" holds its locks while "deletion of manager" runs
    Then "invite of guest to trip shared by manager" succeeded
    And "deletion of manager" succeeded
    And neither operation hit a deadlock
    And the account of manager no longer exists
    And no invitation remains

  Scenario: Self-service deletion with transfer and delete choices keeps its outcomes
    Given an isolated app with an admin and members "owner,heir,guest"
    And owner owns trip kept
    And owner owns trip dropped
    And heir is editor on trip kept
    And guest is viewer on trip dropped
    And owner chooses to transfer trip kept to heir
    And owner chooses to delete trip dropped
    When owner deletes their account with the chosen outcomes
    Then "deletion of owner" succeeded
    And the deletion summary transfers trip kept to heir and deletes trip dropped with member guest
    And the account of owner no longer exists
    And trip kept is owned by heir
    And heir holds the manager role on trip kept as creator true
    And trip dropped no longer exists
    And guest is not a member of trip dropped

  Scenario: Transfer locks a lower-ID heir before an invitation can hold it
    Given an isolated app with an admin and members "owner,heir"
    And heir has a lower account ID than owner
    And owner owns trip shared
    And heir is viewer on trip shared
    And owner chooses to transfer trip shared to heir
    When "deletion of owner" holds its locks while "invite of heir to trip shared by owner" runs
    Then "deletion of owner" succeeded
    And "invite of heir to trip shared by owner" reported the inviter gone
    And neither operation hit a deadlock
    And trip shared is owned by heir

  Scenario: Transfer waits behind an invitation holding its lower-ID heir
    Given an isolated app with an admin and members "owner,heir"
    And heir has a lower account ID than owner
    And owner owns trip shared
    And heir is viewer on trip shared
    And owner chooses to transfer trip shared to heir
    When the invitation holds its first account lock while the transfer queues
    Then "deletion of owner" succeeded
    And neither operation hit a deadlock
    And trip shared is owned by heir
    And heir holds the manager role on trip shared as creator true

  Scenario: A queued contributor batch loses authority when its manager is deleted
    Given an isolated app with an admin and members "owner,manager,viewer"
    And owner owns trip shared
    And manager is manager on trip shared
    And viewer is viewer on trip shared
    When a contributor batch waits on the trip while its actor is deleted
    Then "deletion of manager" succeeded
    And "removal of viewer from trip shared by manager" was refused as stale
    And neither operation hit a deadlock
    And viewer holds the viewer role on trip shared as creator false

  Scenario Outline: A queued contributor batch loses authority when its manager is removed or demoted
    Given an isolated app with an admin and members "owner,manager,viewer"
    And owner owns trip shared
    And manager is manager on trip shared
    And viewer is viewer on trip shared
    When "<change>" holds its locks while "removal of viewer from trip shared by manager" runs
    Then "<change>" succeeded
    And "removal of viewer from trip shared by manager" was refused as stale
    And neither operation hit a deadlock
    And viewer holds the viewer role on trip shared as creator false

    Examples:
      | change                                          |
      | removal of manager from trip shared by owner     |
      | role change of manager on trip shared by owner   |
