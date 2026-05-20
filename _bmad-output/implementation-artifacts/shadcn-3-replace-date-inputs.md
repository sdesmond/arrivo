---
story_id: "shadcn-3"
story_key: "shadcn-3-replace-date-inputs"
title: "Replace Date Inputs with DatePicker"
status: "ready-for-dev"
created: "2026-05-19"
source: "_bmad-output/implementation-artifacts/spec-shadcn-widget-audit.md"
---

# Story shadcn-3 — Replace Date Inputs with DatePicker

## Story

As a **user**,
I want date fields in the trip edit sheet and profile sections to use the shadcn calendar popover instead of the browser's native date input,
so that date selection is consistently styled with the rest of the app and works identically across all browsers.

## Acceptance Criteria

1. `trip-edit-sheet.tsx`: both "Start date" and "End date" fields render `<DatePicker>` — no `<Input type="date">` remains
2. `passport-section.tsx`: "Expiry date" field renders `<DatePicker>`; all other raw `<input>` elements replaced with shadcn `<Input>`; `INPUT_CLASS` and `INPUT_STYLE` constants removed from the file
3. `companion-row.tsx`: "Passport expiry" field renders `<DatePicker>`; all other raw `<input>` elements replaced with shadcn `<Input>`; `INPUT_CLASS` and `INPUT_STYLE` constants removed from the file
4. Existing `trip-edit-sheet.test.tsx` is updated to mock `DatePicker` and all date-related tests still pass
5. `passport-section.test.tsx` exists with tests covering: render, date change, text field change, dirty state, save
6. `companion-row.test.tsx` exists with tests covering: expand/collapse, date picker, text inputs, save, delete
7. `npm test` passes; `build-validator` (lint + tsc + build) passes
8. `npm run test:e2e` passes for `trips.feature` and `profile.feature`

## Tasks / Subtasks

- [x] Task 1: Update `src/components/packt/trip-edit-sheet.tsx` (AC: 1)
  - [x] Import `DatePicker` from `@/components/ui/date-picker`
  - [x] Replace both `<Input type="date">` fields with `<DatePicker>` (distinct placeholders)
  - [x] Wire `onChange` to call `set("startDate", v)` and `set("endDate", v)` (v is `string | undefined`)
- [x] Task 2: Update `src/app/(app)/profile/passport-section.tsx` (AC: 2)
  - [x] Import `DatePicker` and shadcn `Input`
  - [x] Remove `INPUT_CLASS` and `INPUT_STYLE` constants entirely
  - [x] Change `passportExpiry` state type to `string | undefined`; update initializer and dirty check
  - [x] Replace expiry `<input type="date">` with `<DatePicker>`; remove `htmlFor` from its `Field`
  - [x] Replace all remaining raw `<input type="text">` with shadcn `<Input>`; keep all existing props (id, placeholder, autoComplete, onChange)
- [x] Task 3: Update `src/app/(app)/profile/companion-row.tsx` (AC: 3)
  - [x] Import `DatePicker` and shadcn `Input`
  - [x] Remove `INPUT_CLASS` and `INPUT_STYLE` constants entirely
  - [x] Change `passportExpiry` state type to `string | undefined`; update initializer and patch
  - [x] Replace expiry `<input type="date">` with `<DatePicker>`; remove `htmlFor` from its `Field`
  - [x] Replace all remaining raw `<input>` elements with shadcn `<Input>`; preserve `ref={firstFieldRef}` on Name field
  - [x] Keep the Age input as `<Input type="number" min={0} max={120} ...>`
- [x] Task 4: Update `src/components/packt/trip-edit-sheet.test.tsx` (AC: 4)
  - [x] Add `vi.mock("@/components/ui/date-picker", ...)` — render as native text input
  - [x] Update "renders pre-filled start and end dates" test to match new query strategy
  - [x] Update date change tests to use the mock DatePicker's text input
- [x] Task 5: Create `src/app/(app)/profile/passport-section.test.tsx` (AC: 5)
  - [x] Mock `./actions`, `@/components/ui/date-picker`, `@/components/packt/form-section`
  - [x] Tests: renders with no data, renders with existing data, dirty state, DatePicker onChange, text field onChange, save fires action, save disabled when not dirty
- [x] Task 6: Create `src/app/(app)/profile/companion-row.test.tsx` (AC: 6)
  - [x] Mock `./actions`, `@/components/ui/date-picker`
  - [x] Tests: renders collapsed, expands/collapses, DatePicker renders value, text Input onChange, save fires updateCompanion, delete fires deleteCompanion, save disabled when name empty
- [x] Task 7: Validate (AC: 7–8)
  - [x] `npm test` — all tests green
  - [x] `build-validator` — lint + tsc + build pass
  - [x] `npm run test:e2e` — trips.feature and profile.feature pass

---

## Dev Notes

### Dependency Check

**Story 1 is complete.** `src/components/ui/date-picker.tsx` already exists. Verify before coding:
```bash
ls src/components/ui/date-picker.tsx   # must exist
```

The `DatePicker` component was built to this exact interface:
```tsx
export interface DatePickerProps {
  value?: string;           // ISO YYYY-MM-DD
  onChange: (value: string | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
}
```

**Critical implementation note from Story 1:** The actual `DatePicker` uses `PopoverTrigger` directly with `buttonVariants()` className (Base UI doesn't support `asChild`). This doesn't affect Story 3 usage — just import and use normally.

---

### Task 1: `src/components/packt/trip-edit-sheet.tsx`

**Current code (lines 91–96):**
```tsx
<Field label="Start date">
  <Input type="date" value={draft.startDate ?? ""} onChange={(e) => set("startDate", e.target.value)} />
</Field>
<Field label="End date">
  <Input type="date" value={draft.endDate ?? ""} onChange={(e) => set("endDate", e.target.value)} />
</Field>
```

**Replace with:**
```tsx
<Field label="Start date">
  <DatePicker
    value={draft.startDate}
    onChange={(v) => set("startDate", v)}
    placeholder="Start date"
  />
</Field>
<Field label="End date">
  <DatePicker
    value={draft.endDate}
    onChange={(v) => set("endDate", v)}
    placeholder="End date"
  />
</Field>
```

**State compatibility:** `draft.startDate` is already `string | undefined` in `Trip`. `DatePicker.onChange` emits `string | undefined`. `set("startDate", v)` works without change — the `set` function's generic `Trip[K]` type accepts `undefined` for optional fields.

**Import to add:**
```tsx
import { DatePicker } from "@/components/ui/date-picker";
```

Remove the `Input` import if it's no longer used in the file (check the rest of the file first — it's also used for the name and budget fields, so keep it).

**Placeholder values are intentional** — "Start date" and "End date" (not "Pick a date") so the test can find each picker by placeholder text.

---

### Task 2: `src/app/(app)/profile/passport-section.tsx`

**Current state to understand:**
- `INPUT_CLASS` and `INPUT_STYLE` are declared at module level — delete both constants entirely
- There are 4 fields: passport number (text), expiry (date), nationality (text), KTN (text)
- `passportExpiry` state is currently `string` (initialized with `?? ""`)
- The dirty check: `pe !== (user.passportExpiry ?? "")`

**State type change — passportExpiry:**

Current:
```tsx
const [passportExpiry, setPassportExpiry] = useState(user.passportExpiry ?? "");
```

Replace with:
```tsx
const [passportExpiry, setPassportExpiry] = useState<string | undefined>(user.passportExpiry ?? undefined);
```

**Dirty check update:**

Current:
```tsx
pe !== (user.passportExpiry ?? "")
```

Replace with:
```tsx
pe !== (user.passportExpiry ?? undefined)
```

Since `user.passportExpiry` is `string | null`, `?? undefined` converts null → undefined, matching the new state type.

**handleSave change:**

Current:
```tsx
passportExpiry: passportExpiry || undefined,
```

Replace with:
```tsx
passportExpiry: passportExpiry,
```

DatePicker already emits `undefined` when cleared — no need for `|| undefined`.

**Expiry field replacement:**

Remove `htmlFor` from the Field wrapper — a `<label for="...">` pointing to a `<div>` button is invalid. The DatePicker button is self-describing via its content. Pass `placeholder="Expiry date"` so the trigger button carries the field name as its accessible label when no date is selected.

Current:
```tsx
<Field label="Expiry date" htmlFor="passport-expiry">
  <input
    id="passport-expiry"
    type="date"
    value={passportExpiry}
    onChange={(e) => {
      setPassportExpiry(e.target.value);
      onDirtyChange?.(computeDirty(passportNumber, e.target.value, passportNationality, knownTravelerNumber));
    }}
    className={INPUT_CLASS}
    style={INPUT_STYLE}
  />
</Field>
```

Replace with:
```tsx
<Field label="Expiry date">
  <DatePicker
    value={passportExpiry}
    onChange={(v) => {
      setPassportExpiry(v);
      onDirtyChange?.(computeDirty(passportNumber, v, passportNationality, knownTravelerNumber));
    }}
    placeholder="Expiry date"
  />
</Field>
```

**`computeDirty` signature** — `pe: string | undefined` now. Since `user.passportExpiry` is `string | null`, the comparison `pe !== (user.passportExpiry ?? undefined)` works correctly.

**Text field replacements:**

Replace all `<input type="text">` with shadcn `<Input>`. Keep all existing props (id, placeholder, autoComplete, value, onChange). Drop `className={INPUT_CLASS} style={INPUT_STYLE}`.

Example for passport number:
```tsx
<Field label="Passport number" htmlFor="passport-number">
  <Input
    id="passport-number"
    type="text"
    value={passportNumber}
    onChange={(e) => {
      setPassportNumber(e.target.value);
      onDirtyChange?.(computeDirty(e.target.value, passportExpiry, passportNationality, knownTravelerNumber));
    }}
    placeholder="e.g. A12345678"
    autoComplete="off"
  />
</Field>
```

Apply the same pattern to nationality and KTN fields. Preserve all `htmlFor` attributes for text fields — those still work because shadcn `<Input>` renders a native `<input>` element.

**Imports to add:**
```tsx
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
```

---

### Task 3: `src/app/(app)/profile/companion-row.tsx`

**Current state to understand:**
- Same `INPUT_CLASS` / `INPUT_STYLE` pattern as passport-section — delete both
- 7 fields in the expanded form: Name (text, with ref), Age (number), Passport number (text), Passport expiry (date), Nationality (text), KTN (text), Packt username (text)
- `passportExpiry` state is currently `string` (initialized with `?? ""`)
- The save patch does `passportExpiry: passportExpiry || undefined`

**State type change — passportExpiry:**

Current:
```tsx
const [passportExpiry, setPassportExpiry] = useState(companion.passportExpiry ?? "");
```

Replace with:
```tsx
const [passportExpiry, setPassportExpiry] = useState<string | undefined>(companion.passportExpiry ?? undefined);
```

**Save patch change:**

Current:
```tsx
passportExpiry: passportExpiry || undefined,
```

Replace with:
```tsx
passportExpiry: passportExpiry,
```

**Expiry field replacement:**

Remove `htmlFor` from the Field wrapper for the same reason as passport-section. Pass `placeholder="Passport expiry"` so the trigger button carries a meaningful accessible name when no date is selected.

Current:
```tsx
<Field label="Passport expiry" htmlFor={`companion-expiry-${companion.id}`}>
  <input
    id={`companion-expiry-${companion.id}`}
    type="date"
    value={passportExpiry}
    onChange={(e) => setPassportExpiry(e.target.value)}
    className={INPUT_CLASS}
    style={INPUT_STYLE}
  />
</Field>
```

Replace with:
```tsx
<Field label="Passport expiry">
  <DatePicker
    value={passportExpiry}
    onChange={(v) => setPassportExpiry(v)}
    placeholder="Passport expiry"
  />
</Field>
```

**Text and number field replacements:**

Replace all raw `<input>` with shadcn `<Input>`. Drop `className` and `style` (INPUT_CLASS/INPUT_STYLE). Keep all other props.

**Critical: preserve `ref` on Name field.** Shadcn's `Input` component uses `{...props}` spread on `@base-ui/react/input`, which forwards all props including `ref`. In React 19, `ref` is a regular prop — the spread preserves it.

```tsx
<Field label="Name" htmlFor={`companion-name-${companion.id}`}>
  <Input
    ref={firstFieldRef}
    id={`companion-name-${companion.id}`}
    type="text"
    value={name}
    onChange={(e) => setName(e.target.value)}
    autoComplete="off"
  />
</Field>
```

**Age field is `type="number"` — keep it:**
```tsx
<Field label="Age" htmlFor={`companion-age-${companion.id}`}>
  <Input
    id={`companion-age-${companion.id}`}
    type="number"
    min={0}
    max={120}
    value={age}
    onChange={(e) => setAge(e.target.value)}
  />
</Field>
```

**`useRef` type does not change** — stays `useRef<HTMLInputElement>`. The `Input` component renders a native `<input>` through `@base-ui/react/input` so the DOM ref type is correct.

**Imports to add:**
```tsx
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
```

---

### Task 4: Update `src/components/packt/trip-edit-sheet.test.tsx`

**Add DatePicker mock** at the top (before the component import):

```tsx
vi.mock("@/components/ui/date-picker", () => ({
  DatePicker: ({
    value,
    onChange,
    placeholder = "Pick a date",
  }: {
    value?: string;
    onChange: (v: string | undefined) => void;
    placeholder?: string;
  }) => (
    <input
      type="text"
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value || undefined)}
    />
  ),
}));
```

**Why this mock:** Renders two native text inputs (one per DatePicker). Tests can find the start picker by `getByPlaceholderText("Start date")` and the end picker by `getByPlaceholderText("End date")`. The `value ?? ""` ensures `getByDisplayValue("2026-06-01")` still works for the start picker.

**Tests that need updating:**

1. **"renders pre-filled start and end dates"** — `getByDisplayValue` still works since mock renders `value="2026-06-01"` and `value="2026-06-10"`. No change needed.

2. **"onSave includes updated start date"** — `getByDisplayValue("2026-06-01")` works. `user.clear()` + `user.type()` triggers `onChange("2026-07-01")`. No change needed.

3. **"onSave includes updated end date"** — Same. `getByDisplayValue("2026-06-10")` works. No change needed.

4. **"does not render a status select"** — Currently checks `queryByRole("combobox")`. The DatePicker mock renders `<input type="text">`, NOT a combobox. This test still passes.

**All other existing tests remain unchanged** — they don't touch the date fields.

---

### Task 5: Create `src/app/(app)/profile/passport-section.test.tsx`

`src/app/(app)/profile/` is excluded from coverage thresholds (not in `src/components/packt/**` or `src/lib/**`). Tests must pass but don't count toward 95%.

```tsx
// @vitest-environment jsdom
import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("./actions", () => ({
  updateProfile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/components/ui/date-picker", () => ({
  DatePicker: ({
    value,
    onChange,
    placeholder = "Pick a date",
  }: {
    value?: string;
    onChange: (v: string | undefined) => void;
    placeholder?: string;
  }) => (
    <input
      data-testid="date-picker"
      type="text"
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value || undefined)}
    />
  ),
}));

vi.mock("@/components/packt/form-section", () => ({
  Section: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Field: ({ children, label }: { children: React.ReactNode; label: string; htmlFor?: string }) => (
    <div>
      <label>{label}</label>
      {children}
    </div>
  ),
}));

import { PassportSection } from "./passport-section";
import type { UserProfile } from "@/data/types";

const baseUser: UserProfile = {
  id: "u1",
  name: "Test",
  email: "t@t.com",
  dateFormat: "MM/DD/YYYY",
  currency: "USD",
  distanceUnit: "imperial",
  passportNumber: null,
  passportExpiry: null,
  passportNationality: null,
  knownTravelerNumber: null,
  loyaltyNumbers: [],
  wishlistDestinations: [],
  companions: [],
};

describe("PassportSection", () => {
  it("renders empty fields when user has no passport data", () => {
    render(<PassportSection user={baseUser} />);
    expect(screen.getByPlaceholderText("e.g. A12345678")).toBeInTheDocument();
    expect(screen.getByTestId("date-picker")).toBeInTheDocument();
  });

  it("renders pre-filled passport number and expiry when set", () => {
    const user = { ...baseUser, passportNumber: "AB123456", passportExpiry: "2030-01-01" };
    render(<PassportSection user={user} />);
    expect(screen.getByDisplayValue("AB123456")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2030-01-01")).toBeInTheDocument();
  });

  it("Save button is disabled when no fields are dirty", () => {
    render(<PassportSection user={baseUser} />);
    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
  });

  it("Save button enables when a text field is changed", async () => {
    const user = userEvent.setup();
    render(<PassportSection user={baseUser} />);
    await user.type(screen.getByPlaceholderText("e.g. A12345678"), "X12345");
    expect(screen.getByRole("button", { name: /save/i })).not.toBeDisabled();
  });

  it("Save button enables when expiry date is changed via DatePicker", async () => {
    const user = userEvent.setup();
    render(<PassportSection user={baseUser} />);
    await user.type(screen.getByTestId("date-picker"), "2030-06-01");
    expect(screen.getByRole("button", { name: /save/i })).not.toBeDisabled();
  });

  it("calls updateProfile with updated passport number on save", async () => {
    const { updateProfile } = await import("./actions");
    const user = userEvent.setup();
    render(<PassportSection user={baseUser} />);
    await user.type(screen.getByPlaceholderText("e.g. A12345678"), "CD999");
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ passportNumber: "CD999" })
    );
  });
});
```

**Notes:**
- `useTransition` works in Vitest with jsdom — `startTransition` calls the callback synchronously in test environments
- `updateProfile` mock resolves immediately so `isPending` flips to false synchronously
- The `form-section` mock strips out `htmlFor` to avoid label-for mismatches in tests
- `src/app/(app)/profile/` not under coverage thresholds — tests just need to pass

---

### Task 6: Create `src/app/(app)/profile/companion-row.test.tsx`

```tsx
// @vitest-environment jsdom
import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("./actions", () => ({
  updateCompanion: vi.fn().mockResolvedValue(undefined),
  deleteCompanion: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/components/ui/date-picker", () => ({
  DatePicker: ({
    value,
    onChange,
  }: {
    value?: string;
    onChange: (v: string | undefined) => void;
    placeholder?: string;
  }) => (
    <input
      data-testid="date-picker"
      type="text"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || undefined)}
    />
  ),
}));

vi.mock("@/components/packt/form-section", () => ({
  Field: ({ children, label }: { children: React.ReactNode; label: string; htmlFor?: string }) => (
    <div>
      <label>{label}</label>
      {children}
    </div>
  ),
}));

import { CompanionRow } from "./companion-row";
import type { Companion } from "@/data/types";

const baseCompanion: Companion = {
  id: "c1",
  name: "Alice Travel",
  age: 30,
  passportNumber: "PA001",
  passportExpiry: "2028-06-01",
  passportNationality: "American",
  knownTravelerNumber: null,
  packtUsername: null,
};

describe("CompanionRow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders companion name in collapsed state", () => {
    render(<CompanionRow companion={baseCompanion} />);
    expect(screen.getByText("Alice Travel")).toBeInTheDocument();
    expect(screen.queryByTestId("date-picker")).not.toBeInTheDocument();
  });

  it("renders companion age alongside name", () => {
    render(<CompanionRow companion={baseCompanion} />);
    expect(screen.getByText("(30)")).toBeInTheDocument();
  });

  it("expands to show edit form on Edit button click", async () => {
    const user = userEvent.setup();
    render(<CompanionRow companion={baseCompanion} />);
    await user.click(screen.getByRole("button", { name: /edit alice travel/i }));
    expect(screen.getByTestId("date-picker")).toBeInTheDocument();
  });

  it("shows pre-filled passport expiry in DatePicker after expand", async () => {
    const user = userEvent.setup();
    render(<CompanionRow companion={baseCompanion} />);
    await user.click(screen.getByRole("button", { name: /edit alice travel/i }));
    expect(screen.getByDisplayValue("2028-06-01")).toBeInTheDocument();
  });

  it("collapses form when Cancel is clicked", async () => {
    const user = userEvent.setup();
    render(<CompanionRow companion={baseCompanion} />);
    await user.click(screen.getByRole("button", { name: /edit alice travel/i }));
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByTestId("date-picker")).not.toBeInTheDocument();
  });

  it("calls updateCompanion with patch on Save", async () => {
    const { updateCompanion } = await import("./actions");
    const user = userEvent.setup();
    render(<CompanionRow companion={baseCompanion} />);
    await user.click(screen.getByRole("button", { name: /edit alice travel/i }));
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    expect(updateCompanion).toHaveBeenCalledWith("c1", expect.objectContaining({ name: "Alice Travel" }));
  });

  it("calls updateCompanion with updated expiry from DatePicker", async () => {
    const { updateCompanion } = await import("./actions");
    const user = userEvent.setup();
    render(<CompanionRow companion={baseCompanion} />);
    await user.click(screen.getByRole("button", { name: /edit alice travel/i }));
    const datePicker = screen.getByTestId("date-picker");
    await user.clear(datePicker);
    await user.type(datePicker, "2031-12-31");
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    expect(updateCompanion).toHaveBeenCalledWith("c1", expect.objectContaining({ passportExpiry: "2031-12-31" }));
  });

  it("calls deleteCompanion when Remove button is clicked", async () => {
    const { deleteCompanion } = await import("./actions");
    const user = userEvent.setup();
    render(<CompanionRow companion={baseCompanion} />);
    await user.click(screen.getByRole("button", { name: /remove alice travel/i }));
    expect(deleteCompanion).toHaveBeenCalledWith("c1");
  });

  it("Save button is disabled when name is cleared", async () => {
    const user = userEvent.setup();
    render(<CompanionRow companion={baseCompanion} />);
    await user.click(screen.getByRole("button", { name: /edit alice travel/i }));
    const nameInput = screen.getByDisplayValue("Alice Travel");
    await user.clear(nameInput);
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
  });
});
```

**Notes:**
- `getByRole("button", { name: /edit alice travel/i })` — button `aria-label` is `"Edit Alice Travel"` (see companion-row.tsx line 107)
- `getByRole("button", { name: /remove alice travel/i })` — matches `"Remove Alice Travel"`
- `getByRole("button", { name: /^save$/i })` — exact "Save" to avoid matching "Saving…"
- `useTransition` in jsdom: `startTransition` runs synchronously; the mock resolves, so `isPending` goes false after the click
- `firstFieldRef` on Name input: no special handling needed in tests — JSDOM doesn't throw on `.focus()` calls

---

### Key Patterns from Previous Stories

**Story 1 (DatePicker) debug log — relevant to Story 3:**
- Base UI `PopoverTrigger` does not support `asChild` — this is already handled inside `date-picker.tsx`. Story 3 just uses `<DatePicker>` and doesn't need to worry about it.
- `initialFocus` was removed from react-day-picker v9 — already handled in Story 1's Calendar usage.

**Story 2 (TimePicker) debug log — relevant to Story 3:**
- `onValueChange` in Base UI Select passes `string | null` (not just `string`) — not relevant for DatePicker, which uses Popover/Calendar rather than Select.
- The `react-hooks/set-state-in-effect` lint rule may fire if you use `useEffect` for state sync — not applicable to Story 3 (no derived sync state needed here).

**Mandatory project conventions:**
- `"use client"` already present in all three files — don't move or remove it
- `cn()` from `@/lib/utils` — not needed for these changes (DatePicker handles its own className)
- Colors via CSS custom properties — Input and DatePicker both handle this internally
- `strokeWidth={1.5}` on all Lucide icons — DatePicker internals already comply; no new icons added in Story 3

---

### File Placement Rules

| File | Category | Coverage tracked? |
|------|----------|------------------|
| `src/components/packt/trip-edit-sheet.tsx` | Domain component (UPDATE) | Yes — src/components/packt/** |
| `src/components/packt/trip-edit-sheet.test.tsx` | Unit test (UPDATE) | Yes |
| `src/app/(app)/profile/passport-section.tsx` | App route component (UPDATE) | No — src/app/** excluded |
| `src/app/(app)/profile/passport-section.test.tsx` | Unit test (CREATE) | No |
| `src/app/(app)/profile/companion-row.tsx` | App route component (UPDATE) | No |
| `src/app/(app)/profile/companion-row.test.tsx` | Unit test (CREATE) | No |

---

### E2E Impact

**`trips.feature`** has two scenarios:
1. "User edits a trip's name" — uses the trip edit sheet but only edits the name field, not dates. Safe.
2. "Keyboard user can open the trip edit sheet" — tests keyboard navigation/focus, not date fields. Safe.

**`profile.feature`** has a scenario "Switching to Traveler section shows loyalty, passport, and wishlist" — checks the section is visible but does not interact with the date picker. Safe.

No E2E test additions needed for Story 3. The E2E suite verifies the flow still works end-to-end after the swap.

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- `Trip.startDate` is typed as `string` (required), not `string | undefined` — `DatePicker.onChange` emits `string | undefined`, so `onChange={(v) => set("startDate", v ?? "")}` needed to satisfy the type constraint
- `Companion.knownTravelerNumber` and `packtUsername` are optional (`string | undefined`), not nullable — test fixture used `null` which caused TSC failure; fixed to `undefined` and added required `position: 0` field

### Completion Notes List

- Replaced both `<Input type="date">` fields in `trip-edit-sheet.tsx` with `<DatePicker>` using distinct "Start date" / "End date" placeholders
- Updated `passport-section.tsx`: removed `INPUT_CLASS`/`INPUT_STYLE` constants, replaced all raw inputs with shadcn `<Input>`, replaced expiry date input with `<DatePicker>`, updated `passportExpiry` state to `string | undefined`
- Updated `companion-row.tsx`: same constant removal and input replacement, `<DatePicker>` for expiry, `ref={firstFieldRef}` preserved on Name via props spread
- Added `DatePicker` vi.mock to `trip-edit-sheet.test.tsx`; existing date tests continue to pass via `getByDisplayValue` on the mock's text input
- Created `passport-section.test.tsx` with 6 tests covering render, dirty state, DatePicker onChange, text field onChange, and save
- Created `companion-row.test.tsx` with 9 tests covering collapse/expand, DatePicker value, text inputs, save, delete, and disabled state
- All 664 unit tests pass; LINT/TSC/BUILD all pass; trips.feature (2/2) and profile.feature (13/13) E2E pass

### File List

**UPDATE:**
- src/components/packt/trip-edit-sheet.tsx
- src/components/packt/trip-edit-sheet.test.tsx
- src/app/(app)/profile/passport-section.tsx
- src/app/(app)/profile/companion-row.tsx

**CREATE:**
- src/app/(app)/profile/passport-section.test.tsx
- src/app/(app)/profile/companion-row.test.tsx

## Change Log

- 2026-05-19: Story created from spec-shadcn-widget-audit.md Story 3; full implementation guide with exact code diffs, test strategies, and E2E impact analysis
- 2026-05-19: Implemented all 7 tasks; replaced native date inputs with DatePicker in trip-edit-sheet, passport-section, and companion-row; created test files for passport-section and companion-row; all validations pass

## Status

review
