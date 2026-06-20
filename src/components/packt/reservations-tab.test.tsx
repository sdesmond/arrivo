import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReservationType, type Reservation } from "@/data/types";
import { ReservationsTab } from "./reservations-tab";
import { MockDateProvider } from "@/components/providers/mock-date-provider";

const { mockPathname, mockSearchParams, mockRouterReplace } = vi.hoisted(() => ({
  mockPathname: vi.fn(() => "/trips/trip-1"),
  mockSearchParams: vi.fn(() => new URLSearchParams()),
  mockRouterReplace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
  useSearchParams: () => mockSearchParams(),
  useRouter: () => ({ replace: mockRouterReplace, push: vi.fn() }),
}));

vi.mock("@/components/packt/reservation-type-picker", () => ({
  ReservationTypePicker: ({ onSelectType, open }: { onSelectType: (type: string) => void; open?: boolean }) => (
    <button data-open={open ?? false} onClick={() => onSelectType(ReservationType.Lodging)}>
      Add Reservation
    </button>
  ),
}));

vi.mock("@/components/packt/reservation-edit-drawer", () => ({
  ReservationEditDrawer: ({ open, type }: { open: boolean; type: string }) =>
    open ? <div data-testid="drawer">Drawer for {type}</div> : null,
}));

vi.mock("@/components/packt/reservation-type-section", () => ({
  ReservationTypeSection: ({
    type,
    reservations,
    open,
    onToggle,
    highlightedReservationId,
  }: {
    type: string;
    reservations: Reservation[];
    open: boolean;
    onToggle: () => void;
    highlightedReservationId?: string | null;
  }) => (
    <button
      type="button"
      data-highlighted-reservation-id={highlightedReservationId ?? ""}
      aria-label={`${type[0].toUpperCase()}${type.slice(1)}, ${reservations.length} reservation${reservations.length === 1 ? "" : "s"}, ${open ? "expanded" : "collapsed"}`}
      onClick={onToggle}
    >
      {`${type[0].toUpperCase()}${type.slice(1)}, ${reservations.length} reservation${reservations.length === 1 ? "" : "s"}, ${open ? "expanded" : "collapsed"}`}
    </button>
  ),
  getNextUpcoming: (reservations: Reservation[], now: Date) => {
    const dated = reservations.filter((reservation) => reservation.startAt);
    if (dated.length === 0) return reservations[0];
    const upcoming = dated.filter((reservation) => new Date(reservation.startAt!).getTime() >= now.getTime());
    if (upcoming.length > 0) {
      return upcoming.reduce((soonest, candidate) =>
        new Date(candidate.startAt!).getTime() < new Date(soonest.startAt!).getTime() ? candidate : soonest
      );
    }
    return dated.reduce((latest, candidate) =>
      new Date(candidate.startAt!).getTime() > new Date(latest.startAt!).getTime() ? candidate : latest
    );
  },
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

vi.mock("@/app/(app)/trips/[tripId]/reservations/actions", () => ({
  updateReservation: vi.fn(),
}));

const NOW_ISO = "2026-06-15T12:00:00.000Z";
const mockOnOpenEditDates = vi.fn();

function Wrapper({ children }: { children: React.ReactNode }) {
  return <MockDateProvider initialISO={NOW_ISO}>{children}</MockDateProvider>;
}

function makeReservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: "res-1",
    tripId: "trip-1",
    type: ReservationType.Lodging,
    provider: "Grand Hotel",
    startAt: "2026-08-01T15:00:00.000Z",
    endAt: "2026-08-05T11:00:00.000Z",
    ...overrides,
  };
}

describe("ReservationsTab", () => {
  beforeEach(() => {
    mockPathname.mockReturnValue("/trips/trip-1");
    mockSearchParams.mockReturnValue(new URLSearchParams());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows the FR-6 empty state with a single Add Reservation entry point when there are no reservations", () => {
    render(
      <ReservationsTab tripId="trip-1" isDateless={false} onOpenEditDates={mockOnOpenEditDates} reservations={[]} />,
      { wrapper: Wrapper }
    );

    expect(screen.getByText("No reservations yet")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /add reservation/i })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /,.*reservation/i })).not.toBeInTheDocument();
  });

  it("renders one accordion section per populated type with the title and picker header row", () => {
    render(
      <ReservationsTab
        tripId="trip-1"
        isDateless={false}
        onOpenEditDates={mockOnOpenEditDates}
        reservations={[
          makeReservation({
            id: "res-1",
            provider: "Grand Hotel",
            type: ReservationType.Lodging,
            startAt: "2026-06-20T15:00:00.000Z",
          }),
          makeReservation({
            id: "res-2",
            provider: "Acme Air",
            type: ReservationType.Flight,
            startAt: "2026-06-18T10:00:00.000Z",
            endAt: undefined,
          }),
        ]}
      />,
      { wrapper: Wrapper }
    );

    expect(screen.getByText("Reservations")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Lodging, 1 reservation, collapsed/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Flight, 1 reservation, collapsed/ })).toBeInTheDocument();
  });

  it("orders sections soonest-upcoming-first, with all-past types after upcoming types and undated types last", () => {
    render(
      <ReservationsTab
        tripId="trip-1"
        isDateless={false}
        onOpenEditDates={mockOnOpenEditDates}
        reservations={[
          // Lodging: upcoming, soonest
          makeReservation({
            id: "res-lodging",
            provider: "Grand Hotel",
            type: ReservationType.Lodging,
            startAt: "2026-06-17T15:00:00.000Z",
            endAt: "2026-06-20T11:00:00.000Z",
          }),
          // Flight: upcoming, later than lodging
          makeReservation({
            id: "res-flight",
            provider: "Acme Air",
            type: ReservationType.Flight,
            startAt: "2026-06-25T10:00:00.000Z",
            endAt: undefined,
          }),
          // Train: all in the past
          makeReservation({
            id: "res-train",
            provider: "Rail Co",
            type: ReservationType.Train,
            startAt: "2026-06-01T10:00:00.000Z",
            endAt: undefined,
          }),
          // Cruise: no startAt at all
          makeReservation({
            id: "res-cruise",
            provider: "Sea Co",
            type: ReservationType.Cruise,
            startAt: undefined,
            endAt: undefined,
          }),
        ]}
      />,
      { wrapper: Wrapper }
    );

    const headers = screen.getAllByRole("button", { name: /reservation,/ });
    const labels = headers.map((header) => header.getAttribute("aria-label"));

    expect(labels).toEqual([
      "Lodging, 1 reservation, collapsed",
      "Flight, 1 reservation, collapsed",
      "Train, 1 reservation, collapsed",
      "Cruise, 1 reservation, collapsed",
    ]);
  });

  it("toggles a section open and closed when its header is clicked", async () => {
    const user = userEvent.setup();
    render(
      <ReservationsTab
        tripId="trip-1"
        isDateless={false}
        onOpenEditDates={mockOnOpenEditDates}
        reservations={[makeReservation({ id: "res-1", provider: "Grand Hotel", startAt: "2026-06-20T15:00:00.000Z" })]}
      />,
      { wrapper: Wrapper }
    );

    const header = screen.getByRole("button", { name: /^Lodging, 1 reservation, collapsed/ });
    await user.click(header);
    expect(screen.getByRole("button", { name: /^Lodging, 1 reservation, expanded/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Lodging, 1 reservation, expanded/ }));
    expect(screen.getByRole("button", { name: /^Lodging, 1 reservation, collapsed/ })).toBeInTheDocument();
  });

  it("opens the drawer for the selected type when Add Reservation is used", async () => {
    const user = userEvent.setup();
    render(
      <ReservationsTab tripId="trip-1" isDateless={false} onOpenEditDates={mockOnOpenEditDates} reservations={[]} />,
      { wrapper: Wrapper }
    );

    await user.click(screen.getByRole("button", { name: /add reservation/i }));

    expect(screen.getByTestId("drawer")).toHaveTextContent("Drawer for lodging");
  });

  it("removes a type's accordion section when all its reservations are deleted (rerender)", () => {
    const lodgingRes = makeReservation({ id: "res-lodging", type: ReservationType.Lodging });
    const flightRes = makeReservation({
      id: "res-flight",
      type: ReservationType.Flight,
      startAt: "2026-08-02T10:00:00.000Z",
      endAt: undefined,
    });

    const { rerender } = render(
      <ReservationsTab
        tripId="trip-1"
        isDateless={false}
        onOpenEditDates={mockOnOpenEditDates}
        reservations={[lodgingRes, flightRes]}
      />,
      {
        wrapper: Wrapper,
      }
    );

    expect(screen.getByRole("button", { name: /^Lodging, 1 reservation/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Flight, 1 reservation/ })).toBeInTheDocument();

    rerender(
      <Wrapper>
        <ReservationsTab
          tripId="trip-1"
          isDateless={false}
          onOpenEditDates={mockOnOpenEditDates}
          reservations={[flightRes]}
        />
      </Wrapper>
    );

    expect(screen.queryByRole("button", { name: /^Lodging, / })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Flight, 1 reservation/ })).toBeInTheDocument();
  });

  it("re-adds a deleted type in the collapsed state after its stale open-section entry is cleaned up", async () => {
    const user = userEvent.setup();
    const lodgingReservation = makeReservation({ id: "res-lodging", type: ReservationType.Lodging });

    const { rerender } = render(
      <ReservationsTab
        tripId="trip-1"
        isDateless={false}
        onOpenEditDates={mockOnOpenEditDates}
        reservations={[lodgingReservation]}
      />,
      { wrapper: Wrapper }
    );

    await user.click(screen.getByRole("button", { name: /^Lodging, 1 reservation, collapsed/ }));
    expect(screen.getByRole("button", { name: /^Lodging, 1 reservation, expanded/ })).toBeInTheDocument();

    rerender(
      <Wrapper>
        <ReservationsTab tripId="trip-1" isDateless={false} onOpenEditDates={mockOnOpenEditDates} reservations={[]} />
      </Wrapper>
    );

    rerender(
      <Wrapper>
        <ReservationsTab
          tripId="trip-1"
          isDateless={false}
          onOpenEditDates={mockOnOpenEditDates}
          reservations={[makeReservation({ id: "res-lodging-2", type: ReservationType.Lodging })]}
        />
      </Wrapper>
    );

    expect(screen.getByRole("button", { name: /^Lodging, 1 reservation, collapsed/ })).toBeInTheDocument();
  });

  it("shows the empty state when the last reservation is deleted (rerender)", () => {
    const lodgingRes = makeReservation({ id: "res-lodging", type: ReservationType.Lodging });

    const { rerender } = render(
      <ReservationsTab
        tripId="trip-1"
        isDateless={false}
        onOpenEditDates={mockOnOpenEditDates}
        reservations={[lodgingRes]}
      />,
      { wrapper: Wrapper }
    );

    expect(screen.getByRole("button", { name: /^Lodging, 1 reservation/ })).toBeInTheDocument();
    expect(screen.queryByText("No reservations yet")).not.toBeInTheDocument();

    rerender(
      <Wrapper>
        <ReservationsTab tripId="trip-1" isDateless={false} onOpenEditDates={mockOnOpenEditDates} reservations={[]} />
      </Wrapper>
    );

    expect(screen.getByText("No reservations yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reservation,/ })).not.toBeInTheDocument();
  });

  describe("one-shot search params", () => {
    it("auto-opens the type picker and strips the action param when mounted with action=add-reservation", () => {
      mockSearchParams.mockReturnValue(new URLSearchParams("tab=res&action=add-reservation"));

      render(
        <ReservationsTab tripId="trip-1" isDateless={false} onOpenEditDates={mockOnOpenEditDates} reservations={[]} />,
        { wrapper: Wrapper }
      );

      expect(screen.getByRole("button", { name: "Add Reservation" })).toHaveAttribute("data-open", "true");
      expect(mockRouterReplace).toHaveBeenCalledWith("/trips/trip-1?tab=res", { scroll: false });
    });

    it("does not auto-open the picker when there is no action param", () => {
      render(
        <ReservationsTab tripId="trip-1" isDateless={false} onOpenEditDates={mockOnOpenEditDates} reservations={[]} />,
        { wrapper: Wrapper }
      );

      expect(screen.getByRole("button", { name: "Add Reservation" })).toHaveAttribute("data-open", "false");
      expect(mockRouterReplace).not.toHaveBeenCalled();
    });

    it("expands the matching section, sets the highlight target, and strips the highlight param when mounted with highlight={id}", () => {
      const lodgingRes = makeReservation({ id: "res-lodging", type: ReservationType.Lodging });
      mockSearchParams.mockReturnValue(new URLSearchParams("tab=res&highlight=res-lodging"));

      render(
        <ReservationsTab
          tripId="trip-1"
          isDateless={false}
          onOpenEditDates={mockOnOpenEditDates}
          reservations={[lodgingRes]}
        />,
        { wrapper: Wrapper }
      );

      expect(screen.getByRole("button", { name: /^Lodging, 1 reservation, expanded/ })).toHaveAttribute(
        "data-highlighted-reservation-id",
        "res-lodging"
      );
      expect(mockRouterReplace).toHaveBeenCalledWith("/trips/trip-1?tab=res", { scroll: false });
    });

    it("ignores a highlight param that does not match any reservation", () => {
      const lodgingRes = makeReservation({ id: "res-lodging", type: ReservationType.Lodging });
      mockSearchParams.mockReturnValue(new URLSearchParams("tab=res&highlight=does-not-exist"));

      render(
        <ReservationsTab
          tripId="trip-1"
          isDateless={false}
          onOpenEditDates={mockOnOpenEditDates}
          reservations={[lodgingRes]}
        />,
        { wrapper: Wrapper }
      );

      expect(screen.getByRole("button", { name: /^Lodging, 1 reservation, collapsed/ })).toBeInTheDocument();
      expect(mockRouterReplace).not.toHaveBeenCalled();
    });

    it("preserves unrelated params when stripping the one-shot action param", () => {
      mockSearchParams.mockReturnValue(new URLSearchParams("tab=res&action=add-reservation&new=1"));

      render(
        <ReservationsTab tripId="trip-1" isDateless={false} onOpenEditDates={mockOnOpenEditDates} reservations={[]} />,
        { wrapper: Wrapper }
      );

      expect(mockRouterReplace).toHaveBeenCalledWith("/trips/trip-1?tab=res&new=1", { scroll: false });
    });

    it("does not retrigger the picker auto-open on a rerender once the action param is already gone", () => {
      mockSearchParams.mockReturnValue(new URLSearchParams("tab=res&action=add-reservation"));
      const { rerender } = render(
        <ReservationsTab tripId="trip-1" isDateless={false} onOpenEditDates={mockOnOpenEditDates} reservations={[]} />,
        { wrapper: Wrapper }
      );
      expect(mockRouterReplace).toHaveBeenCalledTimes(1);

      mockSearchParams.mockReturnValue(new URLSearchParams("tab=res"));
      rerender(
        <Wrapper>
          <ReservationsTab tripId="trip-1" isDateless={false} onOpenEditDates={mockOnOpenEditDates} reservations={[]} />
        </Wrapper>
      );

      expect(mockRouterReplace).toHaveBeenCalledTimes(1);
    });

    it("reopens the picker when the same action param is added again later", () => {
      mockSearchParams.mockReturnValue(new URLSearchParams("tab=res&action=add-reservation"));
      const { rerender } = render(
        <ReservationsTab tripId="trip-1" isDateless={false} onOpenEditDates={mockOnOpenEditDates} reservations={[]} />,
        { wrapper: Wrapper }
      );

      mockSearchParams.mockReturnValue(new URLSearchParams("tab=res"));
      rerender(
        <Wrapper>
          <ReservationsTab tripId="trip-1" isDateless={false} onOpenEditDates={mockOnOpenEditDates} reservations={[]} />
        </Wrapper>
      );

      mockSearchParams.mockReturnValue(new URLSearchParams("tab=res&action=add-reservation"));
      rerender(
        <Wrapper>
          <ReservationsTab tripId="trip-1" isDateless={false} onOpenEditDates={mockOnOpenEditDates} reservations={[]} />
        </Wrapper>
      );

      expect(mockRouterReplace).toHaveBeenCalledTimes(2);
      expect(mockRouterReplace).toHaveBeenNthCalledWith(2, "/trips/trip-1?tab=res", { scroll: false });
    });

    it("re-highlights the same reservation when the same highlight param is added again later", () => {
      const lodgingRes = makeReservation({ id: "res-lodging", type: ReservationType.Lodging });
      mockSearchParams.mockReturnValue(new URLSearchParams("tab=res&highlight=res-lodging"));
      const { rerender } = render(
        <ReservationsTab
          tripId="trip-1"
          isDateless={false}
          onOpenEditDates={mockOnOpenEditDates}
          reservations={[lodgingRes]}
        />,
        {
          wrapper: Wrapper,
        }
      );

      mockSearchParams.mockReturnValue(new URLSearchParams("tab=res"));
      rerender(
        <Wrapper>
          <ReservationsTab
            tripId="trip-1"
            isDateless={false}
            onOpenEditDates={mockOnOpenEditDates}
            reservations={[lodgingRes]}
          />
        </Wrapper>
      );

      mockSearchParams.mockReturnValue(new URLSearchParams("tab=res&highlight=res-lodging"));
      rerender(
        <Wrapper>
          <ReservationsTab
            tripId="trip-1"
            isDateless={false}
            onOpenEditDates={mockOnOpenEditDates}
            reservations={[lodgingRes]}
          />
        </Wrapper>
      );

      expect(mockRouterReplace).toHaveBeenCalledTimes(2);
      expect(mockRouterReplace).toHaveBeenNthCalledWith(2, "/trips/trip-1?tab=res", { scroll: false });
      expect(screen.getByRole("button", { name: /^Lodging, 1 reservation, expanded/ })).toHaveAttribute(
        "data-highlighted-reservation-id",
        "res-lodging"
      );
    });

    it("keeps an unmatched highlight param until the matching reservation is available", () => {
      mockSearchParams.mockReturnValue(new URLSearchParams("tab=res&highlight=res-lodging"));
      const { rerender } = render(
        <ReservationsTab tripId="trip-1" isDateless={false} onOpenEditDates={mockOnOpenEditDates} reservations={[]} />,
        { wrapper: Wrapper }
      );

      expect(mockRouterReplace).not.toHaveBeenCalled();

      const lodgingRes = makeReservation({ id: "res-lodging", type: ReservationType.Lodging });
      rerender(
        <Wrapper>
          <ReservationsTab
            tripId="trip-1"
            isDateless={false}
            onOpenEditDates={mockOnOpenEditDates}
            reservations={[lodgingRes]}
          />
        </Wrapper>
      );

      expect(mockRouterReplace).toHaveBeenCalledWith("/trips/trip-1?tab=res", { scroll: false });
      expect(screen.getByRole("button", { name: /^Lodging, 1 reservation, expanded/ })).toHaveAttribute(
        "data-highlighted-reservation-id",
        "res-lodging"
      );
    });
  });

  describe("dateless trip", () => {
    it("shows the set-dates prompt instead of the no-reservations empty state", () => {
      render(
        <ReservationsTab tripId="trip-1" isDateless={true} onOpenEditDates={mockOnOpenEditDates} reservations={[]} />,
        {
          wrapper: Wrapper,
        }
      );

      expect(screen.getByText("Set trip dates to add reservations")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Set trip dates" })).toBeInTheDocument();
      expect(screen.queryByText("No reservations yet")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /add reservation/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /reservation,/ })).not.toBeInTheDocument();
    });

    it("calls onOpenEditDates when Set trip dates is clicked", async () => {
      const user = userEvent.setup();
      render(
        <ReservationsTab tripId="trip-1" isDateless={true} onOpenEditDates={mockOnOpenEditDates} reservations={[]} />,
        {
          wrapper: Wrapper,
        }
      );

      await user.click(screen.getByRole("button", { name: "Set trip dates" }));

      expect(mockOnOpenEditDates).toHaveBeenCalledTimes(1);
    });

    it("keeps showing the prompt and never opens the picker when action=add-reservation is present", () => {
      mockSearchParams.mockReturnValue(new URLSearchParams("tab=res&action=add-reservation"));

      render(
        <ReservationsTab tripId="trip-1" isDateless={true} onOpenEditDates={mockOnOpenEditDates} reservations={[]} />,
        {
          wrapper: Wrapper,
        }
      );

      expect(screen.getByText("Set trip dates to add reservations")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Add Reservation" })).not.toBeInTheDocument();
      expect(mockRouterReplace).toHaveBeenCalledWith("/trips/trip-1?tab=res", { scroll: false });
    });

    it("does not auto-open the picker after dates are saved and the trip becomes dated", () => {
      mockSearchParams.mockReturnValue(new URLSearchParams("tab=res&action=add-reservation"));

      const { rerender } = render(
        <ReservationsTab tripId="trip-1" isDateless={true} onOpenEditDates={mockOnOpenEditDates} reservations={[]} />,
        { wrapper: Wrapper }
      );

      mockSearchParams.mockReturnValue(new URLSearchParams("tab=res"));
      rerender(
        <Wrapper>
          <ReservationsTab tripId="trip-1" isDateless={false} onOpenEditDates={mockOnOpenEditDates} reservations={[]} />
        </Wrapper>
      );

      expect(screen.getByText("No reservations yet")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /add reservation/i })).toHaveAttribute("data-open", "false");
    });
  });
});
