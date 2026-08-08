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
    Then the note editor shows title "Packing" and body "Sunscreen\nHats" in place

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
