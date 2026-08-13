@feat:trip-notes
Feature: Trip Notes
  Background:
    Given I am signed in
    And I have a trip for trip notes

  Scenario: Empty Notes tab shows the New Note action and no capture bar
    When I open the Notes tab
    Then the Notes empty state is visible
    And no note capture bar is visible

  Scenario: Creating a note from the empty state adds it to the top of the list
    When I open the Notes tab
    And I activate New Note
    And I enter "Pack sunscreen" as the note title
    And I enter "Reef-safe only" as the note body
    And I close the note editor
    Then a note row titled "Pack sunscreen" with preview "Reef-safe only" is at the top of the notes list

  Scenario: Creating a note with no title uses the first body line as the implicit title
    When I open the Notes tab
    And I activate New Note
    And I enter "Buy tickets" as the note body
    And I close the note editor
    Then a note row titled "Buy tickets" with preview "Buy tickets" is at the top of the notes list

  Scenario: A newly created note appears above previously created notes
    When I open the Notes tab
    And I activate New Note
    And I enter "First note" as the note title
    And I close the note editor
    And I activate New Note
    And I enter "Second note" as the note title
    And I close the note editor
    Then the notes list shows, in order, "Second note", "First note"

  Scenario: A blank draft is discarded and the empty state remains
    When I open the Notes tab
    And I activate New Note
    And I close the note editor
    Then the Notes empty state is visible

Scenario: Expanding a note reveals its full body in place
    When I open the Notes tab
    And I activate New Note
    And I enter "Packing" as the note title
    And I enter "Sunscreen\nHats" as the note body
    And I close the note editor
    And I expand the note titled "Packing"
    Then the expanded note disclosure measures at least 44 by 44 pixels
    And the note editor shows title "Packing" and body "Sunscreen\nHats" in place

  Scenario: Expanding a second note collapses the first
    When I open the Notes tab
    And I activate New Note
    And I enter "First note" as the note title
    And I enter "First body" as the note body
    And I close the note editor
    And I activate New Note
    And I enter "Second note" as the note title
    And I enter "Second body" as the note body
    And I close the note editor
    And I expand the note titled "First note"
    And I expand the note titled "Second note"
    Then only the note titled "Second note" is expanded

  Scenario: Editing and collapsing a note updates its collapsed wording
    When I open the Notes tab
    And I activate New Note
    And I enter "Packing" as the note title
    And I enter "Sunscreen" as the note body
    And I close the note editor
    And I expand the note titled "Packing"
    And I replace the note title with "Beach packing"
    And I replace the note body with "Hats and towels"
    And I collapse the expanded note
    Then a note row titled "Beach packing" with preview "Hats and towels" is at the top of the notes list

  Scenario: Editing a note preserves its list position
    When I open the Notes tab
    And I activate New Note
    And I enter "First note" as the note title
    And I close the note editor
    And I activate New Note
    And I enter "Second note" as the note title
    And I close the note editor
    And I expand the note titled "First note"
    And I replace the note title with "Updated first"
    And I collapse the expanded note
    Then the notes list shows, in order, "Second note", "Updated first"

  Scenario: Deleting an expanded note removes it and focuses the next disclosure
    When I open the Notes tab
    And I activate New Note
    And I enter "First note" as the note title
    And I close the note editor
    And I activate New Note
    And I enter "Second note" as the note title
    And I close the note editor
    And I expand the note titled "Second note"
    And I request deletion of the expanded note titled "Second note"
    Then the note delete confirmation is visible with Cancel focused
    When I confirm note deletion
    Then the note titled "Second note" is absent and the disclosure for "First note" is focused

  Scenario: Cancelling note deletion leaves its expanded editor intact
    When I open the Notes tab
    And I activate New Note
    And I enter "Packing" as the note title
    And I close the note editor
    And I expand the note titled "Packing"
    And I request deletion of the expanded note titled "Packing"
    When I cancel note deletion
    Then the expanded note titled "Packing" remains and its Trash action is focused

  Scenario: A collapsed note still exposes its delete action
    When I open the Notes tab
    And I activate New Note
    And I enter "Packing" as the note title
    And I close the note editor
    And I request deletion of the collapsed note titled "Packing"
    Then the note delete confirmation is visible with Cancel focused

  Scenario: Deleting only note returns to the empty state
    When I open the Notes tab
    And I activate New Note
    And I enter "Packing" as the note title
    And I close the note editor
    And I expand the note titled "Packing"
    And I request deletion of the expanded note titled "Packing"
    And I confirm note deletion
    Then the Notes empty state is visible

  Scenario: Notes reflow at 320 CSS pixels and 200 percent text size
    When I open the Notes tab
    And I activate New Note
    And I enter "Layout check" as the note title
    And I enter "A long note preview that must remain inside the narrow viewport without horizontal page scrolling" as the note body
    And I close the note editor
    And I set the Notes viewport to 320 CSS pixels wide
    Then the Notes tab and New Note controls measure at least 44 by 44 pixels
    When I resize Notes text to 200 percent
    Then the Notes panel has no horizontal scrolling

  Scenario: Dragging a note through its Reorder handle persists the new order after reload
    Given I have pre-seeded reorder notes for the trip
    When I open the Notes tab
    Then the notes list shows, in order, "First note", "Second note", "Third note"
    When I pointer-drag the note "First note" onto the note "Second note"
    Then the notes list shows, in order, "Second note", "First note", "Third note"
    When I reload the Notes tab
    Then the notes list shows, in order, "Second note", "First note", "Third note"

  Scenario: Keyboard-reordering a note moves it down one position and persists after reload
    Given I have pre-seeded reorder notes for the trip
    When I open the Notes tab
    And I keyboard-move the note "First note" down one position
    Then the notes list shows, in order, "Second note", "First note", "Third note"
    When I reload the Notes tab
    Then the notes list shows, in order, "Second note", "First note", "Third note"

  Scenario: Cancelling a keyboard reorder with Escape leaves the note order unchanged
    Given I have pre-seeded reorder notes for the trip
    When I open the Notes tab
    And I lift the note "First note" for keyboard reordering
    And I press Escape to cancel the reorder
    Then the notes list shows, in order, "First note", "Second note", "Third note"

  Scenario: The Reorder handle measures at least 44 by 44 pixels
    Given I have pre-seeded reorder notes for the trip
    When I open the Notes tab
    Then the reorder handle for "First note" measures at least 44 by 44 pixels
