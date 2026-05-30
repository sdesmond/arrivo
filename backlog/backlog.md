# Backlog of items

## Style

## shadcn updates

### proper sidebar

use https://ui.shadcn.com/docs/components/base/sidebar as an example. The current sidebar does not follow the proper pattern from shadcn. Update the sidebar to follow the pattern at the provided URL.

### breadcrumb

use proper breadcrumbs as shown at https://ui.shadcn.com/docs/components/base/breadcrumb

### Empty state for docs

use https://ui.shadcn.com/docs/components/base/empty as an example. Empty state should show a message like "No trip-level docs yet. Docs attached to an event don't show up here." There should also be a message directing the user to the "add" button to add their first doc.

## Bugs

### incorrect item counts

days, events, docs, collaborators aren't accurate in trip header

### background image changes

- Custom
  - add background option to the custom picker. It should have options that change the stripe pattern. I'm thinking options like "horizontal" "vertical" "slanted" what others?
- open the dialog showing the tab that is currently selected. If I have a custom background, open it to custom, etc.
  - If custom, pre-select the current values in the selects
- image upload just shows filename after upload, not the actual image

### Trip Notes

The Notes tab exists on the trip detail page as a placeholder. The trip-level `notes` field is stored in the DB and wired through the backend, but has no display surface or editing UI yet (the edit sheet input was removed to avoid orphaned data entry).

Needs full design and implementation: display in the Notes tab, editing UX (inline or via a dedicated entry point), and an empty state that communicates what the field is for (general reminders, parking-lot ideas not yet on the itinerary).

## Improvements

### Event move and delete ??????

The icons for moving and deleting an event are too small and faint. Make them more visible.
?????????
