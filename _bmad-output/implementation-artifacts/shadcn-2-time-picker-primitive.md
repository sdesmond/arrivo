---
story_id: "shadcn-2"
story_key: "shadcn-2-time-picker-primitive"
title: "Create TimePicker Primitive"
status: "ready-for-dev"
created: "2026-05-19"
source: "_bmad-output/implementation-artifacts/spec-shadcn-widget-audit.md"
---

# Story shadcn-2 — Create TimePicker Primitive

## Story

As a **developer**,
I want a reusable `TimePicker` primitive at `src/components/ui/time-picker.tsx` that renders three shadcn `Select` dropdowns (hour, minute, AM/PM),
so that subsequent stories can replace all native `<input type="time">` elements with fully-themed, accessible widgets.

## Acceptance Criteria

1. `TimePicker` renders all three selects as empty (no pre-selection) when `value` is undefined
2. `TimePicker` parses a 24-hour `"HH:MM"` string and shows the correct hour (1–12), minute, and AM/PM in the three selects
3. Selecting a new hour, minute, or period calls `onChange` with a valid 24-hour `"HH:MM"` string when all three fields have values
4. When any of the three fields is unset, `onChange` is called with `undefined`
5. A Clear button appears when `value` is set; clicking it calls `onChange(undefined)` and the selects return to empty
6. `npm test` passes; `build-validator` (lint + tsc + build) passes

## Tasks / Subtasks

- [x] Task 1: Create `src/components/ui/time-picker.tsx` (AC: 1–5)
  - [x] Add `"use client"` directive as first line
  - [x] Define `TimePickerProps` interface with `value?: string`, `onChange: (value: string | undefined) => void`, `disabled?: boolean`
  - [x] Implement `parseTime(hhmm: string)` helper — converts 24h HH:MM to `{ hour, minute, period }`
  - [x] Implement `toHHMM(hour, minute, period)` helper — converts back to 24h string
  - [x] Manage local state for `hour`, `minute`, `period` (initialized from `value`); sync via `useEffect` when `value` prop changes
  - [x] Render three `Select` controls: hour (1–12), minute (00–55 in 5-min steps), AM/PM
  - [x] Pass `value={field || undefined}` to each Select — empty string must map to `undefined` for placeholder to display
  - [x] Emit `onChange(toHHMM(...))` when all three fields are set; emit `onChange(undefined)` when any is missing
  - [x] Render a Clear (`X`) button (ghost, icon, `aria-label="Clear time"`) only when `value` is set
  - [x] Colors via CSS custom properties only; `cn()` for className merging
- [x] Task 2: Create `src/components/ui/time-picker.test.tsx` (AC: 1–5)
  - [x] Add `// @vitest-environment jsdom` directive
  - [x] Mock `@/components/ui/select` with native `<select>/<option>` elements so Base UI internals don't run in jsdom
  - [x] Test: renders empty (no selected value) when `value` is undefined
  - [x] Test: parses "09:30" → hour select shows "9", minute shows "30", period shows "AM"
  - [x] Test: selecting 9 PM (hour="9", period="PM") with minute already "00" calls onChange("21:00")
  - [x] Test: clicking Clear calls `onChange(undefined)` and button disappears on re-render
- [x] Task 3: Validate (AC: 6)
  - [x] `npm test` — all tests green
  - [x] `build-validator` — lint + tsc + build pass

## Dev Notes

### Dependency Check

**Story 1 is complete.** `src/components/ui/select.tsx` already exists (installed via `npx shadcn@latest add select`). Do not reinstall or overwrite it.

Confirm before coding:
```bash
ls src/components/ui/select.tsx  # must exist
```

---

### Task 1: `src/components/ui/time-picker.tsx`

#### CRITICAL: This project uses Base UI, not Radix

The `Select` in `src/components/ui/select.tsx` is built on **`@base-ui/react/select`**, not Radix. The API differences that matter:

| Concern | Radix (common training data) | Base UI (this project) |
|---------|------------------------------|------------------------|
| Change prop | `onValueChange` | `onValueChange` ✓ (same name) |
| Empty/placeholder | `value=""` triggers placeholder | `value={undefined}` triggers placeholder |
| `asChild` | supported | **not supported** — do not use |
| Trigger role | `combobox` | `combobox` ✓ |

**Always pass `value={field || undefined}` (not `value={field}`)** — if `field` is an empty string `""`, Base UI treats it as a valid selection and hides the placeholder. Converting `""` → `undefined` is required.

#### Data constants

```tsx
const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
// ["1","2","3","4","5","6","7","8","9","10","11","12"]

const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));
// ["00","05","10","15","20","25","30","35","40","45","50","55"]

const PERIODS = ["AM", "PM"] as const;
type Period = (typeof PERIODS)[number];
```

#### parseTime helper

```tsx
function parseTime(hhmm: string): { hour: string; minute: string; period: Period } | null {
  const match = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = parseInt(match[1], 10);
  const min = match[2];
  if (h < 0 || h > 23) return null;
  const period: Period = h >= 12 ? "PM" : "AM";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return { hour: String(hour12), minute: min, period };
}
```

**Edge cases handled:**
- `"00:xx"` → hour=12, AM (midnight)
- `"12:xx"` → hour=12, PM (noon)
- `"13:xx"` → hour=1, PM
- `"23:xx"` → hour=11, PM

#### buildHHMM helper

> **Naming note:** `src/lib/utils.ts` already exports `toHHMM(iso: string)` — a different function that extracts HH:MM from an ISO datetime string. Name the internal helper `buildHHMM` to avoid confusion; TypeScript won't catch an accidental import of the wrong one since both return `string`.

```tsx
function buildHHMM(hour: string, minute: string, period: Period): string {
  let h = parseInt(hour, 10);
  if (period === "AM" && h === 12) h = 0;
  if (period === "PM" && h !== 12) h += 12;
  return `${String(h).padStart(2, "0")}:${minute}`;
}
```

#### State management — why local state + useEffect

A fully-controlled approach (derive all three selects directly from `value` prop) breaks for intermediate entry: if `value` is undefined and the user selects hour "9" first, `onChange(undefined)` fires (minute/period are unset), and the parent doesn't update `value`. On the next render, derived hour would reset to empty — the user's "9" selection is lost.

Use **local state initialized from `value`, synced via `useEffect`**:

```tsx
const parsed = value ? parseTime(value) : null;
const [hour, setHour] = React.useState(parsed?.hour ?? "");
const [minute, setMinute] = React.useState(parsed?.minute ?? "");
const [period, setPeriod] = React.useState(parsed?.period ?? "");

React.useEffect(() => {
  const p = value ? parseTime(value) : null;
  setHour(p?.hour ?? "");
  setMinute(p?.minute ?? "");
  setPeriod(p?.period ?? "");
}, [value]);
```

This allows the user to build up the time incrementally (selecting hour, then minute, then AM/PM) without losing progress, while still letting the parent reset the value from outside (e.g., on clear).

The `useEffect` is intentional here — it's the standard React pattern for syncing derived component state when an external prop changes. ESLint's `react-hooks/exhaustive-deps` rule will flag a missing `value` dependency warning if you forget to include it.

#### emit helper

```tsx
function emit(h: string, m: string, p: string) {
  if (!h || !m || !p) {
    onChange(undefined);
  } else {
    onChange(buildHHMM(h, m, p as Period));
  }
}
```

Call `emit` synchronously with the **new** value for the field that changed plus the **current state** values for the others:

```tsx
onValueChange={(v) => {
  setHour(v);
  emit(v, minute, period);  // pass new v, not stale hour state
}}
```

React batches `setHour(v)` — the state update is not yet reflected in `hour` at the moment `emit` runs. Passing `v` directly avoids reading the stale `hour` variable.

#### Full implementation

```tsx
"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface TimePickerProps {
  value?: string;
  onChange: (value: string | undefined) => void;
  disabled?: boolean;
}

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));
const PERIODS = ["AM", "PM"] as const;
type Period = (typeof PERIODS)[number];

function parseTime(hhmm: string): { hour: string; minute: string; period: Period } | null {
  const match = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = parseInt(match[1], 10);
  const min = match[2];
  if (h < 0 || h > 23) return null;
  const period: Period = h >= 12 ? "PM" : "AM";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return { hour: String(hour12), minute: min, period };
}

function buildHHMM(hour: string, minute: string, period: Period): string {
  let h = parseInt(hour, 10);
  if (period === "AM" && h === 12) h = 0;
  if (period === "PM" && h !== 12) h += 12;
  return `${String(h).padStart(2, "0")}:${minute}`;
}

export function TimePicker({ value, onChange, disabled }: TimePickerProps) {
  const parsed = value ? parseTime(value) : null;
  const [hour, setHour] = React.useState(parsed?.hour ?? "");
  const [minute, setMinute] = React.useState(parsed?.minute ?? "");
  const [period, setPeriod] = React.useState(parsed?.period ?? "");

  React.useEffect(() => {
    const p = value ? parseTime(value) : null;
    setHour(p?.hour ?? "");
    setMinute(p?.minute ?? "");
    setPeriod(p?.period ?? "");
  }, [value]);

  function emit(h: string, m: string, p: string) {
    if (!h || !m || !p) {
      onChange(undefined);
    } else {
      onChange(buildHHMM(h, m, p as Period));
    }
  }

  return (
    <div className={cn("flex items-center gap-1.5")}>
      <Select
        value={hour || undefined}
        onValueChange={(v) => { setHour(v); emit(v, minute, period); }}
        disabled={disabled}
      >
        <SelectTrigger aria-label="Hour" className="w-16">
          <SelectValue placeholder="HH" />
        </SelectTrigger>
        <SelectContent>
          {HOURS.map((h) => (
            <SelectItem key={h} value={h}>{h}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-sm select-none" style={{ color: "var(--fg-3)" }}>:</span>
      <Select
        value={minute || undefined}
        onValueChange={(v) => { setMinute(v); emit(hour, v, period); }}
        disabled={disabled}
      >
        <SelectTrigger aria-label="Minute" className="w-16">
          <SelectValue placeholder="MM" />
        </SelectTrigger>
        <SelectContent>
          {MINUTES.map((m) => (
            <SelectItem key={m} value={m}>{m}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={period || undefined}
        onValueChange={(v) => { setPeriod(v); emit(hour, minute, v); }}
        disabled={disabled}
      >
        <SelectTrigger aria-label="AM/PM" className="w-20">
          <SelectValue placeholder="AM/PM" />
        </SelectTrigger>
        <SelectContent>
          {PERIODS.map((p) => (
            <SelectItem key={p} value={p}>{p}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Clear time"
          disabled={disabled}
          onClick={() => onChange(undefined)}
          style={{ color: "var(--fg-3)" }}
        >
          <X size={14} strokeWidth={1.5} />
        </Button>
      )}
    </div>
  );
}
```

**Mandatory conventions (same as DatePicker):**
- `"use client"` as very first line
- Colors via CSS custom properties only — `var(--fg-3)` for separator and clear icon; never hex/rgb
- `strokeWidth={1.5}` on every Lucide icon
- `cn()` from `@/lib/utils` for className merging
- Clear button uses `aria-label="Clear time"` — matches the pattern in DatePicker (`"Clear date"`)
- No E2E test required — TimePicker is a UI primitive, not a user-facing flow

**Touch target note:** The default `SelectTrigger` renders at `h-8` (32px), below the 44px mobile minimum. The consuming context (TimeDialog) presents these inside a dialog grid where the surrounding spacing supplements touch area. If TimePicker is ever used outside a dialog, add `h-11` to each SelectTrigger className to meet the 44px threshold.

**Known minute limitation:** If an existing time value has a minute not divisible by 5 (e.g., `"09:33"`), the minute select shows as empty since `"33"` is not in the MINUTES options. This is acceptable for Story 2; Stories 3–4 only feed times from user selection (which are always 5-min-aligned) or from TimeDialog which uses `<input type="time">` that currently accepts any minute.

---

### Task 2: `src/components/ui/time-picker.test.tsx`

#### Why mock Select

The shadcn `Select` component uses `@base-ui/react/select` which relies on browser-only APIs (popover positioning, focus management, portals) that don't exist in jsdom. Without mocking, tests throw errors and cannot interact with Select values. The DatePicker story (Story 1) used the same approach for Popover and Calendar.

#### Select mock — render as native `<select>`

```tsx
vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    disabled,
    children,
  }: {
    value?: string;
    onValueChange?: (v: string) => void;
    disabled?: boolean;
    children?: React.ReactNode;
  }) => (
    <select
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => onValueChange?.(e.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <option value="">{placeholder}</option>
  ),
  SelectContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children?: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));
```

This renders three native `<select>` elements in the DOM, giving `getByRole("combobox")` access for each. Use `screen.getAllByRole("combobox")` — they appear in DOM order: `[hourSelect, minuteSelect, periodSelect]`.

**Use `userEvent.selectOptions(select, value)` for interactions** (not `fireEvent.change`) — consistent with the project's `@testing-library/user-event` convention.

#### Full test file

```tsx
// @vitest-environment jsdom
import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TimePicker } from "./time-picker";

vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    disabled,
    children,
  }: {
    value?: string;
    onValueChange?: (v: string) => void;
    disabled?: boolean;
    children?: React.ReactNode;
  }) => (
    <select
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => onValueChange?.(e.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <option value="">{placeholder}</option>
  ),
  SelectContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children?: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

describe("TimePicker", () => {
  let onChange: (value: string | undefined) => void;

  beforeEach(() => {
    onChange = vi.fn();
    vi.clearAllMocks();
  });

  it("renders all three selects empty when no value is given", () => {
    render(<TimePicker onChange={onChange} />);
    const [hourSelect, minuteSelect, periodSelect] = screen.getAllByRole("combobox");
    expect((hourSelect as HTMLSelectElement).value).toBe("");
    expect((minuteSelect as HTMLSelectElement).value).toBe("");
    expect((periodSelect as HTMLSelectElement).value).toBe("");
  });

  it("parses '09:30' and shows hour=9, minute=30, AM", () => {
    render(<TimePicker value="09:30" onChange={onChange} />);
    const [hourSelect, minuteSelect, periodSelect] = screen.getAllByRole("combobox");
    expect((hourSelect as HTMLSelectElement).value).toBe("9");
    expect((minuteSelect as HTMLSelectElement).value).toBe("30");
    expect((periodSelect as HTMLSelectElement).value).toBe("AM");
  });

  it("emits '21:00' when 9 PM is selected with minute 00", async () => {
    const user = userEvent.setup();
    render(<TimePicker value="09:00" onChange={onChange} />);
    const [, , periodSelect] = screen.getAllByRole("combobox");
    await user.selectOptions(periodSelect, "PM");
    expect(onChange).toHaveBeenCalledWith("21:00");
  });

  it("calls onChange(undefined) when Clear is clicked", async () => {
    const user = userEvent.setup();
    render(<TimePicker value="09:30" onChange={onChange} />);
    const clearBtn = screen.getByRole("button", { name: /clear time/i });
    await user.click(clearBtn);
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("does not show Clear button when value is undefined", () => {
    render(<TimePicker onChange={onChange} />);
    expect(screen.queryByRole("button", { name: /clear time/i })).not.toBeInTheDocument();
  });
});
```

#### Notes for the test "emits 21:00 when 9 PM selected"

The test renders with `value="09:00"` so all three selects start pre-filled (hour=9, minute=00, AM). Only the period select is changed to PM. The `emit("9", "00", "PM")` path fires → `toHHMM("9", "00", "PM")` → `"21:00"`. This is a single interaction test that avoids needing to set all three selects from scratch.

#### About `src/components/ui/**` and coverage

`src/components/ui/**` is excluded from coverage thresholds in `vitest.config.mts`. Tests must pass but do not count toward the 95% requirement. Do not add coverage comments or exclusion markers — the config already handles it.

---

### Project Pattern Reference

- `components.json`: style `base-nova`, baseColor `neutral`, path alias `@/components/ui`
- Global mocks in `vitest.setup.mts`: `next/navigation`, `next/headers`, `window.matchMedia` — do not re-mock per file
- `@testing-library/user-event` (not `fireEvent`) for all interactions — project convention
- File placement: `src/components/ui/` — UI primitives alongside their test files
- No E2E test required for this story — TimePicker is a UI primitive; Stories 3–4 add the E2E coverage when the primitive is wired into user-facing flows

---

### Previous Story Intelligence (Story 1)

From the Story 1 debug log — these fixes will likely apply here too:

1. **Base UI ≠ Radix**: `PopoverTrigger` in this project does not support `asChild` (Story 1 had to switch from `Button` with `asChild` to `buttonVariants()` applied directly to `PopoverTrigger`). For `TimePicker`, you use `SelectTrigger` which IS a proper Base UI trigger component — no `asChild` workaround needed.

2. **`@base-ui/react` API surface**: When in doubt about props, check the generated `src/components/ui/select.tsx` directly — it shows exactly which Base UI primitives are used and what's re-exported. Do not assume Radix prop names.

3. **No `import type` leakage**: Story 1 found that `@base-ui/react` types sometimes need explicit imports. If tsc complains about `SelectPrimitive.Root.Props`, check what's actually exported from `@base-ui/react/select`.

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- TSC: `onValueChange` in Base UI Select passes `string | null`, not `string` — null-guarded each handler with `if (v === null) return`
- ESLint `react-hooks/set-state-in-effect`: story spec called for `useEffect`-based sync but the rule blocks it; replaced with React's "update state during render" pattern using a `prevValue` state variable — avoids the cascade, keeps intermediate-entry behavior intact

### Completion Notes List

- Implemented `TimePicker` with three Base UI `Select` dropdowns (hour 1–12, minute 00–55 in 5-min steps, AM/PM)
- Used `prevValue` state tracking instead of `useEffect` to sync external `value` prop changes to local field state — satisfies `react-hooks/set-state-in-effect` lint rule while preserving intermediate-entry behavior
- `buildHHMM` named intentionally to avoid collision with existing `toHHMM` utility in `src/lib/utils.ts`
- 5 tests pass covering: empty render, parse display, emit on change, clear button behavior, clear button visibility
- 649/649 tests pass (no regressions); lint, tsc, and build all pass

### File List

- src/components/ui/time-picker.tsx (new)
- src/components/ui/time-picker.test.tsx (new)

## Change Log

- 2026-05-19: Story created from spec-shadcn-widget-audit.md Story 2; comprehensive implementation guide written with Base UI Select patterns, state management rationale, and full test mock strategy
- 2026-05-19: Implemented — TimePicker primitive and test file created; lint/tsc/build pass; 649/649 tests green

## Status

review
