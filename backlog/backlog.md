# Backlog of items

## shadcn updates

### proper sidebar

use https://ui.shadcn.com/docs/components/base/sidebar as an example. The current sidebar does not follow the proper pattern from shadcn. Update the sidebar to follow the pattern at the provided URL.

### breadcrumb

use proper breadcrumbs as shown at https://ui.shadcn.com/docs/components/base/breadcrumb

### Empty state for docs

use https://ui.shadcn.com/docs/components/base/empty as an example. Empty state should show a message like "No trip-level docs yet. Docs attached to an event don't show up here." There should also be a message directing the user to the "add" button to add their first doc.

## Bugs

### Trip Notes

The Notes tab exists on the trip detail page as a placeholder. The trip-level `notes` field is stored in the DB and wired through the backend, but has no display surface or editing UI yet (the edit sheet input was removed to avoid orphaned data entry).

Needs full design and implementation: display in the Notes tab, editing UX (inline or via a dedicated entry point), and an empty state that communicates what the field is for (general reminders, parking-lot ideas not yet on the itinerary).

## Improvements

### Event move and delete ??????

The icons for moving and deleting an event are too small and faint. Make them more visible.
?????????

## Doc upload stuff

The tests were ordered so that they pass because one test doesn't do its own setup. This needs to be fixed

The empty state check fails because the "Upload" scenario adds a doc that persists through the "Delete" scenario. Fixing by reordering — put Delete before Upload so only the seeded doc exists.

```
Scenario: Upload a PDF to the Documents tab
When I upload a file named "boarding-pass.pdf" with MIME type "application/pdf"
Then the document "boarding-pass.pdf" appears in the Documents list

Scenario: Delete a document from the Documents tab
Given the Documents tab has one seeded document
When I delete the document "E2E Boarding Pass"
Then the document "E2E Boarding Pass" is no longer visible
And the empty state message is shown
```
