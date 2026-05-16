# Backlog of items

## Bugs

### Checklist bugs

1. The expand arrow is in the same place as the trash icon on hover so it gets covered.
2. I don't see the move handle at all, it should be moveable like other items in the itinerary
3. Initially adding a checklist doesn't behave like it should. Adding a new checklist drops the cursor on the first item (as it should). When I enter an item and hit "enter" the list collapses and doesn't save the item I just typed. After opening the list again and typing, it behaves as it should, enter moves me to a new row in the list. This same behavior should happen initially.

### Trip Notes

The Notes tab exists on the trip detail page as a placeholder. The trip-level `notes` field is stored in the DB and wired through the backend, but has no display surface or editing UI yet (the edit sheet input was removed to avoid orphaned data entry).

Needs full design and implementation: display in the Notes tab, editing UX (inline or via a dedicated entry point), and an empty state that communicates what the field is for (general reminders, parking-lot ideas not yet on the itinerary).

## Improvements

### Event move and delete

The icons for moving and deleting an event are too small and faint. Make them more visible.

## New Features

### Profile

The user displayed at the bottom of the sidenav bar does not match the logged in user. The hard-coded data there should be removed in favor of using the correct user who is logged in.

Clicking on the profile picture/name area should direct to a new page where the profile information is displayed and can be changed, along with a section for settings that allow for app customization.

This settings/profile page needs to be fleshed out
