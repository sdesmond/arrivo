import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TripEvent } from "@/data/types";

const { toastWarning } = vi.hoisted(() => ({ toastWarning: vi.fn() }));

vi.mock("sonner", () => ({
  toast: { warning: toastWarning },
}));

import { PlaceRowActionBar } from "./place-row-action-bar";
import { TripEditAccessProvider } from "./trip-edit-access";

const basePlace: TripEvent = {
  id: "ev-1",
  name: "Tokyo Tower",
  position: 0,
};

const defaultProps = {
  place: basePlace,
  showDocs: false,
  onToggleDocs: vi.fn(),
  onOpenTime: vi.fn(),
  onOpenLocation: vi.fn(),
  onOpenCost: vi.fn(),
  onOpenAddDoc: vi.fn(),
};

describe("PlaceRowActionBar", () => {
  it("shows 'Add time' when no startAt", () => {
    render(<PlaceRowActionBar {...defaultProps} />);
    expect(screen.getByRole("button", { name: /add time/i })).toBeInTheDocument();
  });

  it("shows 'Add location' when no locationAddress", () => {
    render(<PlaceRowActionBar {...defaultProps} />);
    expect(screen.getByRole("button", { name: /add location/i })).toBeInTheDocument();
  });

  it("shows 'Add cost' when no cost", () => {
    render(<PlaceRowActionBar {...defaultProps} />);
    expect(screen.getByRole("button", { name: /add cost/i })).toBeInTheDocument();
  });

  it("shows Attach pill when no docs", () => {
    render(<PlaceRowActionBar {...defaultProps} />);
    expect(screen.getByTitle("Attach document")).toBeInTheDocument();
  });

  it("keeps 8px between action pills", () => {
    render(<PlaceRowActionBar {...defaultProps} />);
    const timeChip = screen.getByRole("button", { name: /add time/i });
    expect(timeChip.parentElement?.className).toMatch(/\bgap-2\b/);
  });

  it("class-contract guard: non-address action chips carry h-11 (measured pixel proof lives in the Day Planning E2E @action-bar-geometry scenario)", () => {
    const place: TripEvent = {
      ...basePlace,
      docs: [{ id: "d1", name: "Plan.pdf", kind: "pdf", scope: "event" }],
    };
    render(<PlaceRowActionBar {...defaultProps} place={place} />);

    for (const chip of [
      screen.getByRole("button", { name: /add time/i }),
      screen.getByRole("button", { name: /add location/i }),
      screen.getByRole("button", { name: /add cost/i }),
      screen.getByRole("button", { name: /doc/i }),
    ]) {
      expect(chip.className).toMatch(/\bh-11\b/);
    }
  });

  it("class-contract guard: Attach chip carries h-11 (measured pixel proof lives in the Day Planning E2E @action-bar-geometry scenario)", () => {
    render(<PlaceRowActionBar {...defaultProps} />);
    expect(screen.getByTitle("Attach document").className).toMatch(/\bh-11\b/);
  });

  it("preserves the rounded chip shape, fill logic, and action icon scale", () => {
    const place: TripEvent = {
      ...basePlace,
      startAt: "2026-08-01T09:00:00Z",
      expense: {
        id: "expense-1",
        tripId: "trip-1",
        category: "shopping",
        amount: 25,
        currency: "USD",
        date: "2026-08-01",
      },
      docs: [{ id: "d1", name: "Plan.pdf", kind: "pdf", scope: "event" }],
    };
    const { unmount } = render(<PlaceRowActionBar {...defaultProps} place={place} />);

    const timeChip = screen.getByRole("button", { name: /9:00 am/i });
    const costChip = screen.getByRole("button", { name: "$25.00" });
    const docsChip = screen.getByRole("button", { name: /doc/i });

    for (const chip of [timeChip, costChip, docsChip]) {
      expect(chip.className).toMatch(/\brounded-full\b/);
    }
    expect(timeChip).toHaveStyle({ background: "var(--accent-soft)", color: "var(--accent-ink)" });
    expect(costChip).toHaveStyle({ background: "var(--accent-soft)", color: "var(--accent-ink)" });
    expect(docsChip).toHaveStyle({ background: "var(--accent-soft)", color: "var(--accent-ink)" });
    expect(timeChip.querySelector("svg")).toHaveAttribute("width", "12");
    expect(docsChip.querySelector("svg")).toHaveAttribute("width", "12");

    unmount();
    render(<PlaceRowActionBar {...defaultProps} />);
    const attachChip = screen.getByTitle("Attach document");
    expect(attachChip.className).toMatch(/\brounded-full\b/);
    expect(attachChip).toHaveStyle({ color: "var(--fg-4)" });
    expect(attachChip.querySelector("svg")).toHaveAttribute("width", "12");
  });

  it("shows doc count button when hasDocs", () => {
    const place: TripEvent = {
      ...basePlace,
      docs: [{ id: "d1", name: "Plan.pdf", kind: "pdf", scope: "event" }],
    };
    render(<PlaceRowActionBar {...defaultProps} place={place} />);
    expect(screen.getByRole("button", { name: /doc/i })).toBeInTheDocument();
  });

  it("does not show Attach pill when hasDocs", () => {
    const place: TripEvent = {
      ...basePlace,
      docs: [{ id: "d1", name: "Plan.pdf", kind: "pdf", scope: "event" }],
    };
    render(<PlaceRowActionBar {...defaultProps} place={place} />);
    expect(screen.queryByTitle("Attach document")).not.toBeInTheDocument();
  });

  it("clicking Time pill calls onOpenTime", async () => {
    const user = userEvent.setup();
    const onOpenTime = vi.fn();
    render(<PlaceRowActionBar {...defaultProps} onOpenTime={onOpenTime} />);
    await user.click(screen.getByRole("button", { name: /add time/i }));
    expect(onOpenTime).toHaveBeenCalledOnce();
  });

  it("clicking Location pill calls onOpenLocation", async () => {
    const user = userEvent.setup();
    const onOpenLocation = vi.fn();
    render(<PlaceRowActionBar {...defaultProps} onOpenLocation={onOpenLocation} />);
    await user.click(screen.getByRole("button", { name: /add location/i }));
    expect(onOpenLocation).toHaveBeenCalledOnce();
  });

  it("clicking Cost pill calls onOpenCost", async () => {
    const user = userEvent.setup();
    const onOpenCost = vi.fn();
    render(<PlaceRowActionBar {...defaultProps} onOpenCost={onOpenCost} />);
    await user.click(screen.getByRole("button", { name: /add cost/i }));
    expect(onOpenCost).toHaveBeenCalledOnce();
  });

  it("clicking Attach pill calls onOpenAddDoc", async () => {
    const user = userEvent.setup();
    const onOpenAddDoc = vi.fn();
    render(<PlaceRowActionBar {...defaultProps} onOpenAddDoc={onOpenAddDoc} />);
    await user.click(screen.getByTitle("Attach document"));
    expect(onOpenAddDoc).toHaveBeenCalledOnce();
  });

  it("clicking Docs toggle pill calls onToggleDocs", async () => {
    const user = userEvent.setup();
    const onToggleDocs = vi.fn();
    const place: TripEvent = {
      ...basePlace,
      docs: [{ id: "d1", name: "Plan.pdf", kind: "pdf", scope: "event" }],
    };
    render(<PlaceRowActionBar {...defaultProps} place={place} onToggleDocs={onToggleDocs} />);
    await user.click(screen.getByRole("button", { name: /doc/i }));
    expect(onToggleDocs).toHaveBeenCalledOnce();
  });

  it("docs toggle has aria-expanded=false when showDocs is false", () => {
    const place: TripEvent = {
      ...basePlace,
      docs: [{ id: "d1", name: "Plan.pdf", kind: "pdf", scope: "event" }],
    };
    render(<PlaceRowActionBar {...defaultProps} place={place} showDocs={false} />);
    expect(screen.getByRole("button", { name: /doc/i })).toHaveAttribute("aria-expanded", "false");
  });

  it("docs toggle has aria-expanded=true when showDocs is true", () => {
    const place: TripEvent = {
      ...basePlace,
      docs: [{ id: "d1", name: "Plan.pdf", kind: "pdf", scope: "event" }],
    };
    render(<PlaceRowActionBar {...defaultProps} place={place} showDocs={true} />);
    expect(screen.getByRole("button", { name: /doc/i })).toHaveAttribute("aria-expanded", "true");
  });

  it("docs toggle has title 'Show attached documents'", () => {
    const place: TripEvent = {
      ...basePlace,
      docs: [{ id: "d1", name: "Plan.pdf", kind: "pdf", scope: "event" }],
    };
    render(<PlaceRowActionBar {...defaultProps} place={place} />);
    expect(screen.getByRole("button", { name: /doc/i })).toHaveAttribute("title", "Show attached documents");
  });

  it("cost displays formatted value with comma separators", () => {
    const place: TripEvent = {
      ...basePlace,
      expense: {
        id: "expense-1",
        tripId: "trip-1",
        category: "shopping",
        amount: 1234567.89,
        currency: "USD",
        date: "2026-08-01",
      },
    };
    render(<PlaceRowActionBar {...defaultProps} place={place} />);
    expect(screen.getByRole("button", { name: "$1,234,567.89" })).toBeInTheDocument();
  });

  it("cost displays the saved currency code when no narrow symbol is available", () => {
    const place: TripEvent = {
      ...basePlace,
      expense: {
        id: "expense-1",
        tripId: "trip-1",
        category: "shopping",
        amount: 42.5,
        currency: "AED",
        date: "2026-08-01",
      },
    };
    render(<PlaceRowActionBar {...defaultProps} place={place} />);
    expect(screen.getByRole("button", { name: "AED 42.50" })).toBeInTheDocument();
  });

  it("shows the saved place name when a location has one", () => {
    const place: TripEvent = {
      ...basePlace,
      locationName: "JFK Airport",
      locationAddress: "Queens, NY 11430",
    };
    render(<PlaceRowActionBar {...defaultProps} place={place} />);
    expect(screen.getByRole("button", { name: /jfk airport/i })).toBeInTheDocument();
  });

  // ── Address ButtonGroup (filled Address) ────────────────────────────────

  const filledPlace: TripEvent = {
    ...basePlace,
    locationName: "Senso-ji Temple",
    locationAddress: "2 Chome-3-1 Asakusa, Taito City, Tokyo",
  };

  it("renders a ButtonGroup with two segments when Address is filled", () => {
    render(<PlaceRowActionBar {...defaultProps} place={filledPlace} onOpenMaps={vi.fn()} />);
    expect(screen.getByRole("group")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open directions to senso-ji temple/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit location" })).toBeInTheDocument();
  });

  it("segment 1 shows a map-pin icon and the location name", () => {
    render(<PlaceRowActionBar {...defaultProps} place={filledPlace} onOpenMaps={vi.fn()} />);
    const segment = screen.getByRole("button", { name: /open directions to senso-ji temple/i });
    expect(segment.querySelector("svg")).toBeInTheDocument();
    expect(segment).toHaveTextContent("Senso-ji Temple");
  });

  it("clicking segment 1 calls onOpenMaps", async () => {
    const user = userEvent.setup();
    const onOpenMaps = vi.fn();
    const onOpenLocation = vi.fn();
    render(
      <PlaceRowActionBar
        {...defaultProps}
        place={filledPlace}
        onOpenMaps={onOpenMaps}
        onOpenLocation={onOpenLocation}
      />
    );
    await user.click(screen.getByRole("button", { name: /open directions to senso-ji temple/i }));
    expect(onOpenMaps).toHaveBeenCalledOnce();
    expect(onOpenLocation).not.toHaveBeenCalled();
  });

  it("segment 2 is icon-only (Pencil) with no visible text", () => {
    render(<PlaceRowActionBar {...defaultProps} place={filledPlace} onOpenMaps={vi.fn()} />);
    const segment = screen.getByRole("button", { name: "Edit location" });
    expect(segment.querySelector("svg")).toBeInTheDocument();
    expect(segment.textContent).toBe("");
  });

  it("clicking segment 2 calls onOpenLocation", async () => {
    const user = userEvent.setup();
    const onOpenLocation = vi.fn();
    const onOpenMaps = vi.fn();
    render(
      <PlaceRowActionBar
        {...defaultProps}
        place={filledPlace}
        onOpenLocation={onOpenLocation}
        onOpenMaps={onOpenMaps}
      />
    );
    await user.click(screen.getByRole("button", { name: "Edit location" }));
    expect(onOpenLocation).toHaveBeenCalledOnce();
    expect(onOpenMaps).not.toHaveBeenCalled();
  });

  it("segment 1 aria-label is 'Open directions to {name}'", () => {
    render(<PlaceRowActionBar {...defaultProps} place={filledPlace} onOpenMaps={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Open directions to Senso-ji Temple" })).toBeInTheDocument();
  });

  it("segment 2 aria-label is 'Edit location'", () => {
    render(<PlaceRowActionBar {...defaultProps} place={filledPlace} onOpenMaps={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Edit location" })).toBeInTheDocument();
  });

  it("renders a single button (no group) when Address is empty", () => {
    render(<PlaceRowActionBar {...defaultProps} onOpenMaps={vi.fn()} />);
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add location/i })).toBeInTheDocument();
  });

  it("keeps a saved location name visible when its Address is empty", () => {
    const place: TripEvent = { ...basePlace, locationName: "Tokyo Tower" };
    render(<PlaceRowActionBar {...defaultProps} place={place} />);
    expect(screen.getByRole("button", { name: "Tokyo Tower" })).toBeInTheDocument();
  });

  it("empty-Address button still calls onOpenLocation", async () => {
    const user = userEvent.setup();
    const onOpenLocation = vi.fn();
    render(<PlaceRowActionBar {...defaultProps} onOpenLocation={onOpenLocation} onOpenMaps={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /add location/i }));
    expect(onOpenLocation).toHaveBeenCalledOnce();
  });

  it("class-contract guard: filled-Address ButtonGroup segments carry h-11/size-11 (measured pixel proof lives in the Day Planning E2E @action-bar-geometry scenario)", () => {
    render(<PlaceRowActionBar {...defaultProps} place={filledPlace} onOpenMaps={vi.fn()} />);
    const locationSegment = screen.getByRole("button", { name: /open directions to senso-ji temple/i });
    const editSegment = screen.getByRole("button", { name: "Edit location" });
    expect(locationSegment.className).toMatch(/\bh-11\b/);
    expect(editSegment.className).toMatch(/\bsize-11\b/);
  });

  it("backward compat: renders ButtonGroup segment 1 without throwing when onOpenMaps is not provided", async () => {
    const user = userEvent.setup();
    render(<PlaceRowActionBar {...defaultProps} place={filledPlace} />);
    const segment = screen.getByRole("button", { name: /open directions to senso-ji temple/i });
    await expect(user.click(segment)).resolves.not.toThrow();
  });

  it("both filled Address actions inherit the group fill and use the standard pill hover treatment", () => {
    render(<PlaceRowActionBar {...defaultProps} place={filledPlace} onOpenMaps={vi.fn()} />);
    const locationGroup = screen.getByRole("group");
    const locationSegment = screen.getByRole("button", { name: /open directions to senso-ji temple/i });
    const editSegment = screen.getByRole("button", { name: "Edit location" });
    expect(locationGroup).toHaveStyle({ background: "var(--accent-soft)", color: "var(--accent-ink)" });
    expect(locationSegment.className).toMatch(/hover:bg-surface-2/);
    expect(editSegment.className).toMatch(/hover:bg-surface-2/);
  });

  it("renders filled Address actions as one rounded, accent-filled pill", () => {
    render(<PlaceRowActionBar {...defaultProps} place={filledPlace} onOpenMaps={vi.fn()} />);
    const locationGroup = screen.getByRole("group");
    const locationSegment = screen.getByRole("button", { name: /open directions to senso-ji temple/i });
    const editSegment = screen.getByRole("button", { name: "Edit location" });
    expect(locationGroup.className).toMatch(/\brounded-full\b/);
    expect(locationGroup).toHaveStyle({ background: "var(--accent-soft)", color: "var(--accent-ink)" });
    expect(locationSegment.className).not.toMatch(/border-border/);
    expect(editSegment.className).not.toMatch(/border-border/);
  });

  // ── Schedule conflict button group (Time + Schedule conflict) ───────────

  it("renders a plain Time button with no group when hasScheduleConflict is false or omitted", () => {
    const { rerender } = render(<PlaceRowActionBar {...defaultProps} hasScheduleConflict={false} />);
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    expect(screen.queryByText("Schedule conflict")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add time/i })).toBeInTheDocument();

    rerender(<PlaceRowActionBar {...defaultProps} />);
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    expect(screen.queryByText("Schedule conflict")).not.toBeInTheDocument();
  });

  it("renders Time and Schedule conflict as a two-segment button group when hasScheduleConflict is true", () => {
    render(<PlaceRowActionBar {...defaultProps} hasScheduleConflict={true} />);
    const group = screen.getByRole("group");
    const timeSegment = screen.getByRole("button", { name: /add time/i });
    const conflictSegment = screen.getByRole("button", { name: "Schedule conflict" });
    expect(group).toContainElement(timeSegment);
    expect(group).toContainElement(conflictSegment);
    expect(timeSegment.compareDocumentPosition(conflictSegment)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("renders the Schedule conflict segment as icon-only, with no visible text", () => {
    render(<PlaceRowActionBar {...defaultProps} hasScheduleConflict={true} />);
    const segment = screen.getByRole("button", { name: "Schedule conflict" });
    expect(segment.querySelector("svg")).toBeInTheDocument();
    expect(segment.textContent).toBe("");
  });

  it("styles the button group with the warning color scheme when a conflict is present", () => {
    render(<PlaceRowActionBar {...defaultProps} hasScheduleConflict={true} />);
    const group = screen.getByRole("group");
    expect(group.className).toMatch(/\brounded-full\b/);
    expect(group).toHaveStyle({ background: "var(--warning-soft)", color: "var(--warning-ink)" });
  });

  it("clicking the Time segment calls onOpenTime", async () => {
    const user = userEvent.setup();
    const onOpenTime = vi.fn();
    render(<PlaceRowActionBar {...defaultProps} hasScheduleConflict={true} onOpenTime={onOpenTime} />);

    await user.click(screen.getByRole("button", { name: /add time/i }));
    expect(onOpenTime).toHaveBeenCalledTimes(1);
  });

  it("clicking the Schedule conflict segment shows an explanatory toast instead of opening the Time dialog", async () => {
    const user = userEvent.setup();
    const onOpenTime = vi.fn();
    toastWarning.mockClear();
    render(<PlaceRowActionBar {...defaultProps} hasScheduleConflict={true} onOpenTime={onOpenTime} />);

    await user.click(screen.getByRole("button", { name: "Schedule conflict" }));

    expect(onOpenTime).not.toHaveBeenCalled();
    expect(toastWarning).toHaveBeenCalledWith(
      "Not enough travel time between the end of the previous stop and the start of this one."
    );
  });

  it("shows the formatted time label inside the group when startAt/endAt are set", () => {
    const place: TripEvent = { ...basePlace, startAt: "2026-08-01T09:00:00Z", endAt: "2026-08-01T09:30:00Z" };
    render(<PlaceRowActionBar {...defaultProps} place={place} hasScheduleConflict={true} />);
    expect(screen.getByRole("button", { name: /9:00 am.*9:30 am/i })).toBeInTheDocument();
  });
});

describe("PlaceRowActionBar for a viewer", () => {
  function renderAsViewer(props: Partial<React.ComponentProps<typeof PlaceRowActionBar>> = {}) {
    return render(
      <TripEditAccessProvider canEdit={false}>
        <PlaceRowActionBar {...defaultProps} {...props} />
      </TripEditAccessProvider>
    );
  }

  const filledPlace: TripEvent = {
    ...basePlace,
    startAt: "2026-08-01T09:00:00Z",
    endAt: "2026-08-01T09:30:00Z",
    locationName: "Tokyo Tower",
    locationAddress: "4 Chome-2-8 Shibakoen, Tokyo",
    expense: {
      id: "expense-1",
      tripId: "trip-1",
      category: "shopping",
      amount: 12.5,
      currency: "USD",
      date: "2026-08-01",
    },
  };

  it("hides the Add time, Add location, Add cost and Attach controls", () => {
    renderAsViewer();
    expect(screen.queryByRole("button", { name: /add time/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add location/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add cost/i })).not.toBeInTheDocument();
    expect(screen.queryByTitle("Attach document")).not.toBeInTheDocument();
  });

  it("shows a set time and cost as plain text that opens nothing", async () => {
    const user = userEvent.setup();
    const onOpenTime = vi.fn();
    const onOpenCost = vi.fn();
    renderAsViewer({ place: filledPlace, onOpenTime, onOpenCost });

    expect(screen.queryByRole("button", { name: /9:00 am/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "$12.50" })).not.toBeInTheDocument();
    await user.click(screen.getByText(/9:00 am.*9:30 am/i));
    await user.click(screen.getByText("$12.50"));
    expect(onOpenTime).not.toHaveBeenCalled();
    expect(onOpenCost).not.toHaveBeenCalled();
  });

  it("keeps the directions link for a set location but drops Edit location", async () => {
    const user = userEvent.setup();
    const onOpenMaps = vi.fn();
    renderAsViewer({ place: filledPlace, onOpenMaps });

    expect(screen.queryByRole("button", { name: "Edit location" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open directions to Tokyo Tower" }));
    expect(onOpenMaps).toHaveBeenCalledOnce();
  });

  it("still flags a schedule conflict next to a read-only time", () => {
    renderAsViewer({ place: filledPlace, hasScheduleConflict: true });
    expect(screen.getByText(/9:00 am.*9:30 am/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /9:00 am/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Schedule conflict" })).toBeInTheDocument();
  });

  it("hides an empty time when flagging a schedule conflict", () => {
    renderAsViewer({ hasScheduleConflict: true });
    expect(screen.queryByText(/add time/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Schedule conflict" })).toBeInTheDocument();
  });

  it("still lets a viewer expand attached documents", async () => {
    const user = userEvent.setup();
    const onToggleDocs = vi.fn();
    renderAsViewer({
      place: { ...basePlace, docs: [{ id: "d1", name: "Plan.pdf", kind: "pdf", scope: "event" }] },
      onToggleDocs,
    });
    await user.click(screen.getByTitle("Show attached documents"));
    expect(onToggleDocs).toHaveBeenCalledOnce();
  });
});
