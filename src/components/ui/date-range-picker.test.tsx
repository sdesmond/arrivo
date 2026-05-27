// @vitest-environment jsdom
import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DateRangePicker } from "./date-range-picker";

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div data-testid="popover-content">{children}</div>,
}));

vi.mock("@/components/ui/calendar", () => ({
  Calendar: ({ onSelect }: { onSelect: (range: { from?: Date; to?: Date } | undefined) => void }) => (
    <>
      <button
        data-testid="calendar-range"
        onClick={() => onSelect({ from: new Date(2026, 5, 1), to: new Date(2026, 5, 10) })}
      >
        Select Jun 1–10
      </button>
      <button data-testid="calendar-from-only" onClick={() => onSelect({ from: new Date(2026, 5, 1) })}>
        Select Jun 1 only
      </button>
      <button
        data-testid="calendar-same-date"
        onClick={() => onSelect({ from: new Date(2026, 5, 1), to: new Date(2026, 5, 1) })}
      >
        Select Jun 1 (v10 first-click)
      </button>
      <button
        data-testid="calendar-prefilled-click"
        onClick={() => onSelect({ from: new Date(2026, 6, 1), to: new Date(2026, 5, 10) })}
      >
        Click Jul 1 with Jun range visible (from changed)
      </button>
      <button
        data-testid="calendar-invalid-end"
        onClick={() => onSelect({ from: new Date(2026, 4, 25), to: new Date(2026, 5, 1) })}
      >
        Click May 25 after Jun 1 start
      </button>
    </>
  ),
}));

describe("DateRangePicker", () => {
  let onChange: (start: string | undefined, end: string | undefined) => void;

  beforeEach(() => {
    onChange = vi.fn();
    vi.clearAllMocks();
  });

  it("renders placeholder when no value", () => {
    render(<DateRangePicker onChange={onChange} placeholder="Choose dates" />);
    expect(screen.getByText("Choose dates")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /clear dates/i })).not.toBeInTheDocument();
  });

  it("shows formatted range when both from and to are set", () => {
    render(<DateRangePicker start="2026-06-01" end="2026-06-10" onChange={onChange} />);
    expect(screen.getByText(/Jun 1, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Jun 10, 2026/)).toBeInTheDocument();
  });

  it("shows only from date when to is not set", () => {
    render(<DateRangePicker start="2026-06-01" onChange={onChange} />);
    expect(screen.getByText("Jun 1, 2026")).toBeInTheDocument();
  });

  it("shows clear button when from is set", () => {
    render(<DateRangePicker start="2026-06-01" onChange={onChange} />);
    expect(screen.getByRole("button", { name: /clear dates/i })).toBeInTheDocument();
  });

  it("shows clear button when to is set", () => {
    render(<DateRangePicker end="2026-06-10" onChange={onChange} />);
    expect(screen.getByRole("button", { name: /clear dates/i })).toBeInTheDocument();
  });

  it("calls onChange(undefined, undefined) when clear is clicked", async () => {
    const user = userEvent.setup();
    render(<DateRangePicker start="2026-06-01" end="2026-06-10" onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /clear dates/i }));
    expect(onChange).toHaveBeenCalledWith(undefined, undefined);
  });

  it("calls onChange with ISO strings when a full range is selected", async () => {
    const user = userEvent.setup();
    render(<DateRangePicker onChange={onChange} />);
    await user.click(screen.getByTestId("calendar-range"));
    expect(onChange).toHaveBeenCalledWith("2026-06-01", "2026-06-10");
  });

  it("calls onChange with only from when to is not selected", async () => {
    const user = userEvent.setup();
    render(<DateRangePicker onChange={onChange} />);
    await user.click(screen.getByTestId("calendar-from-only"));
    expect(onChange).toHaveBeenCalledWith("2026-06-01", undefined);
  });

  it("treats from === to (react-day-picker v10 first click) as from-only", async () => {
    const user = userEvent.setup();
    render(<DateRangePicker onChange={onChange} />);
    await user.click(screen.getByTestId("calendar-same-date"));
    expect(onChange).toHaveBeenCalledWith("2026-06-01", undefined);
  });

  it("first click with complete pre-filled range extracts the changed date as new start", async () => {
    const user = userEvent.setup();
    // Props supply a complete range; mock simulates react-day-picker returning
    // { from: Jul1, to: Jun10 } — "from" changed, "to" stayed, so Jul1 was clicked.
    render(<DateRangePicker start="2026-06-01" end="2026-06-10" onChange={onChange} />);
    await user.click(screen.getByTestId("calendar-prefilled-click"));
    expect(onChange).toHaveBeenCalledWith("2026-07-01", undefined);
  });

  it("rejects an end date earlier than the in-progress start date", async () => {
    const user = userEvent.setup();
    render(<DateRangePicker onChange={onChange} />);
    await user.click(screen.getByTestId("calendar-from-only"));
    await user.click(screen.getByTestId("calendar-invalid-end"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("2026-06-01", undefined);
  });
});
