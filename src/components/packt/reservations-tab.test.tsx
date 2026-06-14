import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReservationType, type Reservation } from "@/data/types";
import { ReservationsTab } from "./reservations-tab";

vi.mock("@/components/packt/reservation-type-picker", () => ({
  ReservationTypePicker: ({ onSelectType }: { onSelectType: (type: string) => void }) => (
    <button onClick={() => onSelectType(ReservationType.Lodging)}>Add Reservation</button>
  ),
}));

vi.mock("@/components/packt/reservation-edit-drawer", () => ({
  ReservationEditDrawer: ({ open, type }: { open: boolean; type: string }) =>
    open ? <div data-testid="drawer">Drawer for {type}</div> : null,
}));

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
  it("shows an empty state when there are no reservations", () => {
    render(<ReservationsTab tripId="trip-1" reservations={[]} />);
    expect(screen.getByText("No reservations yet.")).toBeInTheDocument();
  });

  it("groups reservations by type", () => {
    render(
      <ReservationsTab
        tripId="trip-1"
        reservations={[
          makeReservation({ id: "res-1", provider: "Grand Hotel", type: ReservationType.Lodging }),
          makeReservation({ id: "res-2", provider: "Acme Air", type: ReservationType.Flight, endAt: undefined }),
        ]}
      />
    );

    expect(screen.getByText("Lodging")).toBeInTheDocument();
    expect(screen.getByText("Flight")).toBeInTheDocument();
    expect(screen.getByText("Grand Hotel")).toBeInTheDocument();
    expect(screen.getByText("Acme Air")).toBeInTheDocument();
  });

  it("opens the drawer for the selected type when Add Reservation is used", async () => {
    const user = userEvent.setup();
    render(<ReservationsTab tripId="trip-1" reservations={[]} />);

    await user.click(screen.getByRole("button", { name: /add reservation/i }));

    expect(screen.getByTestId("drawer")).toHaveTextContent("Drawer for lodging");
  });
});
