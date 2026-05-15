# Backlog of items

## Bugs

### Checklist bugs

1. The expand arrow is in the same place as the trash icon on hover so it gets covered.
2. I don't see the move handle at all, it should be moveable like other items in the itinerary
3. Initially adding a checklist doesn't behave like it should. Adding a new checklist drops the cursor on the first item (as it should). When I enter an item and hit "enter" the list collapses and doesn't save the item I just typed. After opening the list again and typing, it behaves as it should, enter moves me to a new row in the list. This same behavior should happen initially.

### Trip status in edit sheet

The trip status is mentioned in the edit sheet, but this should be a purely calculated field. Trip status should be displayed throughout the app but it should never be a field the user can edit.

### Trip Notes

The trip notes are not displayed anywhere. I can add them in the edit sheet, but they don't display anywhere outside of that.

Add in a place where trip notes would be viewable.

## Improvements

### Event move and delete

The icons for moving and deleting an event are too small and faint. Make them more visible.

## New Features

### Profile

The user displayed at the bottom of the sidenav bar does not match the logged in user. The hard-coded data there should be removed in favor of using the correct user who is logged in.

Clicking on the profile picture/name area should direct to a new page where the profile information is displayed and can be changed, along with a section for settings that allow for app customization.

This settings/profile page needs to be fleshed out

### Add non-event Itinerary Items

I want to be able to add things other than events to the itinerary. To distinguish between itinerary item types, each should have a distinct icon that represents whether it is an event, a checklist, or a note. The current "event" icon should be a GPS marker

#### Checklists

This will enable me to add reminders or prep items between events. This should be a checklist that I can interact with by checking off the items in the list.

I should also be able to click to edit the items just like a day note

Suggest an appropriate icon for the "checklist" type

#### Notes

I want to be able to add a note at any point in the itinerary. This should be a simple text field for writing a free-form note.

Suggest an appropriate icon for the "note" type
