should ---
title: 'Remove editable status field from trip edit sheet'
type: 'bugfix'
created: '2026-05-15'
status: 'done'
route: 'one-shot'
---

# Remove editable status field from trip edit sheet

## Intent

**Problem:** The trip edit sheet exposed a `<select>` allowing users to manually set trip status to any value (draft/upcoming/active/past), violating the invariant that status is always computed from start/end dates.

**Approach:** Delete the Status field entirely from the edit sheet. The computed status is already displayed elsewhere in the app and needs no representation in the edit form.

## Suggested Review Order

- [`src/components/packt/trip-edit-sheet.tsx`](../../src/components/packt/trip-edit-sheet.tsx) — editable select removed; `TripStatus` import dropped
- [`src/components/packt/trip-edit-sheet.test.tsx`](../../src/components/packt/trip-edit-sheet.test.tsx) — two combobox tests replaced with one asserting no combobox present
