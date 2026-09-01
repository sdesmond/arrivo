@feat:pending-invitations
Feature: Pending Invitations
  Background:
    Given I am signed in

  Scenario: Accepting a pending invitation redirects to the trip
    Given I have a pending invitation to "Kyoto Adventure" from "Ada Lovelace"
    When I open the trips dashboard
    Then I see a pending invitation row for "Kyoto Adventure" from "Ada Lovelace" with role "Editor"
    When I accept the invitation to "Kyoto Adventure"
    Then I am redirected to the trip "Kyoto Adventure"

  Scenario: Declining a pending invitation shows a toast and removes the row
    Given I have a pending invitation to "Oslo Weekend" from "Bo Nilsen"
    When I open the trips dashboard
    And I decline the invitation to "Oslo Weekend"
    Then I see the toast "Invitation declined."
    And the pending invitation row for "Oslo Weekend" is gone

  Scenario: The sidebar badge shows the pending invitation count
    Given I have a pending invitation to "Lisbon Escape" from "Cy Torres"
    When I open the trips dashboard
    Then the Trips nav badge shows "1" pending invitation

  Scenario: The sidebar badge is hidden when there are no pending invitations
    When I open the trips dashboard
    Then the Trips nav badge is not shown

  Scenario: An expired invitation is excluded from my dashboard and badge
    Given I have an expired invitation to "Expired Getaway" from "Eli Price"
    When I open the trips dashboard
    Then I see no pending invitation row for "Expired Getaway"
    And the Trips nav badge is not shown

  Scenario: An invitation addressed to someone else never appears in my list
    Given someone else has a pending invitation to "Private Trip" from "Dee Byrne"
    When I open the trips dashboard
    Then I see no pending invitation row for "Private Trip"
