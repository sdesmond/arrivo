# Story shadcn-final-verification — Full Suite Verification After All Widget Replacements

**Status:** ready-for-dev
**Epic:** shadcn Widget Audit
**Depends on:** Stories 1–6 all implemented (shadcn-6 code complete, awaiting commit)

---

## User Story

As a developer, I want to confirm that all six shadcn widget audit stories integrate correctly end-to-end — with passing tests, a clean build, and visually correct UI at desktop and mobile viewports — so that the branch is ready to merge.

---

## Acceptance Criteria

1. Story 6 changes committed to branch (`preferences-section.tsx` + `preferences-section.test.tsx`)
2. `npm test` green — all unit tests pass with no failures
3. `build-validator` passes — ESLint, TypeScript, and Next.js build all clean
4. `npm run test:e2e` green — entire E2E suite passes, including `profile.feature`, `preferences-date-format.feature`, and `trips.feature`
5. `desktop-reviewer` agent confirms no visual regressions at 1280px
6. `mobile-reviewer` agent confirms no layout issues at 390px
7. Manual smoke checklist items verified (see below)

---

## Scope of Changes Across All 6 Stories

This is purely a verification story — no new code is written. The work completed by Stories 1–6 is:

| Story | Change |
|-------|--------|
| shadcn-1 | Installed shadcn Select/Popover/Calendar/ToggleGroup; created `DatePicker` primitive |
| shadcn-2 | Created `TimePicker` primitive (three Select dropdowns: hour/minute/AM-PM) |
| shadcn-3 | Replaced `<input type="date">` in trip-edit-sheet, passport-section, companion-row |
| shadcn-4 | Replaced `<Input type="time">` in time-dialog with `<TimePicker>` |
| shadcn-5 | Replaced native `<select>` in theme-select, font-size-select, trip-edit-collaborators |
| shadcn-6 | Replaced raw toggle buttons + raw `<input>` in preferences-section with ToggleGroup + Input |

---

## Step-by-Step Verification Workflow

### Step 1 — Commit Story 6

Story 6 is implemented but not yet committed. Stage and commit:

```bash
git add src/app/'(app)'/profile/preferences-section.tsx
git add src/app/'(app)'/profile/preferences-section.test.tsx
```

Commit message: `shadcn-6 — Replace Toggle Buttons with ToggleGroup + Input`

> **Path note:** the `(app)` segment contains parentheses — always quote paths in bash. Prefer PowerShell for multi-file git staging if bash quoting is tricky.

### Step 2 — Run Unit Tests

```bash
npm test -- --run
```

All tests must pass. Key test files to watch:
- `src/components/ui/date-picker.test.tsx`
- `src/components/ui/time-picker.test.tsx`
- `src/components/packt/time-dialog.test.tsx`
- `src/components/packt/theme-select.test.tsx`
- `src/components/packt/font-size-select.test.tsx`
- `src/components/packt/trip-edit-collaborators.test.tsx`
- `src/app/(app)/profile/passport-section.test.tsx`
- `src/app/(app)/profile/companion-row.test.tsx`
- `src/app/(app)/profile/preferences-section.test.tsx`

If any test fails, fix it before proceeding.

### Step 3 — Run Build Validator

Spawn the `build-validator` agent. It runs ESLint, TypeScript type-checking, and Next.js build in sequence. All three must pass. Fix any errors before proceeding.

### Step 4 — Run E2E Suite

```bash
npm run test:e2e
```

Critical scenarios to watch for regressions:
- `profile.feature` → "Update preferences" (currency via `#pref-currency`)
- `profile.feature` → "Font size preference persists across reload" (theme-select / font-size-select)
- `preferences-date-format.feature` → both scenarios (ToggleGroup date format selection in E2E)
- `trips.feature` → any date-related scenarios (trip-edit-sheet date picker)
- `day-planning.feature` → any time-dialog scenarios

If an E2E scenario fails due to a locator change (e.g., the ToggleGroup button is now `aria-pressed`-based instead of a custom button), update the step definition in `tests/e2e/steps/` — do NOT change `#pref-currency` or `role="status"` which are load-bearing for existing E2E selectors.

### Step 5 — Desktop Visual Review

Spawn the `desktop-reviewer` agent. Navigate these routes and verify:

| Route | What to check |
|-------|--------------|
| `/trips` (trip list) | Trip cards render correctly |
| `/trips/[id]` (trip detail, day planner) | Time dialog — click an event's time, verify TimePicker selects appear |
| `/trips/[id]` (trip edit sheet) | Click Edit Trip → start/end date fields show shadcn date pickers (calendar popover), not native date inputs |
| `/profile` → Identity | No regressions in identity section |
| `/profile` → Preferences | ToggleGroup buttons for date format and distance unit; shadcn Input for currency |
| `/profile` → Appearance | Theme select and font size select use shadcn Select (not native OS dropdowns) |
| `/profile` → Traveler | Passport date picker works; passport text inputs use shadcn styling |

### Step 6 — Mobile Visual Review

Run `mobile-reviewer` agent **after** desktop-reviewer completes (they share one Playwright browser — never in parallel). Same routes, focus on:
- ToggleGroup buttons not overflowing their container on narrow screens
- Date picker popover not clipping off-screen on mobile
- TimePicker selects stacking correctly if needed
- No horizontal scroll introduced anywhere

---

## Manual Smoke Checklist

Run these manually (or confirm via desktop-reviewer screenshots) before marking complete:

- [ ] Trip edit sheet → click start date → calendar popover appears → select a date → date shows in field as formatted string → save works
- [ ] Trip detail → click event time → TimePicker selects (hour/minute/AM-PM) appear → selecting values works → save stores correct HH:MM
- [ ] Profile preferences → click "Day/Month" ToggleGroup button → button becomes active → Save enables → saves successfully
- [ ] Profile preferences → click "Metric" toggle → same pattern
- [ ] Profile appearance → theme select renders as shadcn dropdown (not native OS `<select>`)
- [ ] Profile appearance → font size select same check
- [ ] Profile traveler → passport expiry date picker opens popover calendar
- [ ] Profile companions → expand a companion → passport expiry date picker works

---

## Key Invariants to Preserve

These were identified across stories 1–6 as load-bearing for E2E and must not be changed:

| Invariant | Why |
|-----------|-----|
| `id="pref-currency"` on currency Input | E2E step `page.locator("#pref-currency")` |
| `role="status"` on "Saved" span in each profile section | E2E step waits for `getByRole("status")` |
| `aria-label="Date format"` on ToggleGroup | Accessibility + E2E locator for date format toggle |
| `aria-label="Distance units"` on ToggleGroup | Same |
| `DatePicker` emits ISO YYYY-MM-DD strings via `onChange` | trip-edit-sheet.tsx saves to backend |
| `TimePicker` emits 24-hour HH:MM strings via `onChange` | time-dialog.tsx saves to backend |
| `useSyncExternalStore` guard in theme-select/font-size-select | Prevents SSR hydration mismatch |

---

## Known Gotchas

**ToggleGroup API is Base UI, NOT Radix:**
- `value` prop is `readonly string[]` (array), not a bare string
- `onValueChange(arr, eventDetails)` — first argument is array
- Guard `arr[0] && handler(arr[0])` prevents clearing state on re-click of active item

**DatePicker in trip-edit-sheet expects `string | undefined`:**
The sheet's form state uses `""` for empty. The wiring is `value={value || undefined}` to convert empty string to undefined for the DatePicker.

**E2E database seeds:**
The E2E database has a fixed trip with specific dates seeded in `e2e-seed-data.ts`. Do not assume any trip date values — the E2E scenarios use seed-data constants.

---

## Files Modified by This Sprint (reference)

```
src/components/ui/date-picker.tsx          (new — Story 1)
src/components/ui/date-picker.test.tsx     (new — Story 1)
src/components/ui/time-picker.tsx          (new — Story 2)
src/components/ui/time-picker.test.tsx     (new — Story 2)
src/components/packt/trip-edit-sheet.tsx   (updated — Story 3)
src/app/(app)/profile/passport-section.tsx (updated — Story 3)
src/app/(app)/profile/companion-row.tsx    (updated — Story 3)
src/components/packt/time-dialog.tsx       (updated — Story 4)
src/components/packt/time-dialog.test.tsx  (updated — Story 4)
src/components/packt/theme-select.tsx      (updated — Story 5)
src/components/packt/theme-select.test.tsx (updated — Story 5)
src/components/packt/font-size-select.tsx  (updated — Story 5)
src/components/packt/font-size-select.test.tsx (updated — Story 5)
src/components/packt/trip-edit-collaborators.tsx (updated — Story 5)
src/app/(app)/profile/preferences-section.tsx    (updated — Story 6)
src/app/(app)/profile/preferences-section.test.tsx (new — Story 6)
```

---

## Acceptance Checklist

- [ ] Story 6 changes committed to `update-to-shadcn-components` branch
- [ ] `npm test -- --run` exits 0 (all unit tests green)
- [ ] `build-validator` passes (ESLint + tsc + Next.js build)
- [ ] `npm run test:e2e` exits 0 (full E2E suite green, including preferences-date-format.feature)
- [ ] `desktop-reviewer` shows no visual regressions
- [ ] `mobile-reviewer` shows no overflow or layout issues
- [ ] All manual smoke checklist items checked
- [ ] Branch is ready for PR to main
