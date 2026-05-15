# Backlog of items

## Bugs

### Trip status in edit sheet
The trip status is mentioned in the edit sheet, but this should be a purely calculated field.  Trip status should be displayed throughout the app but it should never be a field the user can edit.

### Trip Notes
The trip notes are not displayed anywhere.  I can add them in the edit sheet, but they don't display anywhere outside of that.  

Add in a place where trip notes would be viewable.

## Improvements

### Code Cleanup
Add automated tools to cleanup code after each change to keep consistent standards.  Something like Prettier or some other auto-formatter should work.  This would likely need to be added as a hook, but propose any alternate solutions as well.

### Events show in the wrong order in the itinerary
When changing an event's time, it moves to its appropriate spot in the daily timeline.  The events don't seem to respect AM vs PM though.  If choose 1:00 AM, for example, it orders it between events in the afternoon instead of in the morning where it belongs.


### Event move and delete
The icons for moving and deleting an event are too small and faint.  Make them more visible 

## New Features

### Profile
The user displayed at the bottom of the sidenav bar does not match the logged in user.  The hard-coded data there should be removed in favor of using the correct user who is logged in.

Clicking on the profile picture/name area should direct to a new page where the profile information is displayed and can be changed, along with a section for settings that allow for app customization.

This settings/profile page needs to be fleshed out


### Add non-event Itinerary Items
I want to be able to add things other than events to the itinerary.  To distinguish between itinerary item types, each should have a distinct icon that represents whether it is an event, a checklist, or a note.  The current "event" icon should be a GPS marker


#### Checklists
This will enable me to add reminders or prep items between events.  This should be a checklist that I can interact with by checking off the items in the list.

I should also be able to click to edit the items just like a day note

Suggest an appropriate icon for the "checklist" type

#### Notes
I want to be able to add a note at any point in the itinerary.  This should be a simple text field for writing a free-form note.

Suggest an appropriate icon for the "note" type

