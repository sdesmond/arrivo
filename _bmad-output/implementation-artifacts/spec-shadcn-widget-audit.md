# Story Plan: Shadcn Widget Audit — Replace Native Inputs with Design-System Components

## Context

Source plan: `backlog/moonlit-greeting-spring.md`

Native `<select>`, `<input type="date">`, and `<input type="time">` elements don't inherit design tokens, look browser-dependent, and lack shadcn accessibility semantics. This plan converts them in 6 sequential BMad stories.

**User preferences confirmed:**
- Date inputs → Popover + Calendar (visual month grid, fully themed)
- Time inputs → Hour/Minute Select dropdowns with AM/PM
- Scope: everything in one coherent pass

---

## How to Run These Stories

For each story below:
1. Run `/bmad-create-story` — paste the story spec as input context
2. Approve the generated story file
3. Run `/bmad-dev-story [story-file-path]` in a **fresh context window**
4. Run `build-validator` after each story to catch errors early

---

## Story 1 — Install shadcn Components + Create `DatePicker` Primitive

**Skills:** `/bmad-create-story` → `/bmad-dev-story`

**Goal:** Add missing shadcn packages and build the reusable DatePicker primitive used in Stories 3–4.

**Install (run first, before any code changes):**
```bash
npx shadcn@latest add select popover calendar toggle-group
```

**New file:** `src/components/ui/date-picker.tsx`
- Props: `value?: string` (ISO YYYY-MM-DD), `onChange: (value: string | undefined) => void`, `placeholder?: string`, `disabled?: boolean`
- Renders: `Popover` → trigger is a `Button` (variant `outline`) showing formatted date or placeholder
- Inside popover: shadcn `Calendar` (single mode)
- Converts between `string ↔ Date` internally; always emits ISO YYYY-MM-DD strings
- "Clear" button when a date is selected

**New test file:** `src/components/ui/date-picker.test.tsx`
- Renders placeholder when no value
- Shows formatted date when value is set
- Calls onChange with ISO string on calendar selection
- Clear resets to undefined

**Acceptance criteria:** `npm test` green; `build-validator` passes.

---

## Story 2 — Create `TimePicker` Primitive

**Skills:** `/bmad-create-story` → `/bmad-dev-story`

**Depends on:** Story 1 (shadcn `Select` must be installed)

**New file:** `src/components/ui/time-picker.tsx`
- Props: `value?: string` (HH:MM 24-hour), `onChange: (value: string | undefined) => void`, `disabled?: boolean`
- Renders: three `Select` controls — hour (1–12), minute (00, 05, 10, …, 55 in 5-min increments), AM/PM
- Empty state = no value selected (do NOT default to midnight)
- Internally splits/recombines HH:MM; emits 24-hour strings
- Clearing all three selects emits `undefined`

**New test file:** `src/components/ui/time-picker.test.tsx`
- Renders empty when no value
- Parses "09:30" → hour=9, min=30, AM
- Emits "21:00" when 9:00 PM selected
- Emits undefined when all fields cleared

**Acceptance criteria:** `npm test` green; `build-validator` passes.

---

## Story 3 — Replace Date Inputs

**Skills:** `/bmad-create-story` → `/bmad-dev-story`

**Depends on:** Story 1 (`DatePicker` must exist)

**Files to modify:**

| File | Lines | Change |
|------|-------|--------|
| `src/components/packt/trip-edit-sheet.tsx` | ~91–96 | Both `<Input type="date">` → `<DatePicker>` |
| `src/app/(app)/profile/passport-section.tsx` | ~73–84 | `<input type="date">` → `<DatePicker>`; other raw `<input>` → shadcn `<Input>`; remove `INPUT_CLASS`/`INPUT_STYLE` constants |
| `src/app/(app)/profile/companion-row.tsx` | ~168–177 | Passport expiry `<input type="date">` → `<DatePicker>`; remaining raw `<input>` → shadcn `<Input>` |

**Tests:** Update any existing test files for these components to work with the new widgets. If none exist, create them.

**Acceptance criteria:** `npm test` green; `build-validator` passes; E2E `trip-edit-sheet.feature` and `profile.feature` still pass.

---

## Story 4 — Replace Time Inputs

**Skills:** `/bmad-create-story` → `/bmad-dev-story`

**Depends on:** Story 2 (`TimePicker` must exist)

**File to modify:** `src/components/packt/time-dialog.tsx` (lines 46–76)

Replace both `<Input type="time">` with `<TimePicker>`:
```tsx
<TimePicker value={draftTime || undefined} onChange={(v) => setDraftTime(v ?? "")} />
<TimePicker value={draftEnd || undefined} onChange={(v) => setDraftEnd(v ?? "")} />
```
Also replace inline label `div` wrappers with the project's `Field` component from `src/components/packt/form-section.tsx`.

**Tests:** Update `src/components/packt/time-dialog.test.tsx` — verify dialog still calls `onSave` with correct HH:MM strings when using the new `TimePicker` selects.

**Acceptance criteria:** `npm test` green; `build-validator` passes.

---

## Story 5 — Replace Native `<select>` Elements

**Skills:** `/bmad-create-story` → `/bmad-dev-story`

**Depends on:** Story 1 (shadcn `Select` must be installed)

**Files to modify:**

| File | Change |
|------|--------|
| `src/components/packt/theme-select.tsx` | Replace native `<select>` with `Select` + `SelectTrigger` + `SelectContent` + `SelectItem`; keep `useSyncExternalStore` hydration guard; pass `disabled={!mounted}` to `SelectTrigger` |
| `src/components/packt/font-size-select.tsx` | Same pattern; keep `useSyncExternalStore` guard and `handleChange` logic; wire to `onValueChange` |
| `src/components/packt/trip-edit-collaborators.tsx` | Lines ~83–97: per-collaborator role `<select>` → `Select` with `disabled={c.role === "owner"}`; lines ~131–138: new-person role `<select>` → `Select`; remove `SELECT_STYLE` and `LABEL_STYLE` constants |

**Tests:**
- `theme-select.test.tsx` — update to use `userEvent.click` to open shadcn Select, then pick item
- `font-size-select.test.tsx` — same pattern
- `trip-edit-collaborators.test.tsx` — update role-change test

**Acceptance criteria:** `npm test` green; `build-validator` passes.

---

## Story 6 — Replace Toggle Buttons with `ToggleGroup` + Raw Inputs

**Skills:** `/bmad-create-story` → `/bmad-dev-story`

**Depends on:** Story 1 (shadcn `toggle-group` must be installed)

**File to modify:** `src/app/(app)/profile/preferences-section.tsx`

Date format toggle (lines ~63–79):
```tsx
<ToggleGroup type="single" value={dateFormat} onValueChange={(v) => v && handleDateFormatChange(v)}>
  {DATE_FORMAT_OPTIONS.map((opt) => (
    <ToggleGroupItem key={opt.value} value={opt.value}>{opt.label}</ToggleGroupItem>
  ))}
</ToggleGroup>
```

Distance unit toggle (lines ~101–117): same ToggleGroup pattern.

Currency field (lines ~83–98): replace raw `<input>` with shadcn `<Input>`.

**Tests:** Update `preferences-section.test.tsx` if it exists; verify toggle and currency field interactions.

**Acceptance criteria:** `npm test` green; `build-validator` passes; `profile.feature` E2E still green.

---

## Final Verification (After All Stories)

Run these in order after Story 6 completes:

1. `npm run build-validator` — 
lint + tsc + build must pass
2. `npm test` — all unit tests green
3. `npm run test:e2e` — existing E2E suite still green
4. Run `desktop-reviewer` agent — visual check at 1280px
5. Run `mobile-reviewer` agent — visual check at 390px (run **sequentially**, NOT in parallel — they share one Playwright browser)

**Manual smoke test checklist:**
- [ ] Trip edit sheet → click start date → calendar popover appears → select date → saves as ISO string
- [ ] Event time dialog → hour/minute selects work → save stores HH:MM
- [ ] Profile preferences → ToggleGroup updates date format and distance unit
- [ ] Theme select and font size select render with shadcn styling (no native OS dropdown)
- [ ] Passport section date picker works; text inputs use shadcn styling
- [ ] Companion row passport expiry date picker works

---

## Story Sequence Summary

```
Story 1: Install packages + DatePicker primitive   ← start here
Story 2: TimePicker primitive                      (after Story 1)
Story 3: Replace date inputs                       (after Story 1)
Story 4: Replace time inputs                       (after Story 2)
Story 5: Replace native selects                    (after Story 1)
Story 6: Replace toggle buttons + inputs           (after Story 1)
```

Stories 2–6 all depend on Story 1. Stories 3, 5, and 6 can run in parallel after Story 1 completes. Story 4 needs Story 2 first.
