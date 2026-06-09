# Backlog of items

## Style

## shadcn updates

### proper sidebar

use https://ui.shadcn.com/docs/components/base/sidebar as an example. The current sidebar does not follow the proper pattern from shadcn. Update the sidebar to follow the pattern at the provided URL.

### breadcrumb

use proper breadcrumbs as shown at https://ui.shadcn.com/docs/components/base/breadcrumb

## Bugs

### Delete day

When deleting a day with items in it, I should see the same warnings I get when shortening a trip would delete days.

### move events across days

We need a way to move events across days. Currently shortening a trip can leave events in a unscheduled bucket but there is no way to get them out into a scheduled day.

### Trip Notes

The Notes tab exists on the trip detail page as a placeholder. The trip-level `notes` field is stored in the DB and wired through the backend, but has no display surface or editing UI yet (the edit sheet input was removed to avoid orphaned data entry).

Needs full design and implementation: display in the Notes tab, editing UX (inline or via a dedicated entry point), and an empty state that communicates what the field is for (general reminders, parking-lot ideas not yet on the itinerary).

## Improvements
