# Story shadcn-5 — Replace Native `<select>` Elements

**Status:** review
**Epic:** shadcn Widget Audit
**Depends on:** Story 1 (shadcn `Select` is already installed at `src/components/ui/select.tsx`)

---

## User Story

As a user, I want all dropdown menus in the app to look and feel like the rest of the design system, so that theme, font size, and collaborator role selects are visually consistent and accessible rather than showing native OS dropdowns.

---

## Acceptance Criteria

1. `ThemeSelect` renders a shadcn `Select` (no native `<select>`); selecting "Dark" calls `setTheme("dark")`
2. `FontSizeSelect` renders a shadcn `Select`; selecting "Small" writes to localStorage and applies the CSS variable
3. `TripEditCollaborators` per-collaborator role dropdowns use shadcn `Select` with `disabled` when role is `"owner"`
4. `TripEditCollaborators` new-person role dropdown uses shadcn `Select`; default is `"editor"`
5. `SELECT_STYLE` and `LABEL_STYLE` constants are removed from `trip-edit-collaborators.tsx`
6. All three test files pass with updated interaction patterns
7. `npm test` green; `build-validator` passes

---

## Files to Modify

| File | Change |
|------|--------|
| `src/components/packt/theme-select.tsx` | Replace `<select>` with `Select + SelectTrigger + SelectContent + SelectItem`; keep `useSyncExternalStore` guard; `disabled={!mounted}` on `SelectTrigger` |
| `src/components/packt/font-size-select.tsx` | Same pattern; keep `useSyncExternalStore` guard; refactor `handleChange` to accept string value directly; wire to `onValueChange` |
| `src/components/packt/trip-edit-collaborators.tsx` | Replace both native `<select>` elements with shadcn `Select`; remove `SELECT_STYLE` and `LABEL_STYLE` constants |
| `src/components/packt/theme-select.test.tsx` | Update to click-based interaction (open trigger → click option) |
| `src/components/packt/font-size-select.test.tsx` | Same pattern |
| `src/components/packt/trip-edit-collaborators.test.tsx` | Update role-change test |

---

## Critical Architecture Context

### The Select component is Base UI, NOT Radix

`src/components/ui/select.tsx` wraps `@base-ui/react/select`, **not** the Radix UI Select that ships with standard shadcn. The exported API is:

```tsx
import {
  Select,           // = SelectPrimitive.Root — takes value, onValueChange
  SelectTrigger,    // renders button[role=combobox]; accepts disabled prop
  SelectContent,    // portal + positioner + popup
  SelectItem,       // list item; accepts value prop
  SelectValue,      // renders the current value text
} from "@/components/ui/select";
```

**Do NOT import from `@radix-ui/react-select`.** Use the project's own `@/components/ui/select` exports.

### Basic usage pattern

```tsx
<Select value={currentValue} onValueChange={(v) => doSomething(v)}>
  <SelectTrigger aria-label="Label here" disabled={someCondition}>
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="opt1">Option 1</SelectItem>
    <SelectItem value="opt2">Option 2</SelectItem>
  </SelectContent>
</Select>
```

`onValueChange` receives the selected string value directly — no synthetic event.

---

## File-by-File Implementation Guide

### 1. `theme-select.tsx`

**Current state (lines 22–43):** renders a native `<select>` with `value`, `onChange`, `disabled={!mounted}`, and inline `style` prop.

**Required outcome:**

```tsx
"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const THEME_OPTIONS = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const;

export function ThemeSelect() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    /* istanbul ignore next */
    () => /* istanbul ignore next */ () => {},
    () => true,
    () => false
  );

  return (
    <Select value={mounted ? (theme ?? "system") : "system"} onValueChange={(v) => setTheme(v)}>
      <SelectTrigger aria-label="Theme" disabled={!mounted}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {THEME_OPTIONS.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

Drop the `style` prop — the shadcn `SelectTrigger` inherits theme tokens automatically.

### 2. `font-size-select.tsx`

**Current state:** renders a native `<select>` with an event-based `handleChange(e: React.ChangeEvent<HTMLSelectElement>)`.

**Key change:** `handleChange` must be refactored to accept a string value, since `onValueChange` passes the value directly:

```tsx
function handleChange(next: FontSizeValue) {
  setValue(next);
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // localStorage unavailable
  }
  applyFontSize(next);
}
```

Wire up:
```tsx
<Select value={value} onValueChange={(v) => handleChange(v as FontSizeValue)}>
  <SelectTrigger aria-label="Font size" disabled={!mounted}>
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    {SIZES.map((opt) => (
      <SelectItem key={opt.value} value={opt.value}>
        {opt.label}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

Keep `useState`, `useEffect`, `useSyncExternalStore`, `applyFontSize`, `readStorage` — all logic stays, only the event handler signature and JSX change.

### 3. `trip-edit-collaborators.tsx`

**Two native selects to replace:**

**Per-collaborator role select (lines ~83–97):**
```tsx
<Select
  value={c.role}
  onValueChange={(v) => onUpdateRole(i, v as CollaboratorRole)}
>
  <SelectTrigger disabled={c.role === "owner"} aria-label={`Role for ${c.name}`}>
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="owner">Owner</SelectItem>
    <SelectItem value="editor">Editor</SelectItem>
    <SelectItem value="viewer">Viewer</SelectItem>
  </SelectContent>
</Select>
```

**New-person role select (lines ~131–138):**
```tsx
<Select value={newRole} onValueChange={(v) => setNewRole(v as CollaboratorRole)}>
  <SelectTrigger aria-label="New person role">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="editor">Editor</SelectItem>
    <SelectItem value="viewer">Viewer</SelectItem>
  </SelectContent>
</Select>
```

**Remove:**
- The `LABEL_STYLE` constant (lines 9–18) — delete it
- The `SELECT_STYLE` constant (lines 20–29) — delete it
- The `style={{ ...LABEL_STYLE, marginBottom: 2 }}` inline usage on the "Add person" label span — remove the style prop; leave the span text
- All references to these constants throughout the file

Add to imports:
```tsx
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
```

---

## Test Update Guide

### Critical: Base UI Select test interaction pattern

The native `<select>` tests used `fireEvent.change(element, { target: { value: 'x' } })` or `userEvent.selectOptions`. These **will not work** with Base UI Select (it renders a custom button + portal popup).

**New pattern:**
```tsx
// 1. Click the trigger to open the dropdown
await user.click(screen.getByRole("combobox", { name: /theme/i }));
// 2. Click the option in the popup (rendered in document.body portal)
await user.click(await screen.findByRole("option", { name: /dark/i }));
// 3. Assert callback
expect(mockSetTheme).toHaveBeenCalledWith("dark");
```

Use `findByRole` (async) for the options because the popup appears after a click — it may not be in the DOM synchronously.

### `theme-select.test.tsx` — full rewrite

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockSetTheme = vi.fn();
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "system", setTheme: mockSetTheme }),
}));

import { ThemeSelect } from "./theme-select";

describe("ThemeSelect", () => {
  it("renders a combobox trigger labelled Theme", () => {
    render(<ThemeSelect />);
    expect(screen.getByRole("combobox", { name: /theme/i })).toBeInTheDocument();
  });

  it("calls setTheme when an option is selected", async () => {
    const user = userEvent.setup();
    render(<ThemeSelect />);
    await user.click(screen.getByRole("combobox", { name: /theme/i }));
    await user.click(await screen.findByRole("option", { name: /dark/i }));
    expect(mockSetTheme).toHaveBeenCalledWith("dark");
  });
});
```

Note: the old test checked for `<option>` elements with `getByRole("option")` outside the dropdown. These no longer exist as native elements — options only appear after clicking the trigger.

### `font-size-select.test.tsx` — update interactions

Replace the `fireEvent.change` call with click-based interaction:

```tsx
it("saves selection to localStorage, applies CSS variable, and sets data attribute on change", async () => {
  const user = userEvent.setup();
  render(<FontSizeSelect />);
  await user.click(await screen.findByRole("combobox", { name: /font size/i }));
  await user.click(await screen.findByRole("option", { name: /small/i }));
  expect(localStorageMock.getItem("packt-font-size")).toBe("small");
  expect(mockSetProperty).toHaveBeenCalledWith("--font-size-base", "13px");
  expect(mockDataset.fontSize).toBe("small");
});
```

The "renders Small, Medium, Large options" test must change: options are only visible after clicking the trigger, so:
```tsx
it("renders Small, Medium, and Large options", async () => {
  const user = userEvent.setup();
  render(<FontSizeSelect />);
  await user.click(await screen.findByRole("combobox", { name: /font size/i }));
  expect(await screen.findByRole("option", { name: /small/i })).toBeInTheDocument();
  expect(await screen.findByRole("option", { name: /medium/i })).toBeInTheDocument();
  expect(await screen.findByRole("option", { name: /large/i })).toBeInTheDocument();
});
```

The "defaults to Medium" and "reads stored preference" tests can continue checking the trigger's visible text via `getByText` or checking which option appears selected after opening.

The "disabled before hydration" test: check `toBeDisabled()` on `getByRole("combobox")` (the trigger).

### `trip-edit-collaborators.test.tsx` — update role-change test

The test that uses `screen.getAllByRole("combobox")` + `userEvent.selectOptions` must change:

```tsx
it("calls onUpdateRole when role select changes", async () => {
  const user = userEvent.setup();
  const onUpdateRole = vi.fn();
  render(
    <TripEditCollaborators
      collaborators={collaborators}
      onRemove={vi.fn()}
      onUpdateRole={onUpdateRole}
      onAdd={vi.fn()}
    />
  );
  // Click the first role trigger (Alice = editor)
  const triggers = screen.getAllByRole("combobox");
  await user.click(triggers[0]);
  await user.click(await screen.findByRole("option", { name: /viewer/i }));
  expect(onUpdateRole).toHaveBeenCalledWith(0, "viewer");
});
```

Also update the "new role select" test (last test in file) similarly — click the last trigger, then click the target option.

The "owner role cannot be removed" test: verify the role trigger for the owner is disabled:
```tsx
it("owner role select is disabled", () => {
  // ...render with owner collaborator...
  const triggers = screen.getAllByRole("combobox");
  expect(triggers[0]).toBeDisabled();
});
```

---

## What Must Be Preserved

- `ThemeSelect`: `useSyncExternalStore` hydration guard — keep it verbatim (including the `/* istanbul ignore next */` comments)
- `ThemeSelect`: the `useTheme` hook integration — `theme` → display value, `setTheme` → callback
- `FontSizeSelect`: all of `applyFontSize`, `readStorage`, `STORAGE_KEY`, `DEFAULT`, `SIZES` — only the JSX and `handleChange` signature change
- `FontSizeSelect`: `useEffect(() => { applyFontSize(readStorage()); }, [])` — this must remain to apply the stored preference on mount
- `TripEditCollaborators`: `handleAdd`, `newName`/`newEmail`/`newRole` state, `onRemove`/`onUpdateRole`/`onAdd` callbacks — all business logic stays
- `TripEditCollaborators`: the existing `Input` usage for Name/Email fields (already shadcn) — do not touch
- `TripEditCollaborators`: `disabled={!newName.trim() || !newEmail.trim()}` on the Add button — stays

---

## Conventions Checklist

- `"use client"` already present on all three files — keep it
- Import from `@/components/ui/select` (not a third-party package)
- No `style` prop on `SelectTrigger` — tokens are handled by the component
- `aria-label` on every `SelectTrigger` (required for accessibility; the label is not visible in the trigger)
- `strokeWidth={1.5}` on any Lucide icons (already compliant; don't regress)
- No `any` types — cast role values with `as CollaboratorRole` / `as FontSizeValue`
- No hardcoded hex/rgb — existing inline styles already use CSS vars; don't add new ones

---

## Dev Notes

### Why `SELECT_STYLE`/`LABEL_STYLE` can be deleted
They exist solely to style the native `<select>` to match the design system. The shadcn `SelectTrigger` already uses theme tokens — no manual CSS needed.

### Testing Base UI Select in JSDOM
Base UI's Select uses a Portal (`SelectPrimitive.Portal`). In JSDOM, the portal content renders into `document.body`. `screen.findByRole("option")` will find it because Testing Library queries the entire document. Use async `findByRole` (not `getByRole`) for options since the popup may animate in.

### The `handleChange` signature change in FontSizeSelect
Currently `handleChange` accepts `React.ChangeEvent<HTMLSelectElement>` and reads `e.target.value`. After the change it accepts `FontSizeValue` directly. This is a cleaner API — no synthetic event needed.

### Collaborator role selects and `disabled` state
The per-collaborator Select for `owner` role should be `disabled`. The shadcn `SelectTrigger` renders a native `button` so `disabled` works as expected — the trigger is grayed out and non-interactive.

---

## Dev Agent Record

### Completion Notes

All six files updated as specced. Native `<select>` replaced with Base UI `Select` + `SelectTrigger` + `SelectContent` + `SelectItem` in all three components. `SELECT_STYLE` and `LABEL_STYLE` constants removed from `trip-edit-collaborators.tsx`. `handleChange` in `FontSizeSelect` refactored to accept `FontSizeValue` directly. `onValueChange` null-guards added (`?? "system"`) due to Base UI typing `string | null`.

Test rewrite: replaced `fireEvent.change` / `userEvent.selectOptions` with click-based open-then-pick interaction; `documentElement` mock in font-size test replaced with `vi.spyOn` to avoid breaking Base UI's portal. New `owner role select is disabled` test added to trip-edit-collaborators. 15 targeted tests pass; full suite 675/675 green; build-validator (lint + tsc + build) passes.

Appearance tab layout updated: `justify-between` replaced with `gap-2` inline rows + `style={{ width: 130 }}` wrapper so both selects share the same width. `SelectValue` given `className="capitalize"` to display title-cased labels from lowercase value strings.

### File List

- `src/components/packt/theme-select.tsx`
- `src/components/packt/font-size-select.tsx`
- `src/components/packt/trip-edit-collaborators.tsx`
- `src/components/packt/theme-select.test.tsx`
- `src/components/packt/font-size-select.test.tsx`
- `src/components/packt/trip-edit-collaborators.test.tsx`
- `src/app/(app)/profile/page-client.tsx`

### Change Log

- Replace native `<select>` with shadcn Select in ThemeSelect, FontSizeSelect, TripEditCollaborators (2026-05-20)
- Remove SELECT_STYLE / LABEL_STYLE constants from trip-edit-collaborators (2026-05-20)
- Update all three test files to click-based Base UI Select interactions (2026-05-20)
- Fix appearance tab layout: equal-width selects, labels close to their controls (2026-05-20)
