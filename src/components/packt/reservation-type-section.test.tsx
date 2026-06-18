import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { ReservationType, type Reservation } from "@/data/types";
import {
  ReservationTypeSection,
  formatAnchorDateTime,
  sortReservationsByStartAt,
  getNextUpcoming,
} from "./reservation-type-section";
import { formatReservationDateRange } from "./reservation-type-badge";

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

vi.mock("./reservation-row", () => ({
  ReservationRow: ({ reservation }: { reservation: Reservation }) => {
    const [editingProvider, setEditingProvider] = useState(false);

    return (
      <div>
        {editingProvider ? (
          <input aria-label="Provider" defaultValue={reservation.provider} />
        ) : (
          <button type="button" onClick={() => setEditingProvider(true)}>
            {reservation.provider}
          </button>
        )}
        {reservation.startAt ? (
          <button type="button">{formatReservationDateRange(reservation.startAt, reservation.endAt)}</button>
        ) : null}
        {reservation.confirmationCode ? <span>{reservation.confirmationCode}</span> : null}
      </div>
    );
  },
}));

vi.mock("@/app/(app)/trips/[tripId]/reservations/actions", () => ({
  updateReservation: vi.fn(),
}));

const NOW = new Date("2026-06-15T12:00:00.000Z");

function makeReservation(overrides: Partial<Reservation>): Reservation {
  return {
    id: "res-1",
    tripId: "trip-1",
    type: ReservationType.Flight,
    provider: "Acme Air",
    ...overrides,
  };
}

describe("formatAnchorDateTime", () => {
  it("formats an ISO datetime as 'Weekday, Mon D · h:mm AM/PM'", () => {
    expect(formatAnchorDateTime("2026-06-16T15:00:00.000Z")).toMatch(
      /^[A-Za-z]{3}, [A-Za-z]{3} \d{1,2} · \d{1,2}:\d{2} (AM|PM)$/
    );
  });
});

describe("sortReservationsByStartAt", () => {
  it("orders dated reservations ascending and places undated reservations last", () => {
    const later = makeReservation({ id: "later", startAt: "2026-06-20T10:00:00.000Z" });
    const earlier = makeReservation({ id: "earlier", startAt: "2026-06-16T10:00:00.000Z" });
    const undated = makeReservation({ id: "undated" });

    const sorted = sortReservationsByStartAt([later, undated, earlier]);

    expect(sorted.map((reservation) => reservation.id)).toEqual(["earlier", "later", "undated"]);
  });
});

describe("getNextUpcoming", () => {
  it("returns the soonest upcoming reservation", () => {
    const later = makeReservation({ id: "later", startAt: "2026-06-20T10:00:00.000Z" });
    const sooner = makeReservation({ id: "sooner", startAt: "2026-06-16T10:00:00.000Z" });

    expect(getNextUpcoming([later, sooner], NOW)?.id).toBe("sooner");
  });

  it("falls back to the most-recently-past reservation when none are upcoming", () => {
    const oldest = makeReservation({ id: "oldest", startAt: "2026-05-01T10:00:00.000Z" });
    const older = makeReservation({ id: "older", startAt: "2026-06-01T10:00:00.000Z" });
    const recent = makeReservation({ id: "recent", startAt: "2026-06-14T10:00:00.000Z" });

    expect(getNextUpcoming([older, recent, oldest], NOW)?.id).toBe("recent");
    expect(getNextUpcoming([recent, older, oldest], NOW)?.id).toBe("recent");
  });

  it("returns the first reservation when none have a startAt", () => {
    const first = makeReservation({ id: "first" });
    const second = makeReservation({ id: "second" });

    expect(getNextUpcoming([first, second], NOW)?.id).toBe("first");
  });

  it("returns undefined when there are no reservations", () => {
    expect(getNextUpcoming([], NOW)).toBeUndefined();
  });
});

describe("ReservationTypeSection", () => {
  it("renders the collapsed header with type label, count badge, and accessible name", () => {
    const reservation = makeReservation({ startAt: "2026-06-16T15:00:00.000Z" });
    render(
      <ReservationTypeSection
        type={ReservationType.Flight}
        reservations={[reservation]}
        open={false}
        onToggle={vi.fn()}
        now={NOW}
      />
    );

    const header = screen.getByRole("button", { name: "Flight, 1 reservation, collapsed" });
    expect(header).toBeInTheDocument();
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("1")).toHaveAttribute("aria-hidden", "true");
  });

  it("uses plural wording for multiple reservations", () => {
    const reservations = [
      makeReservation({ id: "a", startAt: "2026-06-16T15:00:00.000Z" }),
      makeReservation({ id: "b", startAt: "2026-06-18T15:00:00.000Z" }),
    ];
    render(
      <ReservationTypeSection
        type={ReservationType.Flight}
        reservations={reservations}
        open={false}
        onToggle={vi.fn()}
        now={NOW}
      />
    );

    expect(screen.getByRole("button", { name: "Flight, 2 reservations, collapsed" })).toBeInTheDocument();
  });

  it("shows the next-upcoming preview text while collapsed", () => {
    const reservation = makeReservation({ provider: "Acme Air", startAt: "2026-06-16T15:00:00.000Z" });
    render(
      <ReservationTypeSection
        type={ReservationType.Flight}
        reservations={[reservation]}
        open={false}
        onToggle={vi.fn()}
        now={NOW}
      />
    );

    expect(screen.getByText(/Next:/)).toBeInTheDocument();
    expect(screen.getByText("Acme Air")).toBeInTheDocument();
  });

  it("shows just the provider in the preview when the next-upcoming reservation has no startAt", () => {
    const reservation = makeReservation({ provider: "Mystery Tours" });
    render(
      <ReservationTypeSection
        type={ReservationType.Other}
        reservations={[reservation]}
        open={false}
        onToggle={vi.fn()}
        now={NOW}
      />
    );

    const preview = screen.getByText(/Next:/);
    expect(preview).toHaveTextContent("Next: Mystery Tours");
    expect(preview.textContent).not.toContain("·");
  });

  it("rotates the chevron and shows a header bottom border when expanded", () => {
    const reservation = makeReservation({ startAt: "2026-06-16T15:00:00.000Z" });
    const { rerender } = render(
      <ReservationTypeSection
        type={ReservationType.Flight}
        reservations={[reservation]}
        open={false}
        onToggle={vi.fn()}
        now={NOW}
      />
    );

    const header = screen.getByRole("button", { name: /Flight, 1 reservation, collapsed/ });
    const icons = header.querySelectorAll("svg");
    const chevron = icons[icons.length - 1];
    expect(chevron).not.toHaveStyle({ transform: "rotate(180deg)" });
    expect(header).toHaveStyle({ borderBottom: "none" });

    rerender(
      <ReservationTypeSection
        type={ReservationType.Flight}
        reservations={[reservation]}
        open
        onToggle={vi.fn()}
        now={NOW}
      />
    );

    const expandedHeader = screen.getByRole("button", { name: /Flight, 1 reservation, expanded/ });
    const expandedIcons = expandedHeader.querySelectorAll("svg");
    const expandedChevron = expandedIcons[expandedIcons.length - 1];
    expect(expandedChevron).toHaveStyle({ transform: "rotate(180deg)" });
    expect(expandedHeader).toHaveStyle({ borderBottom: "1px solid var(--line)" });
  });

  it("calls onToggle when the header is clicked", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    const reservation = makeReservation({ startAt: "2026-06-16T15:00:00.000Z" });
    render(
      <ReservationTypeSection
        type={ReservationType.Flight}
        reservations={[reservation]}
        open={false}
        onToggle={onToggle}
        now={NOW}
      />
    );

    await user.click(screen.getByRole("button", { name: /Flight, 1 reservation, collapsed/ }));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("renders expanded rows ordered by startAt with undated rows last, and switches accessible name to expanded", () => {
    const later = makeReservation({ id: "later", provider: "Late Air", startAt: "2026-06-20T10:00:00.000Z" });
    const earlier = makeReservation({ id: "earlier", provider: "Early Air", startAt: "2026-06-16T10:00:00.000Z" });
    const undated = makeReservation({ id: "undated", provider: "Undated Air" });

    render(
      <ReservationTypeSection
        type={ReservationType.Flight}
        reservations={[later, undated, earlier]}
        open
        onToggle={vi.fn()}
        now={NOW}
      />
    );

    expect(screen.getByRole("button", { name: "Flight, 3 reservations, expanded" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );

    const providers = screen.getAllByText(/Air$/).map((node) => node.textContent);
    expect(providers).toEqual(["Early Air", "Late Air", "Undated Air"]);
  });

  it("renders anchor lines and a confirmation-code chip for an expanded row", () => {
    const reservation = makeReservation({
      provider: "Grand Hotel",
      type: ReservationType.Lodging,
      startAt: "2026-06-16T15:00:00.000Z",
      endAt: "2026-06-20T11:00:00.000Z",
      confirmationCode: "ABC123",
    });

    render(
      <ReservationTypeSection
        type={ReservationType.Lodging}
        reservations={[reservation]}
        open
        onToggle={vi.fn()}
        now={NOW}
      />
    );

    const expectedRange = formatReservationDateRange(reservation.startAt, reservation.endAt);
    expect(screen.getByRole("button", { name: expectedRange })).toBeInTheDocument();
    expect(screen.queryByText("Check-in")).not.toBeInTheDocument();
    expect(screen.queryByText("Check-out")).not.toBeInTheDocument();
    expect(screen.getByText("ABC123")).toBeInTheDocument();
  });

  it("does not render a confirmation-code chip when no confirmationCode is set", () => {
    const reservation = makeReservation({ startAt: "2026-06-16T15:00:00.000Z" });
    render(
      <ReservationTypeSection
        type={ReservationType.Flight}
        reservations={[reservation]}
        open
        onToggle={vi.fn()}
        now={NOW}
      />
    );

    expect(screen.queryByText("ABC123")).not.toBeInTheDocument();
  });

  it("enters edit mode when clicking the provider field of an expanded row", async () => {
    const user = userEvent.setup();
    const reservation = makeReservation({ provider: "Acme Air", startAt: "2026-06-16T15:00:00.000Z" });
    render(
      <ReservationTypeSection
        type={ReservationType.Flight}
        reservations={[reservation]}
        open
        onToggle={vi.fn()}
        now={NOW}
      />
    );

    await user.click(screen.getByRole("button", { name: "Acme Air" }));

    expect(screen.getByRole("textbox", { name: "Provider" })).toBeInTheDocument();
  });
});
