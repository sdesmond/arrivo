# Backlog of items

## Bugs

### Trip Notes

The Notes tab exists on the trip detail page as a placeholder. The trip-level `notes` field is stored in the DB and wired through the backend, but has no display surface or editing UI yet (the edit sheet input was removed to avoid orphaned data entry).

Needs full design and implementation: display in the Notes tab, editing UX (inline or via a dedicated entry point), and an empty state that communicates what the field is for (general reminders, parking-lot ideas not yet on the itinerary).

## Improvements

### Event move and delete ??????

The icons for moving and deleting an event are too small and faint. Make them more visible.
?????????

## New Features

### Profile

The user displayed at the bottom of the sidenav bar does not match the logged in user. The hard-coded data there should be removed in favor of using the correct user who is logged in.

Clicking on the profile picture/name area should direct to a new page where the profile information is displayed and can be changed, along with a section for settings that allow for app customization.

This settings/profile page needs to be fleshed out
