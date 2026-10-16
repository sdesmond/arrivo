import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScheduleConflictBadge } from "./schedule-conflict-badge";

describe("ScheduleConflictBadge", () => {
  it("renders nothing visible when there are zero conflicts, but keeps the live region mounted", () => {
    const { container } = render(<ScheduleConflictBadge count={0} onClick={vi.fn()} />);

    expect(screen.queryByText(/tight connection/)).not.toBeInTheDocument();
    expect(container.querySelector('[aria-live="polite"]')).toBeInTheDocument();
  });

  it("renders singular copy for exactly one conflict", () => {
    render(<ScheduleConflictBadge count={1} onClick={vi.fn()} />);

    expect(screen.getByRole("button", { name: "1 tight connection today" })).toBeInTheDocument();
  });

  it("renders plural copy for multiple conflicts", () => {
    render(<ScheduleConflictBadge count={3} onClick={vi.fn()} />);

    expect(screen.getByRole("button", { name: "3 tight connections today" })).toBeInTheDocument();
  });

  it('always wraps the badge in an aria-live="polite" region', () => {
    const { container } = render(<ScheduleConflictBadge count={2} onClick={vi.fn()} />);

    const liveRegion = container.querySelector('[aria-live="polite"]');
    expect(liveRegion).toBeInTheDocument();
    expect(liveRegion).toHaveTextContent("2 tight connections today");
  });

  it("announces affected stops when the conflict count does not change", () => {
    const { rerender } = render(
      <ScheduleConflictBadge count={1} conflictingEventNames={["Museum"]} onClick={vi.fn()} />
    );

    rerender(<ScheduleConflictBadge count={1} conflictingEventNames={["Cafe"]} onClick={vi.fn()} />);

    expect(screen.getByText("Schedule conflict at Cafe")).toBeInTheDocument();
  });

  it("calls onClick when the button is activated", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<ScheduleConflictBadge count={1} onClick={onClick} />);

    await user.click(screen.getByRole("button", { name: "1 tight connection today" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders the full untruncated phrase even for a pathological conflict count", () => {
    // Regression guard for Story 6.3: real-browser measurement (see story Completion
    // Notes) confirmed the badge's shrink-0 + sibling flex-1/truncate layout keeps it
    // clear of the day card border at every tested count, so no truncation/compact-form
    // logic was added. This locks in that the full phrase keeps rendering unmodified.
    render(<ScheduleConflictBadge count={999999} onClick={vi.fn()} />);

    expect(screen.getByRole("button", { name: "999999 tight connections today" })).toBeInTheDocument();
  });
});
