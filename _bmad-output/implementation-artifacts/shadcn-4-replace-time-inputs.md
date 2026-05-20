---
story_id: "shadcn-4"
story_key: "shadcn-4-replace-time-inputs"
title: "Replace Time Inputs with TimePicker"
status: "review"
created: "2026-05-20"
source: "_bmad-output/implementation-artifacts/spec-shadcn-widget-audit.md"
---

# Story shadcn-4 — Replace Time Inputs with TimePicker

## Story

As a **user**,
I want the time fields in the event time dialog to use the shadcn hour/minute/AM-PM selector instead of the browser's native time input,
so that time selection is consistently styled with the rest of the app and works identically across all browsers.

## Acceptance Criteria

1. `time-dialog.tsx`: both "Start time" and "End time" fields render `<TimePicker>` — no `<Input type="time">` remains
2. Inline label `div` wrappers for "Start time" and "End time" are replaced with `<Field label="...">` from `src/components/packt/form-section.tsx`
3. The `Input` import is removed from `time-dialog.tsx` (no longer used)
4. `onSave` is still called with the correct `"HH:MM"` strings or `undefined` when using the new `TimePicker`
5. `time-dialog.test.tsx` is updated to use a `TimePicker` mock and all existing behaviour tests still pass
6. `npm test` passes; `build-validator` (lint + tsc + build) passes

## Tasks / Subtasks

- [x] Task 1: Update `src/components/packt/time-dialog.tsx` (AC: 1–3)
  - [x] Remove `Input` from the import block; add `TimePicker` from `@/components/ui/time-picker`
  - [x] Add `Field` from `@/components/packt/form-section` to the import block
  - [x] Replace the "Start time" `div` wrapper + `<Input type="time">` with:
    ```tsx
    <Field label="Start time">
      <TimePicker value={draftTime || undefined} onChange={(v) => setDraftTime(v ?? "")} />
    </Field>
    ```
  - [x] Replace the "End time" `div` wrapper + `<Input type="time">` with:
    ```tsx
    <Field label="End time">
      <TimePicker value={draftEnd || undefined} onChange={(v) => setDraftEnd(v ?? "")} />
    </Field>
    ```
  - [x] Keep the outer `<div className="grid grid-cols-2 gap-3">` wrapper unchanged
  - [x] Keep `handleSave`, `useEffect` sync, Remove button, Cancel/Save logic exactly as-is

- [x] Task 2: Update `src/components/packt/time-dialog.test.tsx` (AC: 5)
  - [x] Add a `vi.mock("@/components/ui/time-picker", ...)` that renders a simple controlled `<input>` so tests can set values
  - [x] Update "pre-fills start time" test — uses `getAllByTestId("time-picker")[0]` with `toHaveValue`
  - [x] Update "pre-fills end time" test — uses `getAllByTestId("time-picker")[1]` with `toHaveValue`
  - [x] Update "syncs draft from time prop" test — uses `getAllByTestId("time-picker")[0]` with `toHaveValue`
  - [x] "Save button calls onSave with pre-filled values" — unchanged (props seed state, just click Save)
  - [x] "Save button calls onSave with undefined when inputs are empty" — unchanged (empty mock emits undefined)
  - [x] All other tests unchanged (Remove, Cancel, eventName, dialog rendering)

- [x] Task 3: Validate (AC: 6)
  - [x] Run `npm test` — all 12 tests green
  - [x] Run `build-validator` — lint + tsc + build pass

## Dev Agent Notes

### Files Being Modified

**`src/components/packt/time-dialog.tsx`** — single file change

Current state (read in full before editing):
- Imports: `Input` from `@/components/ui/input`, `Button`, `Dialog*` from shadcn
- State: `draftTime` (string), `draftEnd` (string); both initialised to `""` from props
- `useEffect` syncs state when `open` flips to true
- `handleSave` calls `onSave(draftTime || undefined, draftEnd || undefined)` — converts empty string to undefined correctly; this behavior must be preserved
- Body: `grid grid-cols-2 gap-3` with two children each being: outer `div` > label-style inner `div` > `<Input type="time">`
- Footer: Remove button (shown only when `time || endTime` prop is truthy), Cancel, Save

What changes:
- Replace `Input` import with `TimePicker` import
- Add `Field` import from `form-section.tsx`
- Replace label `div` + `<Input type="time">` blocks with `<Field label="..."><TimePicker .../></Field>`

What must be preserved:
- The `grid grid-cols-2 gap-3` layout wrapper stays identical
- `handleSave`, `useEffect`, Remove button, Cancel, Save — untouched
- `draftTime` and `draftEnd` state management logic — untouched
- The `TimePicker` `onChange` adapter: `(v) => setDraftTime(v ?? "")` converts `undefined → ""` because state is typed as `string`

### `Field` Component Behavior

`Field` is in `src/components/packt/form-section.tsx`:
```tsx
export function Field({ label, htmlFor, children }: FieldProps) {
  return (
    <div>
      {htmlFor ? <label htmlFor={htmlFor} style={LABEL_STYLE}>{label}</label>
               : <span style={LABEL_STYLE}>{label}</span>}
      {children}
    </div>
  );
}
```

`LABEL_STYLE` already matches the current inline style on the label divs (monospace, 9px, uppercase, weight 600, `var(--fg-4)`, marginBottom 4). Do **not** pass `htmlFor` — `TimePicker` has no single focusable input ID.

### `TimePicker` Contract

Already implemented at `src/components/ui/time-picker.tsx`:
- Props: `value?: string` (HH:MM 24-hour), `onChange: (value: string | undefined) => void`, `disabled?: boolean`
- Empty state = nothing selected (does NOT default to midnight)
- Clear button only appears when `value` is truthy
- Emits `undefined` when any of the three selects is unset

### Test Rewrite Strategy

The existing tests use `getByDisplayValue("10:30")` which works against `<Input type="time" value="10:30">`. After the change, there is no native input with that value — `TimePicker` renders shadcn `Select` controls.

**Mocking strategy (required):** Mock `TimePicker` as a plain `<input data-testid="time-picker">` so tests remain deterministic and don't require Select interaction plumbing. Two pickers render, so use `getAllByTestId("time-picker")[0]` for start and `[1]` for end.

Tests that need updating (all others remain unchanged):
- "pre-fills start time input from time prop" → check `getAllByTestId("time-picker")[0]` has value `"10:30"`
- "pre-fills end time input from endTime prop" → check `getAllByTestId("time-picker")[1]` has value `"11:45"`
- "Save button calls onSave with pre-filled values" → simulate change on mocked inputs to set "09:00" / "10:00", then click Save
- "Save button calls onSave with undefined when inputs are empty" → leave inputs empty (mock onChange emits `undefined` on empty), click Save
- "syncs draft from time prop when dialog transitions from closed to open" → check `getAllByTestId("time-picker")[0]` value after rerender

The Remove button test and all other tests do not touch time inputs and need no changes.

### Import Changes Summary

Remove from `time-dialog.tsx`:
```tsx
import { Input } from "@/components/ui/input";
```

Add to `time-dialog.tsx`:
```tsx
import { TimePicker } from "@/components/ui/time-picker";
import { Field } from "@/components/packt/form-section";
```

### No E2E Changes Required

Story 4 only modifies a UI component. The E2E suite (`trips.feature`) tests saving times via the dialog but drives interactions via real UI clicks — the TimePicker's Select controls are already tested in Story 2 and will work correctly in E2E without story-specific changes.

### Previous Story Intelligence (shadcn-3)

Story 3 followed the same pattern of:
- Replacing a native input with a shadcn primitive
- Adding a `vi.mock(...)` for the new primitive in tests to expose a simple testable interface
- Removing unused imports cleanly

The mock strategy used in shadcn-3 for `DatePicker`:
```tsx
vi.mock("@/components/ui/date-picker", () => ({
  DatePicker: ({ value, onChange, placeholder }: { value?: string; onChange: (v: string | undefined) => void; placeholder?: string }) => (
    <input
      data-testid="date-picker"
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value || undefined)}
    />
  ),
}));
```
Use the same approach for `TimePicker` with `data-testid="time-picker"`.

## Dev Agent Record

### Completion Notes

Implemented exactly as specced. `time-dialog.tsx` now imports `TimePicker` and `Field`; no `Input` remains. The `grid grid-cols-2 gap-3` wrapper and all save/cancel/remove logic are untouched. Test file received the `vi.mock("@/components/ui/time-picker", ...)` block and three display-value assertions were updated to `getAllByTestId("time-picker")[n]` + `toHaveValue`. All 12 unit tests pass; full build (lint + tsc + 664 tests + Next.js build) is green.

### File List

- `src/components/packt/time-dialog.tsx`
- `src/components/packt/time-dialog.test.tsx`

### Change Log

- Replace `<Input type="time">` with `<TimePicker>` + `<Field>` in time-dialog (2026-05-20)
