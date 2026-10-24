@feat:profile
Feature: User profile page

  Scenario: Navigate to profile from sidebar
    Given I am signed in
    When I click the user area in the sidebar
    Then I should be on the profile page

  Scenario: Update display name
    Given I am on the profile page
    When I navigate to the Identity section
    And I update my name to "E2E Profile User"
    And I save the Identity section
    Then my name "E2E Profile User" should appear in the sidebar

  Scenario: Change username and sign in with the new one
    Given I am on the profile page
    When I navigate to the Identity section
    And I change my username to a new one and save
    Then the sidebar should show my new username
    When I sign out
    Then I can sign in with my new username

  Scenario: Update preferences
    Given I am on the profile page
    When I navigate to the Preferences section
    And I set currency to "EUR"
    And I save the Preferences section
    Then the currency preference should persist after reload

  Scenario: Identity section is shown by default
    Given I am on the profile page
    Then the Identity section should be active
    And the Identity content should be visible

  Scenario: Switching to Traveler section shows loyalty, passport, and wishlist
    Given I am on the profile page
    When I navigate to the Traveler section
    Then the Traveler content should be visible
    And the Identity content should not be visible

  Scenario: Getting Around preference persists across reload
    Given I am on the profile page
    When I navigate to the Preferences section
    And I set the default transit mode to "Walk"
    And I set the walk threshold to "200 ft"
    And I save the Preferences section
    Then the transit mode should show "Walk"
    And the walk threshold should show "200 ft"
    When I reload the page
    And I navigate to the Preferences section
    Then the transit mode should show "Walk"
    And the walk threshold should show "200 ft"

  Scenario: Font size preference persists across reload
    Given I am on the profile page
    When I navigate to the Appearance section
    And I select "Large" as the font size
    Then the font size select should show "Large"
    When I reload the page
    And I navigate to the Appearance section
    Then the font size select should show "Large"

  Scenario: Dirty-state warning appears when navigating away with unsaved changes
    Given I am on the profile page
    When I navigate to the Identity section
    And I type in the name field
    And I accept the unsaved-changes dialog when switching to the Preferences section
    Then I should be on the Preferences section

  Scenario: No dirty-state warning after discarding changes and returning to section
    Given I am on the profile page
    When I navigate to the Identity section
    And I type in the name field
    And I accept the unsaved-changes dialog when switching to the Traveler section
    And I navigate to the Identity section
    Then switching to the Traveler section should not show a warning

  Scenario: Loyalty number copy button changes to check icon after click
    Given I am on the profile page
    When I navigate to the Traveler section
    Then I should see the loyalty number "TA-123456"
    When I click the copy button for the loyalty number
    Then the copy button should show the copied state

  Scenario: Companions tab shows seeded companion
    Given I am on the profile page
    When I navigate to the Companions section
    Then I should see the companion "Alex Companion"

  Scenario: Add a new companion
    Given I am on the profile page
    When I navigate to the Companions section
    And I add a companion named "Jordan Travel"
    Then I should see the companion "Jordan Travel"

  Scenario: Delete a companion
    Given I am on the profile page
    When I navigate to the Companions section
    And I remove the companion "Alex Companion"
    Then the companion "Alex Companion" should not be visible

  Scenario: Changing my password signs out my other sessions
    Given I am on the profile page
    And I am also signed in on a second device
    When I navigate to the Account section
    And I change my password to "new-password-123"
    Then I should be redirected to the sign-in page
    And I should see the sign-in notice "Password changed"
    And my second device should be signed out

  Scenario: Sign out all devices
    Given I am on the profile page
    And I am also signed in on a second device
    When I open the Security section
    And I sign out all devices
    Then I should be redirected to the sign-in page
    And I should see the sign-in notice "Signed out on all devices"
    And my second device should be signed out

  Scenario: Removing a browser signs it out
    Given I am on the profile page
    And I am also signed in on a second device
    When I open the Security section
    And I remove my other browser
    Then my second device should be signed out

  Scenario: Deleting my account hands a shared trip to the collaborator I pick
    Given I own the shared trip "Handoff Lisbon Escape" with editor "Bo Nilsen" and viewer "Ada Lovelace"
    And I have a pending invite out on my shared trip
    And I am on the profile page
    When I navigate to the Account section
    And I open the delete account dialog
    And I choose "Transfer to Ada Lovelace · viewer" for "Handoff Lisbon Escape"
    And I confirm deleting my account
    Then I should be redirected to the sign-in page
    And "Ada Lovelace" should own my shared trip as its manager
    And my shared trip should have no pending invites

  Scenario: Deleting my account can delete a shared trip on purpose
    Given I own the shared trip "Handoff Kyoto Adventure" with editor "Grace Hopper" and viewer "Marie Curie"
    And I am on the profile page
    When I navigate to the Account section
    And I open the delete account dialog
    And I choose "Delete this trip" for "Handoff Kyoto Adventure"
    And I confirm deleting my account
    Then I should be redirected to the sign-in page
    And my shared trip should no longer exist
