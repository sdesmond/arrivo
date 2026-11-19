@feat:deletion-concurrency
Feature: Account deletion against concurrent writers
  Collaboration races use authenticated HTTP requests and scenario-owned rows. PostgreSQL blocker PIDs
  prove each operation has queued before its lock is released. Trip creation keeps its isolated fixture.

  @invitation-rename-race
  Scenario: A username changed while HTTP invitation waits is not retargeted
    Given an HTTP invitation race with an existing invitee
    When the invitee is renamed while the HTTP invitation waits for their account lock
    Then the HTTP invitation reports no account without creating an invitation or effects

  @deletion-http-accept
  Scenario Outline: HTTP invitation acceptance serializes with invitee deletion
    Given an HTTP acceptance race with a pending invitation
    When the HTTP acceptance races account deletion with "<first>" queued first
    Then the HTTP acceptance race leaves no partial membership or invitation

    Examples:
      | first      |
      | acceptance |
      | deletion   |

  @deletion-http-invite
  Scenario Outline: HTTP invitation creation serializes with invitee deletion
    Given an HTTP invitation race with an existing invitee
    When the HTTP invitation races account deletion with "<first>" queued first
    Then the HTTP invitation race leaves no invitation for the deleted account

    Examples:
      | first      |
      | invitation |
      | deletion   |

  @deletion-http-manager
  Scenario Outline: HTTP invitation creation serializes with manager deletion
    Given an HTTP invitation race with a manager and guest
    When the HTTP manager invitation races manager deletion with "<first>" queued first
    Then the deleted manager leaves no invitation

    Examples:
      | first      |
      | invitation |
      | deletion   |

  @deletion-http-member
  Scenario Outline: HTTP membership changes serialize with owner deletion
    Given an HTTP "<operation>" race with a chosen heir
    When the HTTP membership operation races owner deletion with "<first>" queued first
    Then the HTTP membership race respects the transfer decision

    Examples:
      | operation | first    |
      | removal   | operation |
      | removal   | deletion  |
      | role      | operation |
      | role      | deletion  |
      | leave     | operation |
      | leave     | deletion  |

  @deletion-http-demotion
  Scenario Outline: A queued HTTP contributor change loses manager authority
    Given an HTTP "removal" race with a chosen heir
    And the heir is a viewer for authorization races
    When the owner applies "<change>" to the manager while their HTTP removal waits
    Then the HTTP removal is refused and the heir remains a viewer

    Examples:
      | change   |
      | demotion |
      | removal  |

  @deletion-http-manager-batch
  Scenario: A queued HTTP contributor change loses authority when its manager is deleted
    Given an HTTP "removal" race with a chosen heir
    And the heir is a viewer for authorization races
    When the manager is deleted while their HTTP removal waits on the trip
    Then the HTTP removal is refused and the heir remains a viewer

  @deletion-http-deleted-trip
  Scenario: A queued HTTP contributor change is refused after owner deletion removes the trip
    Given an HTTP "removal" race with a chosen heir
    When owner deletion of the trip holds its lock while HTTP removal queues
    Then the HTTP removal conflicts and the trip is gone

  @deletion-http-owner
  Scenario: Owner deletion and HTTP acceptance cannot deadlock around a held membership insert
    Given an HTTP acceptance race with a pending invitation
    When HTTP acceptance and owner deletion queue behind a held membership insert
    Then owner deletion removes the trip without a partial invitation or ghost membership

  @deletion-http-lock-order
  Scenario: Owner transfer waits for HTTP invitation holding the lower-ID heir lock
    Given an HTTP invitation race with a lower-ID heir
    When HTTP invitation holds the heir lock while owner transfer queues
    Then owner transfer succeeds without retargeting the invitation

  @deletion-http-lock-order
  Scenario: HTTP invitation waits behind owner transfer holding the lower-ID heir lock
    Given an HTTP invitation race with a lower-ID heir
    When owner transfer holds the heir lock while HTTP invitation queues
    Then owner transfer succeeds and the deleted owner cannot invite

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

