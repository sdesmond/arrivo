---
story_id: "shadcn-1"
story_key: "shadcn-1-date-picker-primitive"
title: "Install shadcn Components + Create DatePicker Primitive"
status: "review"
created: "2026-05-19"
source: "_bmad-output/implementation-artifacts/spec-shadcn-widget-audit.md"
---

# Story shadcn-1 — Install shadcn Components + Create DatePicker Primitive

## Story

As a **developer**,
I want the shadcn `select`, `popover`, `calendar`, and `toggle-group` packages installed and a reusable `DatePicker` primitive available at `src/components/ui/date-picker.tsx`,
so that subsequent stories can replace all native `<input type="date">` and `<select>` elements with fully-themed, accessible widgets.

## Acceptance Criteria

1. `npx shadcn@latest add select popover calendar toggle-group` runs without error; all 4 files appear in `src/components/ui/`
2. `DatePicker` renders a placeholder string when `value` is undefined; no Clear button is visible
3. `DatePicker` renders the human-readable formatted date when `value` is an ISO YYYY-MM-DD string
4. Selecting a day in the Calendar calls `onChange` with a YYYY-MM-DD ISO string and closes the popover
5. Clicking the Clear button calls `onChange(undefined)` and hides the button
6. `npm test` passes; `build-validator` (lint + tsc + build) passes

## Tasks / Subtasks

- [x] Task 1: Install shadcn packages (AC: 1)
  - [x] Run `npx shadcn@latest add select popover calendar toggle-group` in the project root
  - [x] Confirm 4 new files in `src/components/ui/`: `select.tsx`, `popover.tsx`, `calendar.tsx`, `toggle-group.tsx`
  - [x] Confirm `date-fns` and `react-day-picker` are in `package.json` dependencies (shadcn calendar installs them)
- [x] Task 2: Create `src/components/ui/date-picker.tsx` (AC: 2–5)
  - [x] Add `"use client"` directive
  - [x] Define `DatePickerProps` interface with correct types
  - [x] Implement Popover trigger (Button variant="outline") showing formatted date or placeholder
  - [x] Implement Calendar (mode="single") inside PopoverContent
  - [x] Emit ISO YYYY-MM-DD on date selection via `format(date, "yyyy-MM-dd")` from date-fns
  - [x] Parse incoming `value` with `parseISO` from date-fns (not `new Date()`)
  - [x] Add separate Clear button that renders only when `value` is set
- [x] Task 3: Create `src/components/ui/date-picker.test.tsx` (AC: 2–5)
  - [x] Test: renders placeholder when no value; Clear button absent
  - [x] Test: shows formatted date when `value="2026-05-19"` → "May 19, 2026"
  - [x] Test: selecting calendar day calls onChange with ISO string
  - [x] Test: clicking Clear calls onChange(undefined)
- [x] Task 4: Validate (AC: 6)
  - [x] `npm test` — all tests green
  - [x] `build-validator` — lint + tsc + build pass

## Dev Notes

### Task 1: Install

```bash
npx shadcn@latest add select popover calendar toggle-group
```

This must run **before any code changes**. The CLI auto-installs `date-fns` and `react-day-picker` as peer deps. Do not manually create `popover.tsx`, `calendar.tsx`, `select.tsx`, or `toggle-group.tsx` — let shadcn generate them in the project's `base-nova` style.

If prompted to overwrite existing files, select no — none of these files exist yet.

### Task 2: `src/components/ui/date-picker.tsx`

Full implementation:

```tsx
"use client";

import * as React from "react";
import { format, parseISO } from "date-fns";
import { CalendarIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface DatePickerProps {
  value?: string;
  onChange: (value: string | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  disabled,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const selected = value ? parseISO(value) : undefined;

  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            disabled={disabled}
            className={cn("flex-1 justify-start font-normal")}
            style={{ color: value ? "var(--fg)" : "var(--fg-3)" }}
          >
            <CalendarIcon size={16} strokeWidth={1.5} className="mr-2 shrink-0" />
            {value ? format(selected!, "MMMM d, yyyy") : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(date) => {
              onChange(date ? format(date, "yyyy-MM-dd") : undefined);
              setOpen(false);
            }}
            initialFocus
          />
        </PopoverContent>
      </Popover>
      {value && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Clear date"
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

**Mandatory conventions:**
- `"use client"` — interactive component
- Colors via CSS custom properties only — `var(--fg)`, `var(--fg-3)`, never hex/rgb
- `strokeWidth={1.5}` on every Lucide icon
- `cn()` from `@/lib/utils` for className merging
- `parseISO` from date-fns for string→Date (safe, no UTC-offset issue); `new Date("YYYY-MM-DD")` parses as UTC midnight and would shift the date in US timezones
- `format(date, "yyyy-MM-dd")` for ISO output; `format(selected!, "MMMM d, yyyy")` for display label
- Clear button is a sibling of Popover — not nested inside it — to avoid invalid `<button>` nesting

### Task 3: `src/components/ui/date-picker.test.tsx`

`src/components/ui/**` is excluded from coverage thresholds (vitest.config.mts) — tests must pass but don't count toward the 95% requirement.

Mock Popover and Calendar to avoid rendering shadcn internals in jsdom:

```tsx
// @vitest-environment jsdom
import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DatePicker } from "./date-picker";

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="popover-content">{children}</div>
  ),
}));

vi.mock("@/components/ui/calendar", () => ({
  Calendar: ({ onSelect }: { onSelect: (date: Date | undefined) => void }) => (
    <button
      data-testid="calendar-day"
      onClick={() => onSelect(new Date(2026, 5, 15))}
    >
      Select June 15
    </button>
  ),
}));

describe("DatePicker", () => {
  let onChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onChange = vi.fn();
    vi.clearAllMocks();
  });

  it("renders placeholder when no value", () => {
    render(<DatePicker onChange={onChange} placeholder="Choose a date" />);
    expect(screen.getByText("Choose a date")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /clear date/i })).not.toBeInTheDocument();
  });

  it("shows formatted date when value is set", () => {
    render(<DatePicker value="2026-05-19" onChange={onChange} />);
    expect(screen.getByText("May 19, 2026")).toBeInTheDocument();
  });

  it("calls onChange with ISO string when a date is selected", async () => {
    const user = userEvent.setup();
    render(<DatePicker onChange={onChange} />);
    await user.click(screen.getByTestId("calendar-day"));
    expect(onChange).toHaveBeenCalledWith("2026-06-15");
  });

  it("calls onChange(undefined) when Clear is clicked", async () => {
    const user = userEvent.setup();
    render(<DatePicker value="2026-05-19" onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /clear date/i }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});
```

**Notes:**
- Mocked Calendar uses `new Date(2026, 5, 15)` (local-time constructor) not `new Date("2026-06-15")` (UTC, shifts in US timezones)
- `PopoverTrigger` renders as a React fragment so the Button renders directly and is testable
- `PopoverContent` is always rendered in the mock (no conditional open logic) — the real Popover handles visibility

### Project Pattern Reference

- `components.json`: style `base-nova`, baseColor `neutral`, aliases `@/components/ui`
- Global mocks in `vitest.setup.mts`: next/navigation, next/headers, window.matchMedia — do not re-mock per file
- Use `@testing-library/user-event` (not `fireEvent`) for all interactions
- `src/components/ui/**` excluded from coverage (vitest.config.mts `exclude`)
- No E2E test required — `DatePicker` is a UI primitive, not a user-facing flow

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- `calendar.tsx` shipped with a `table` key in classNames that no longer exists in react-day-picker v9's ClassNames type — removed it.
- `PopoverTrigger` is Base UI (not Radix), so `asChild` is unsupported — replaced Button wrapper with `buttonVariants()` applied directly to `PopoverTrigger`.
- `initialFocus` was removed in react-day-picker v9 — removed from Calendar usage.

### Completion Notes List

- Installed select, popover, calendar, toggle-group via `npx shadcn@latest add`; toggle.tsx also installed as a dependency
- `date-fns` ^4.2.1 and `react-day-picker` ^10.0.1 confirmed in package.json
- `DatePicker` uses `parseISO` for safe string→Date parsing, `buttonVariants({ variant: "outline" })` directly on `PopoverTrigger` (Base UI pattern, no asChild)
- 4 unit tests — all ACs covered; 644/644 tests green; lint/tsc/build all pass
- Coverage: lines 97.24%, functions 95.53%, branches 90.48% — all thresholds met

### File List

- src/components/ui/calendar.tsx (modified — removed invalid `table` classNames key)
- src/components/ui/toggle.tsx (new — installed by shadcn as toggle-group dependency)
- src/components/ui/toggle-group.tsx (new — installed by shadcn)
- src/components/ui/date-picker.tsx (new)
- src/components/ui/date-picker.test.tsx (new)

## Change Log

- 2026-05-19: Installed shadcn select/popover/calendar/toggle-group; created DatePicker primitive with 4-test suite; fixed calendar.tsx classNames type error; adapted to Base UI popover API

## Status

review
