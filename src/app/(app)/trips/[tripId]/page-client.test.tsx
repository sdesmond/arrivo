import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { TripDetailClient } from "./page-client";
import type { TripDetailPayload } from "@/data/types";

const { tripConfettiMock, mockPathname, mockSearchParams, mockRouterPush, mockRouterReplace, mockUseFocusScroll } =
  vi.hoisted(() => ({
    tripConfettiMock: vi.fn(({ tripId }: { tripId: string }) => {
      void tripId;
      return null;
    }),
    mockPathname: vi.fn(() => "/trips/trip-1"),
    mockSearchParams: vi.fn(() => new URLSearchParams()),
    mockRouterPush: vi.fn(),
    mockRouterReplace: vi.fn(),
    mockUseFocusScroll: vi.fn<() => string | null>(() => null),
  }));

interface TripCoverProps {
  metaTag: string;
  name: string;
}

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
  useSearchParams: () => mockSearchParams(),
  useRouter: () => ({ push: mockRouterPush, replace: mockRouterReplace }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

vi.mock("@/components/packt/trip-cover", () => ({
  TripCover: ({ metaTag, name }: TripCoverProps) => (
    <div>
      <span>{name}</span>
      <span>{metaTag}</span>
    </div>
  ),
}));

vi.mock("./trip-detail-hero", () => ({
  TripDetailHero: ({ detail, nowISO, onEdit }: { detail: TripDetailPayload; nowISO: string; onEdit: () => void }) => {
    const { trip, days, unscheduledEvents, docs, collaborators } = detail;
    if (!trip.startDate || !trip.endDate) {
      return (
        <div>
          <span>UNSCHEDULED TRIP</span>
          <span>
            {days.length} {days.length === 1 ? "day" : "days"}
          </span>
          <span>{days.reduce((count, day) => count + day.events.length, 0) + unscheduledEvents.length} place</span>
          <span>
            {docs.length} {docs.length === 1 ? "doc" : "docs"}
          </span>
          <span>
            {collaborators.length} {collaborators.length === 1 ? "collaborator" : "collaborators"}
          </span>
          <button onClick={onEdit}>Edit trip</button>
        </div>
      );
    }

    const start = new Date(`${trip.startDate}T00:00:00Z`);
    const end = new Date(`${trip.endDate}T00:00:00Z`);
    const now = new Date(nowISO);
    const dayTotal = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
    const dayNumber = Math.floor((now.getTime() - start.getTime()) / 86_400_000) + 1;

    return (
      <div>
        {`${dayTotal} days · day ${dayNumber} today`}
        <button onClick={onEdit}>Edit trip</button>
      </div>
    );
  },
}));

vi.mock("./trip-detail-tab-body", () => ({
  TripDetailTabBody: ({
    activeTab,
    highlightedEventId,
    onActivateReservationsCta,
    onLinkedEventTap,
    onOpenEditDates,
    onOpenMapTab,
  }: {
    activeTab: string;
    highlightedEventId?: string | null;
    onActivateReservationsCta: () => void;
    onLinkedEventTap: (reservationId: string) => void;
    onOpenEditDates: () => void;
    onOpenMapTab?: (dayNumber: number) => void;
  }) => (
    <div data-testid="trip-detail-tab-body" data-highlighted-event-id={highlightedEventId ?? ""}>
      {activeTab}
      <button onClick={onActivateReservationsCta}>Activate CTA</button>
      <button onClick={() => onLinkedEventTap("reservation-1")}>Tap linked event</button>
      <button onClick={onOpenEditDates}>Open edit dates</button>
      {onOpenMapTab && <button onClick={() => onOpenMapTab(3)}>Open map tab for day 3</button>}
    </div>
  ),
}));

vi.mock("@/components/packt/trip-confetti", () => ({
  TripConfetti: ({ tripId }: { tripId: string }) => tripConfettiMock({ tripId }),
}));

vi.mock("@/components/packt/trip-edit-sheet", () => ({
  TripEditSheet: ({ open, highlightDates }: { open: boolean; highlightDates?: boolean }) =>
    open ? <div data-testid="trip-edit-sheet" data-highlight-dates={String(!!highlightDates)} /> : null,
}));

vi.mock("@/app/(app)/trips/[tripId]/actions", () => ({
  removeTripCover: vi.fn(),
  setTripCoverWithAttribution: vi.fn(),
}));

vi.mock("@/lib/use-focus-scroll", () => ({
  useFocusScroll: mockUseFocusScroll,
}));

vi.mock("./use-trip-detail-handlers", () => ({
  useTripDetailHandlers: () => ({
    newlyCreatedChecklistId: null,
    addingDay: false,
    removingDay: false,
    savingTrip: false,
    isDeleting: false,
    handleEventUpdate: vi.fn(),
    handleEventDelete: vi.fn(),
    handleDayItemsReorder: vi.fn(),
    handleDayUpdate: vi.fn(),
    handleAddEvent: vi.fn(),
    handleAddNote: vi.fn(),
    handleUpdateNote: vi.fn(),
    handleDeleteNote: vi.fn(),
    handleAddChecklist: vi.fn(),
    handleUpdateChecklistTitle: vi.fn(),
    handleDeleteChecklist: vi.fn(),
    handleAddChecklistItem: vi.fn(),
    handleUpdateChecklistItem: vi.fn(),
    handleDeleteChecklistItem: vi.fn(),
    handleToggleChecklistItem: vi.fn(),
    handleAddPackingItem: vi.fn(),
    handleRemovePackingItem: vi.fn(),
    handleTogglePackingItem: vi.fn(),
    handleReorderPackingItems: vi.fn(),
    handleTripSave: vi.fn(),
    handleTripSaveResolution: vi.fn(),
    handleDeleteTrip: vi.fn(),
    handleAddDay: vi.fn(),
    handleRemoveLastDay: vi.fn(),
  }),
}));

const baseDetail: TripDetailPayload = {
  trip: {
    id: "trip-1",
    name: "Tokyo",
    status: "upcoming",
  },
  days: [],
  unscheduledEvents: [],
  docs: [],
  collaborators: [],
  packingItems: [],
  packingLists: [],
  reservations: [],
  expenses: [],
};

describe("TripDetailClient", () => {
  beforeEach(() => {
    mockPathname.mockReturnValue("/trips/trip-1");
    mockSearchParams.mockReturnValue(new URLSearchParams());
    mockUseFocusScroll.mockReturnValue(null);
    window.history.replaceState(null, "", "/trips/trip-1");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders TripConfetti for newly created trips", () => {
    render(<TripDetailClient detail={baseDetail} nowISO="2026-05-24T12:00:00.000Z" dateFormat="MM/DD/YYYY" isNew />);

    expect(tripConfettiMock).toHaveBeenCalledWith({ tripId: "trip-1" });
  });

  it("does not render TripConfetti when the trip is not new", () => {
    render(<TripDetailClient detail={baseDetail} nowISO="2026-05-24T12:00:00.000Z" dateFormat="MM/DD/YYYY" />);

    expect(tripConfettiMock).not.toHaveBeenCalled();
  });

  it("does not render TripConfetti when isNew is explicitly false", () => {
    render(
      <TripDetailClient detail={baseDetail} nowISO="2026-05-24T12:00:00.000Z" dateFormat="MM/DD/YYYY" isNew={false} />
    );

    expect(tripConfettiMock).not.toHaveBeenCalled();
  });

  it("shows an unscheduled hero label when the trip has no dates", () => {
    render(<TripDetailClient detail={baseDetail} nowISO="2026-05-24T12:00:00.000Z" dateFormat="MM/DD/YYYY" />);

    expect(screen.getByText("UNSCHEDULED TRIP")).toBeInTheDocument();
  });

  it("counts unscheduled events in the hero summary", () => {
    render(
      <TripDetailClient
        detail={{
          ...baseDetail,
          unscheduledEvents: [{ id: "event-1", name: "Displaced dinner", position: 0 }],
        }}
        nowISO="2026-05-24T12:00:00.000Z"
        dateFormat="MM/DD/YYYY"
      />
    );

    expect(screen.getByText("1 place")).toBeInTheDocument();
  });

  it("shows collaborator count excluding the current user in the hero summary", () => {
    render(
      <TripDetailClient
        detail={{
          ...baseDetail,
          collaborators: [
            { name: "Alice", email: "alice@test.com", initials: "A", role: "editor" as const },
            { name: "Bob", email: "bob@test.com", initials: "B", role: "viewer" as const },
          ],
        }}
        nowISO="2026-05-24T12:00:00.000Z"
        dateFormat="MM/DD/YYYY"
      />
    );

    expect(screen.getByText("2 collaborators")).toBeInTheDocument();
  });

  it("counts all docs including event-scoped docs in the hero summary", () => {
    render(
      <TripDetailClient
        detail={{
          ...baseDetail,
          docs: [
            { id: "doc-1", name: "Trip doc", scope: "trip", kind: "pdf" },
            { id: "doc-2", name: "Event doc", scope: "event", kind: "pdf" },
          ],
        }}
        nowISO="2026-05-24T12:00:00.000Z"
        dateFormat="MM/DD/YYYY"
      />
    );

    expect(screen.getByText("2 docs")).toBeInTheDocument();
  });

  it("shows day count and current day number for scheduled trips", () => {
    render(
      <TripDetailClient
        detail={{
          ...baseDetail,
          trip: { id: "trip-1", name: "Tokyo", status: "upcoming", startDate: "2026-05-20", endDate: "2026-05-30" },
        }}
        nowISO="2026-05-24T12:00:00.000Z"
        dateFormat="MM/DD/YYYY"
      />
    );

    expect(screen.getByText(/11 days.*day 5 today/)).toBeInTheDocument();
  });

  it("shows 0 days for unscheduled trips", () => {
    render(<TripDetailClient detail={baseDetail} nowISO="2026-05-24T12:00:00.000Z" dateFormat="MM/DD/YYYY" />);

    expect(screen.getByText("0 days")).toBeInTheDocument();
  });

  it("forwards the highlighted event id from useFocusScroll to the tab body", () => {
    mockUseFocusScroll.mockReturnValue("event-1");

    render(<TripDetailClient detail={baseDetail} nowISO="2026-05-24T12:00:00.000Z" dateFormat="MM/DD/YYYY" />);

    expect(screen.getByTestId("trip-detail-tab-body")).toHaveAttribute("data-highlighted-event-id", "event-1");
  });

  it("renders the tab from the initial deep-link state", () => {
    render(
      <TripDetailClient
        detail={baseDetail}
        nowISO="2026-05-24T12:00:00.000Z"
        dateFormat="MM/DD/YYYY"
        initialActiveTab="docs"
      />
    );

    expect(screen.getByTestId("trip-detail-tab-body")).toHaveTextContent("docs");
  });

  it("switches to the Budget tab from the tab bar", async () => {
    const user = userEvent.setup();
    const pushStateSpy = vi.spyOn(window.history, "pushState").mockImplementation(() => {});

    render(<TripDetailClient detail={baseDetail} nowISO="2026-05-24T12:00:00.000Z" dateFormat="MM/DD/YYYY" />);

    await user.click(screen.getByRole("button", { name: "Budget" }));

    expect(pushStateSpy).toHaveBeenCalledWith(null, "", "/trips/trip-1?tab=budget");
    expect(screen.getByTestId("trip-detail-tab-body")).toHaveTextContent("budget");
  });

  it("pushes a tab deep link while preserving existing query parameters", async () => {
    const user = userEvent.setup();
    const pushStateSpy = vi.spyOn(window.history, "pushState").mockImplementation(() => {});

    window.history.replaceState(null, "", "/trips/trip-1?focus=event-1");

    render(<TripDetailClient detail={baseDetail} nowISO="2026-05-24T12:00:00.000Z" dateFormat="MM/DD/YYYY" />);

    await user.click(screen.getByRole("button", { name: "Documents" }));

    expect(pushStateSpy).toHaveBeenCalledWith(null, "", "/trips/trip-1?focus=event-1&tab=docs");
    expect(screen.getByTestId("trip-detail-tab-body")).toHaveTextContent("docs");
  });

  it("removes the tab query parameter when returning to the itinerary tab", async () => {
    const user = userEvent.setup();
    const pushStateSpy = vi.spyOn(window.history, "pushState").mockImplementation(() => {});

    window.history.replaceState(null, "", "/trips/trip-1?tab=docs&focus=event-1");

    render(
      <TripDetailClient
        detail={baseDetail}
        nowISO="2026-05-24T12:00:00.000Z"
        dateFormat="MM/DD/YYYY"
        initialActiveTab="docs"
      />
    );

    await user.click(screen.getByRole("button", { name: "Itinerary" }));

    expect(pushStateSpy).toHaveBeenCalledWith(null, "", "/trips/trip-1?focus=event-1");
    expect(screen.getByTestId("trip-detail-tab-body")).toHaveTextContent("itin");
  });

  it("opens the Map tab scoped to the deep-linked day in a single URL update", async () => {
    const user = userEvent.setup();
    // A prior test in this file may leave window.history.pushState/replaceState permanently
    // spied (vi.clearAllMocks() clears call history but not custom implementations), which
    // would make the beforeEach reset above a silent no-op — restore to native first.
    vi.spyOn(window.history, "pushState").mockRestore();
    vi.spyOn(window.history, "replaceState").mockRestore();
    window.history.replaceState(null, "", "/trips/trip-1");
    const replaceStateSpy = vi.spyOn(window.history, "replaceState").mockImplementation(() => {});

    render(<TripDetailClient detail={baseDetail} nowISO="2026-05-24T12:00:00.000Z" dateFormat="MM/DD/YYYY" />);

    await user.click(screen.getByRole("button", { name: "Open map tab for day 3" }));

    expect(replaceStateSpy).toHaveBeenCalledWith(null, "", "/trips/trip-1?tab=map&day=3");
    expect(screen.getByTestId("trip-detail-tab-body")).toHaveTextContent("map");
    replaceStateSpy.mockRestore();
  });

  it("preserves unrelated query params when deep-linking to the Map tab", async () => {
    const user = userEvent.setup();
    vi.spyOn(window.history, "pushState").mockRestore();
    vi.spyOn(window.history, "replaceState").mockRestore();
    window.history.pushState(null, "", "/trips/trip-1?focus=event-1");
    const replaceStateSpy = vi.spyOn(window.history, "replaceState").mockImplementation(() => {});

    render(<TripDetailClient detail={baseDetail} nowISO="2026-05-24T12:00:00.000Z" dateFormat="MM/DD/YYYY" />);

    await user.click(screen.getByRole("button", { name: "Open map tab for day 3" }));

    expect(replaceStateSpy).toHaveBeenCalledWith(null, "", "/trips/trip-1?focus=event-1&tab=map&day=3");
    replaceStateSpy.mockRestore();
  });

  it("syncs activeTab when the tab search param changes outside of a tab-button click", () => {
    mockSearchParams.mockReturnValue(new URLSearchParams());
    const { rerender } = render(
      <TripDetailClient detail={baseDetail} nowISO="2026-05-24T12:00:00.000Z" dateFormat="MM/DD/YYYY" />
    );

    expect(screen.getByTestId("trip-detail-tab-body")).toHaveTextContent("itin");

    mockSearchParams.mockReturnValue(new URLSearchParams("tab=res"));
    rerender(<TripDetailClient detail={baseDetail} nowISO="2026-05-24T12:00:00.000Z" dateFormat="MM/DD/YYYY" />);

    expect(screen.getByTestId("trip-detail-tab-body")).toHaveTextContent("res");
  });

  it("navigates to Reservations with action=add-reservation, stripping focus and preserving unrelated params, when the CTA activates", async () => {
    const user = userEvent.setup();
    mockPathname.mockReturnValue("/trips/trip-1");
    mockSearchParams.mockReturnValue(new URLSearchParams("focus=event-1&new=1"));

    render(<TripDetailClient detail={baseDetail} nowISO="2026-05-24T12:00:00.000Z" dateFormat="MM/DD/YYYY" />);

    await user.click(screen.getByRole("button", { name: "Activate CTA" }));

    expect(mockRouterPush).toHaveBeenCalledWith("/trips/trip-1?new=1&tab=res&action=add-reservation", {
      scroll: false,
    });
  });

  it("navigates to Reservations with a highlight param when a linked event is tapped", async () => {
    const user = userEvent.setup();
    mockPathname.mockReturnValue("/trips/trip-1");
    mockSearchParams.mockReturnValue(new URLSearchParams());

    render(<TripDetailClient detail={baseDetail} nowISO="2026-05-24T12:00:00.000Z" dateFormat="MM/DD/YYYY" />);

    await user.click(screen.getByRole("button", { name: "Tap linked event" }));

    expect(mockRouterPush).toHaveBeenCalledWith("/trips/trip-1?tab=res&highlight=reservation-1", {
      scroll: false,
    });
  });

  it("announces the Reservations tab once a CTA-triggered tab switch settles", async () => {
    const user = userEvent.setup();
    mockSearchParams.mockReturnValue(new URLSearchParams());

    const { container, rerender } = render(
      <TripDetailClient detail={baseDetail} nowISO="2026-05-24T12:00:00.000Z" dateFormat="MM/DD/YYYY" />
    );

    await user.click(screen.getByRole("button", { name: "Activate CTA" }));

    mockSearchParams.mockReturnValue(new URLSearchParams("tab=res&action=add-reservation"));
    rerender(<TripDetailClient detail={baseDetail} nowISO="2026-05-24T12:00:00.000Z" dateFormat="MM/DD/YYYY" />);

    expect(container.querySelector("[aria-live=polite]")).toHaveTextContent("Reservations tab");
  });

  it("does not announce the Reservations tab when navigating via a linked-event highlight tap", async () => {
    const user = userEvent.setup();
    mockSearchParams.mockReturnValue(new URLSearchParams());

    const { container, rerender } = render(
      <TripDetailClient detail={baseDetail} nowISO="2026-05-24T12:00:00.000Z" dateFormat="MM/DD/YYYY" />
    );

    await user.click(screen.getByRole("button", { name: "Tap linked event" }));

    mockSearchParams.mockReturnValue(new URLSearchParams("tab=res&highlight=reservation-1"));
    rerender(<TripDetailClient detail={baseDetail} nowISO="2026-05-24T12:00:00.000Z" dateFormat="MM/DD/YYYY" />);

    expect(container.querySelector("[aria-live=polite]")).toHaveTextContent("");
  });

  it("opens the trip edit sheet with dates highlighted when the Set trip dates CTA is used", async () => {
    const user = userEvent.setup();

    render(<TripDetailClient detail={baseDetail} nowISO="2026-05-24T12:00:00.000Z" dateFormat="MM/DD/YYYY" />);

    await user.click(screen.getByRole("button", { name: "Open edit dates" }));

    expect(screen.getByTestId("trip-edit-sheet")).toHaveAttribute("data-highlight-dates", "true");
  });

  it("opens the trip edit sheet without highlighting dates when edited via the hero pencil", async () => {
    const user = userEvent.setup();

    render(<TripDetailClient detail={baseDetail} nowISO="2026-05-24T12:00:00.000Z" dateFormat="MM/DD/YYYY" />);

    await user.click(screen.getByRole("button", { name: "Edit trip" }));

    expect(screen.getByTestId("trip-edit-sheet")).toHaveAttribute("data-highlight-dates", "false");
  });

  describe("budget tab status icon", () => {
    it("shows no icon on the Budget tab label when budget status is neutral", () => {
      render(
        <TripDetailClient
          detail={{
            ...baseDetail,
            trip: { id: "trip-1", name: "Tokyo", status: "upcoming", budget: { currency: "USD", total: 1000 } },
            expenses: [
              {
                id: "expense-1",
                tripId: "trip-1",
                category: "misc",
                amount: 100,
                currency: "USD",
                convertedAmountTrip: 100,
                date: "2026-05-20",
              },
            ],
          }}
          nowISO="2026-05-24T12:00:00.000Z"
          dateFormat="MM/DD/YYYY"
        />
      );

      const budgetTabButton = screen.getByRole("button", { name: "Budget" });
      expect(budgetTabButton.querySelector("svg")).not.toBeInTheDocument();
    });

    it("shows a warning icon on the Budget tab label when budget status is warning", () => {
      render(
        <TripDetailClient
          detail={{
            ...baseDetail,
            trip: { id: "trip-1", name: "Tokyo", status: "upcoming", budget: { currency: "USD", total: 1000 } },
            expenses: [
              {
                id: "expense-1",
                tripId: "trip-1",
                category: "misc",
                amount: 850,
                currency: "USD",
                convertedAmountTrip: 850,
                date: "2026-05-20",
              },
            ],
          }}
          nowISO="2026-05-24T12:00:00.000Z"
          dateFormat="MM/DD/YYYY"
          warningThreshold={80}
          dangerThreshold={90}
        />
      );

      const budgetTabButton = screen.getByRole("button", { name: "Budget Warning" });
      expect(budgetTabButton.querySelector("svg")).toBeInTheDocument();
    });

    it("shows a Near limit icon on the Budget tab label when danger threshold is crossed but actual is under the budget total", () => {
      render(
        <TripDetailClient
          detail={{
            ...baseDetail,
            trip: { id: "trip-1", name: "Tokyo", status: "upcoming", budget: { currency: "USD", total: 1000 } },
            expenses: [
              {
                id: "expense-1",
                tripId: "trip-1",
                category: "misc",
                amount: 950,
                currency: "USD",
                convertedAmountTrip: 950,
                date: "2026-05-20",
              },
            ],
          }}
          nowISO="2026-05-24T12:00:00.000Z"
          dateFormat="MM/DD/YYYY"
          warningThreshold={80}
          dangerThreshold={90}
        />
      );

      const budgetTabButton = screen.getByRole("button", { name: "Budget Near limit" });
      expect(budgetTabButton.querySelector("svg")).toBeInTheDocument();
    });

    it("shows an Over budget icon on the Budget tab label when actual has reached or passed the budget total", () => {
      render(
        <TripDetailClient
          detail={{
            ...baseDetail,
            trip: { id: "trip-1", name: "Tokyo", status: "upcoming", budget: { currency: "USD", total: 1000 } },
            expenses: [
              {
                id: "expense-1",
                tripId: "trip-1",
                category: "misc",
                amount: 1100,
                currency: "USD",
                convertedAmountTrip: 1100,
                date: "2026-05-20",
              },
            ],
          }}
          nowISO="2026-05-24T12:00:00.000Z"
          dateFormat="MM/DD/YYYY"
          warningThreshold={80}
          dangerThreshold={90}
        />
      );

      const budgetTabButton = screen.getByRole("button", { name: "Budget Over budget" });
      expect(budgetTabButton.querySelector("svg")).toBeInTheDocument();
    });
  });

  it("clears the dates highlight after the pulse duration elapses", () => {
    vi.useFakeTimers();

    render(<TripDetailClient detail={baseDetail} nowISO="2026-05-24T12:00:00.000Z" dateFormat="MM/DD/YYYY" />);

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Open edit dates" }));
    });
    expect(screen.getByTestId("trip-edit-sheet")).toHaveAttribute("data-highlight-dates", "true");

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(screen.getByTestId("trip-edit-sheet")).toHaveAttribute("data-highlight-dates", "false");
    vi.useRealTimers();
  });
});
