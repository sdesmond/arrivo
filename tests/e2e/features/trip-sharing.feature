@feat:trip-sharing
Feature: Trip sharing dialog
  Background:
    Given I am signed in

  Scenario: A manager views active, pending, and declined sharing rows
    Given I have a trip with sharing rows
    When I go to the current trip
    And I open the sharing dialog
    Then I see the sharing dialog creator row
    And I see the active sharing row
    And I see the pending sharing row
    And I see the declined sharing row

  Scenario: A non-creator manager sees their locked row while another manager stays editable
    Given I am a manager on "Manager Share Trip" owned by "Ada Lovelace"
    And the shared trip has another manager
    When I go to the shared trip
    And I open the sharing dialog
    Then I see my sharing row marked You and locked
    And I see the other manager sharing row is editable

  Scenario: A manager sees an expired pending invitation and can still act on it
    Given I have a trip with sharing rows
    When I go to the current trip
    And I open the sharing dialog
    Then I see the expired pending sharing row
    And I can resend the expired pending sharing invitation
    And I can rescind the expired pending sharing invitation

  Scenario: An editor cannot open trip sharing
    Given I am an editor on "Editor Share Trip" owned by "Ada Lovelace"
    When I go to the shared trip
    Then I do not see the trip Share control

  Scenario: A viewer cannot open trip sharing
    Given I am a viewer on "Viewer Share Trip" owned by "Grace Hopper"
    When I go to the shared trip
    Then I do not see the trip Share control

  Scenario: A manager invites an existing user to the trip
    Given I have a trip with sharing rows
    And there is a registered user I can invite
    When I go to the current trip
    And I open the sharing dialog
    And I invite that user to the trip as an editor
    Then I receive an invitation sent toast
    And I see a pending sharing row for the invited user with the editor role

  Scenario: A manager resends a pending invitation
    Given I have a trip with sharing rows
    When I go to the current trip
    And I open the sharing dialog
    And I resend the pending sharing invitation
    Then I see the pending sharing invitation expiry refresh

  Scenario: A manager rescinds a pending invitation
    Given I have a trip with sharing rows
    When I go to the current trip
    And I open the sharing dialog
    And I rescind the pending sharing invitation
    Then I do not see the pending sharing row

  Scenario: A manager dismisses a declined invitation
    Given I have a trip with sharing rows
    When I go to the current trip
    And I open the sharing dialog
    And I dismiss the declined sharing invitation
    Then I do not see the declined sharing row
    And dismissed sharing invitation remains removed after reopening dialog

  Scenario: A manager cancels a staged role change without applying it
    Given I have a trip with sharing rows
    When I go to the current trip
    And I open the sharing dialog
    And I stage a role change on the active sharing row to viewer
    Then I see contributor change Save and Cancel controls
    And I do not receive a contributor changes toast
    When I cancel the contributor changes
    Then the sharing dialog is closed
    When I open the sharing dialog
    Then the active sharing row still shows the editor role

  Scenario: A manager saves a staged role change and removal as one batch
    Given I have a trip with sharing rows
    And I have an additional removable sharing contributor
    When I go to the current trip
    And I open the sharing dialog
    And I stage a role change on the active sharing row to viewer
    And I stage the removal of the additional sharing contributor
    Then I see contributor change Save and Cancel controls
    When I save the contributor changes
    Then I receive a contributor changes toast
    And the sharing dialog is closed
    When I open the sharing dialog
    Then I do not see the removed additional sharing contributor
    And the active sharing row role is updated to viewer

  Scenario: The Save control is disabled until a change is staged
    Given I have a trip with sharing rows
    When I go to the current trip
    And I open the sharing dialog
    Then the sharing Save control is disabled

  Scenario: Escape does not close the sharing dialog
    Given I have a trip with sharing rows
    When I go to the current trip
    And I open the sharing dialog
    And I stage a role change on the active sharing row to viewer
    And I press Escape to dismiss the sharing dialog
    Then I see contributor change Save and Cancel controls
    And the active sharing row role is updated to viewer

  Scenario: Clicking outside the dialog does not close it
    Given I have a trip with sharing rows
    When I go to the current trip
    And I open the sharing dialog
    And I click outside the sharing dialog
    Then the sharing dialog is not closed

  Scenario: The X button closes the sharing dialog and discards staged changes
    Given I have a trip with sharing rows
    When I go to the current trip
    And I open the sharing dialog
    And I stage a role change on the active sharing row to viewer
    And I close the sharing dialog via the X button
    Then the sharing dialog is closed
    When I open the sharing dialog
    Then the active sharing row still shows the editor role

  Scenario: The sharing dialog shows an accepted invitation without a reload
    Given I have a trip with a pending invitation for a user watching their dashboard
    When I open the sharing dialog with live sync
    And the invited user accepts the invitation from their dashboard
    Then the sharing dialog lists the invited user as an active contributor without reloading

  Scenario: The sharing dialog shows a declined invitation without a reload
    Given I have a trip with a pending invitation for a user watching their dashboard
    When I open the sharing dialog with live sync
    And the invited user declines the invitation from their dashboard
    Then the sharing dialog shows the invited user's invitation as declined without reloading

  Scenario: The sharing dialog drops a contributor who leaves the trip
    Given I have a trip with an editor contributor viewing it in their own session for sharing
    When I open the sharing dialog with live sync
    And the sharing contributor leaves the trip
    Then the sharing dialog no longer lists the sharing contributor without reloading
