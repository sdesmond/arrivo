// @vitest-environment jsdom
import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DatePicker } from "./date-picker";

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div data-testid="popover-content">{children}</div>,
}));

vi.mock("@/components/ui/calendar", () => ({
  Calendar: ({ onSelect }: { onSelect: (date: Date | undefined) => void }) => (
    <button data-testid="calendar-day" onClick={() => onSelect(new Date(2026, 5, 15))}>
      Select June 15
    </button>
  ),
}));

describe("DatePicker", () => {
  let onChange: (value: string | undefined) => void;

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
