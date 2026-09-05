@feat:revocation-modal
Feature: Contributor revocation modal
  Scenario: A contributor is removed while viewing the trip
    Given I am signed in
    And I have a contributor viewing my trip in their own session
    When I remove the contributor from the trip and save
    Then the contributor's session shows a message that they were removed from the trip, naming me
    And the removal message cannot be dismissed
    When the contributor's session clicks OK
    Then the contributor's session is on the trips page

  Scenario: A manager with staged share-dialog changes is removed
    Given I am signed in
    And I have a co-manager with a staged contributor removal in their own session
    When I remove the co-manager from the trip and save
    Then the co-manager's session shows a message that they were removed from the trip, naming me
    And the co-manager's session no longer shows the share dialog
    When the co-manager's session clicks OK
    Then the co-manager's session is on the trips page
    And the staged removal was discarded
