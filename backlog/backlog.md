# Backlog of items

## Style

## shadcn updates

### proper sidebar

use https://ui.shadcn.com/docs/components/base/sidebar as an example. The current sidebar does not follow the proper pattern from shadcn. Update the sidebar to follow the pattern at the provided URL.

### breadcrumb

use proper breadcrumbs as shown at https://ui.shadcn.com/docs/components/base/breadcrumb

## Bugs

### Counts on the trip preview cards

Counts for Days, Docs, Collaborators are not working. Add Places in there to match the trip hero card as well.

### Trip Notes

The Notes tab exists on the trip detail page as a placeholder. The trip-level `notes` field is stored in the DB and wired through the backend, but has no display surface or editing UI yet (the edit sheet input was removed to avoid orphaned data entry).

Needs full design and implementation: display in the Notes tab, editing UX (inline or via a dedicated entry point), and an empty state that communicates what the field is for (general reminders, parking-lot ideas not yet on the itinerary).

## Improvements

### Event move and delete ??????

The icons for moving and deleting an event are too small and faint. Make them more visible.
?????????

- The active trip should always be at the top of the list

## Packing Template stuff

### Character caps

1. Titles capped at 50 chars
1. Items capped at 50 chars (template and trip-level)

## Trip packing list

1. Items should have checkboxes, not radio buttons

## Adding to a section

1. "add" item at the end of a section should be indented to match the items and have placeholder "add to [section name]"
1. after adding from any input, focus should return to that same input for easy multi-add

### Ability to have multiples lists

1. create multiple lists like packing templates page
