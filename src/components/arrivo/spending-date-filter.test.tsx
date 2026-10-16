import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SpendingDateFilter } from "./spending-date-filter";
import { SpendingDateRange } from "@/data/types";

describe("SpendingDateFilter", () => {
  it("renders all four date range options", async () => {
    const user = userEvent.setup();
    render(<SpendingDateFilter range={SpendingDateRange.ThisYear} onChange={vi.fn()} tripCount={0} />);

    await user.click(screen.getByRole("button", { name: "Date Range" }));

    expect(screen.getAllByRole("option")).toHaveLength(4);
    expect(screen.getByRole("option", { name: "This Year" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Last Year" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Last 12 Months" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "All Time" })).toBeInTheDocument();
  });

  it("defaults to This Year", () => {
    render(<SpendingDateFilter range={SpendingDateRange.ThisYear} onChange={vi.fn()} tripCount={0} />);

    expect(screen.getByRole("button", { name: "Date Range" })).toHaveTextContent("This Year");
  });

  it("calls onChange with new range when selection changes", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SpendingDateFilter range={SpendingDateRange.ThisYear} onChange={onChange} tripCount={3} />);

    await user.click(screen.getByRole("button", { name: "Date Range" }));
    await user.click(screen.getByRole("option", { name: "All Time" }));

    expect(onChange).toHaveBeenCalledWith(SpendingDateRange.AllTime);
  });

  it("shows helper text under dropdown", () => {
    render(<SpendingDateFilter range={SpendingDateRange.ThisYear} onChange={vi.fn()} tripCount={0} />);

    expect(screen.getByText("Includes any trip overlapping this period.")).toBeInTheDocument();
  });

  it("live region reflects the current range and trip count props", () => {
    render(<SpendingDateFilter range={SpendingDateRange.AllTime} onChange={vi.fn()} tripCount={12} />);

    expect(screen.getByText("Showing All Time — 12 trips")).toBeInTheDocument();
  });

  it("announces singular trip count correctly", () => {
    render(<SpendingDateFilter range={SpendingDateRange.LastYear} onChange={vi.fn()} tripCount={1} />);

    expect(screen.getByText("Showing Last Year — 1 trip")).toBeInTheDocument();
  });

  it("live region updates once the parent re-renders with the new range's trip count (not the stale prior count)", () => {
    const { rerender } = render(
      <SpendingDateFilter range={SpendingDateRange.ThisYear} onChange={vi.fn()} tripCount={7} />
    );
    expect(screen.getByText("Showing This Year — 7 trips")).toBeInTheDocument();

    rerender(<SpendingDateFilter range={SpendingDateRange.LastYear} onChange={vi.fn()} tripCount={2} />);

    expect(screen.getByText("Showing Last Year — 2 trips")).toBeInTheDocument();
    expect(screen.queryByText("Showing This Year — 7 trips")).not.toBeInTheDocument();
    expect(screen.queryByText(/7 trips/)).not.toBeInTheDocument();
  });

  it("keyboard operable: opens on Enter, selects on Enter, dismisses on Esc", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SpendingDateFilter range={SpendingDateRange.ThisYear} onChange={onChange} tripCount={5} />);

    const trigger = screen.getByRole("button", { name: "Date Range" });
    trigger.focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByRole("option", { name: "This Year" })).toHaveFocus());

    await user.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith(SpendingDateRange.LastYear);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    await user.click(trigger);
    await waitFor(() => expect(screen.getByRole("listbox")).toBeInTheDocument());
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
