---
title: 'Event chip dialog button layout consistency'
type: 'bugfix'
created: '2026-05-14'
status: 'done'
route: 'one-shot'
---

## Intent

**Problem:** The four event chip dialogs (time, location, cost, attach) had inconsistent button layouts — Remove appeared in different positions, was missing a Cancel button in the time dropdown, and the label "Clear" was used instead of "Remove".

**Approach:** Standardize all edit dialogs to Remove on far left (conditional on having a value), Cancel + Save grouped on far right. Rename "Clear" → "Remove" in the time picker and add a Cancel button.

## Suggested Review Order

- [`src/components/packt/time-picker-dropdown.tsx`](../../src/components/packt/time-picker-dropdown.tsx) — renamed Clear→Remove, added Cancel, made Remove conditional on `time||endTime`
- [`src/components/packt/location-dialog.tsx`](../../src/components/packt/location-dialog.tsx) — `sm:mr-auto` on conditional Remove, Cancel+Save wrapped in flex group
- [`src/components/packt/cost-dialog.tsx`](../../src/components/packt/cost-dialog.tsx) — same pattern as location-dialog
- [`src/components/packt/time-picker-dropdown.test.tsx`](../../src/components/packt/time-picker-dropdown.test.tsx) — updated /clear/i→/remove/i, added Cancel and conditional visibility tests
