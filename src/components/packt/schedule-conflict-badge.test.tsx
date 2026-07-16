import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScheduleConflictBadge } from "./schedule-conflict-badge";

describe("ScheduleConflictBadge", () => {
  it("renders nothing visible when there are zero conflicts, but keeps the live region mounted", () => {
    const { container } = render(<ScheduleConflictBadge count={0} />);

    expect(screen.queryByText(/tight connection/)).not.toBeInTheDocument();
    expect(container.querySelector('[aria-live="polite"]')).toBeInTheDocument();
  });

  it("renders singular copy for exactly one conflict", () => {
    render(<ScheduleConflictBadge count={1} />);

    expect(screen.getByText("1 tight connection today")).toBeInTheDocument();
  });

  it("renders plural copy for multiple conflicts", () => {
    render(<ScheduleConflictBadge count={3} />);

    expect(screen.getByText("3 tight connections today")).toBeInTheDocument();
  });

  it('always wraps the badge in an aria-live="polite" region', () => {
    const { container } = render(<ScheduleConflictBadge count={2} />);

    const liveRegion = container.querySelector('[aria-live="polite"]');
    expect(liveRegion).toBeInTheDocument();
    expect(liveRegion).toHaveTextContent("2 tight connections today");
  });

  it("announces affected stops when the conflict count does not change", () => {
    const { rerender } = render(<ScheduleConflictBadge count={1} conflictingEventNames={["Museum"]} />);

    rerender(<ScheduleConflictBadge count={1} conflictingEventNames={["Cafe"]} />);

    expect(screen.getByText("Schedule conflict at Cafe")).toBeInTheDocument();
  });
});
