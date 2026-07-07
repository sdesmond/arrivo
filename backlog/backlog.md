# Backlog of items

## Style

## shadcn updates

### proper sidebar

use https://ui.shadcn.com/docs/components/base/sidebar as an example. The current sidebar does not follow the proper pattern from shadcn. Update the sidebar to follow the pattern at the provided URL.

### breadcrumb

use proper breadcrumbs as shown at https://ui.shadcn.com/docs/components/base/breadcrumb

## Bugs

### Now event

clicking on the event happening now in the active trip card should bring me to the trip, scroll to the day, open the day, and scroll to the highlighted event corresponding to what is happening now. This is not happening.

### Reservations

Given a trip from April 2 - April 5, when I add a flight reservation on April 1, the trip dates automatically expand to include it as they should. When I then manually change the trip dates to April 2 - 5, that reservation is lost from the itinerary view. When the date is set to April 1 and I look at the reservations tab, the flights no longer show that April 1 flight as existing.

Modifying the reservation to a date outside the current trip dates seems to have no effect on the trip dates. A new reservation seems to add days only when it is first created.

### Add Next event for active trips

There is currently a "Now" card when an event is happening now, add a "Next" card showing what is coming up next.

### Delete day

When deleting a day with items in it, I should see the same warnings I get when shortening a trip would delete days.

### move events across days

We need a way to move events across days. Currently shortening a trip can leave events in a unscheduled bucket but there is no way to get them out into a scheduled day.

### Trip Notes

The Notes tab exists on the trip detail page as a placeholder. The trip-level `notes` field is stored in the DB and wired through the backend, but has no display surface or editing UI yet (the edit sheet input was removed to avoid orphaned data entry).

Needs full design and implementation: display in the Notes tab, editing UX (inline or via a dedicated entry point), and an empty state that communicates what the field is for (general reminders, parking-lot ideas not yet on the itinerary).

## Improvements

### Add Zod

Is it worth adding Zod for validation?
