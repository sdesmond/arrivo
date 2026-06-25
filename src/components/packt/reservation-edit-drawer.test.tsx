import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { ReservationType } from "@/data/types";
import { ReservationEditDrawer } from "./reservation-edit-drawer";
import { createReservation } from "@/app/(app)/trips/[tripId]/reservations/actions";

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

vi.mock("@/app/(app)/trips/[tripId]/reservations/actions", () => ({
  createReservation: vi.fn(),
}));

vi.mock("@/components/ui/drawer", () => ({
  Drawer: (props: { children: React.ReactNode; open: boolean; onOpenChange?: (open: boolean) => void }) =>
    props.open ? (
      <>
        <button aria-label="Simulate drawer dismiss" onClick={() => props.onOpenChange?.(false)} />
        {props.children}
      </>
    ) : null,
  DrawerContent: (props: { children: React.ReactNode }) => <>{props.children}</>,
  DrawerHeader: (props: { children: React.ReactNode }) => <>{props.children}</>,
  DrawerFooter: (props: { children: React.ReactNode }) => <>{props.children}</>,
  DrawerTitle: (props: { children: React.ReactNode }) => <h2>{props.children}</h2>,
}));

vi.mock("@/components/packt/reservation-anchor-fieldset", () => ({
  ReservationAnchorFieldset: ({
    legend,
    required,
    date,
    time,
    onDateChange,
    onTimeChange,
    error,
  }: {
    legend: string;
    required: boolean;
    date?: string;
    time?: string;
    onDateChange: (value: string | undefined) => void;
    onTimeChange: (value: string | undefined) => void;
    error?: string;
  }) => (
    <fieldset>
      <legend>
        {legend}
        {required ? " *" : " (Optional)"}
      </legend>
      <input
        aria-label={`${legend} date`}
        value={date ?? ""}
        onChange={(event) => onDateChange(event.target.value || undefined)}
      />
      <input
        aria-label={`${legend} time`}
        value={time ?? ""}
        onChange={(event) => onTimeChange(event.target.value || undefined)}
      />
      {error && <p role="status">{error}</p>}
    </fieldset>
  ),
}));

vi.mock("@/components/packt/location-lookup-input", () => ({
  LocationLookupInput: ({
    id,
    value,
    onValueChange,
    onResolved,
  }: {
    id?: string;
    value: string;
    onValueChange: (value: string) => void;
    onResolved: (location: {
      name: string;
      fullAddress: string;
      center: [number, number];
      placeName: string;
      country: string;
      countryCode: string;
    }) => void;
  }) => (
    <div>
      <input id={id} value={value} onChange={(event) => onValueChange(event.target.value)} />
      <button
        onClick={() => {
          const fullAddress = id === "reservation-start-address" ? "Queens, NY 11430" : "1 World Way, Los Angeles, CA";
          onValueChange(fullAddress);
          onResolved({
            name: id === "reservation-start-address" ? "JFK Airport" : "LAX Airport",
            fullAddress,
            center: id === "reservation-start-address" ? [-73.7781, 40.6413] : [-118.4085, 33.9416],
            placeName: id === "reservation-start-address" ? "JFK Airport" : "LAX Airport",
            country: "United States",
            countryCode: "US",
          });
        }}
      >
        {id}-resolve
      </button>
    </div>
  ),
}));

describe("ReservationEditDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function changeField(label: string, value: string): void {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }

  it("does not render when closed", () => {
    render(
      <ReservationEditDrawer tripId="trip-1" type={ReservationType.Lodging} open={false} onOpenChange={vi.fn()} />
    );
    expect(screen.queryByText(/Add Lodging Reservation/i)).not.toBeInTheDocument();
  });

  it("renders the header with the selected type's label", () => {
    render(<ReservationEditDrawer tripId="trip-1" type={ReservationType.Lodging} open onOpenChange={vi.fn()} />);
    expect(screen.getByText("Add Lodging Reservation")).toBeInTheDocument();
    expect(screen.getByText(/Type: Lodging/)).toBeInTheDocument();
  });

  it.each([
    [ReservationType.Flight, "Departure", "Arrival"],
    [ReservationType.RentalCar, "Pickup", "Return"],
    [ReservationType.Lodging, "Check-in", "Check-out"],
    [ReservationType.Cruise, "Departure", "Return"],
    [ReservationType.Other, "Start", "End"],
  ])("renders the %s anchor labels", (type, startLabel, endLabel) => {
    render(<ReservationEditDrawer tripId="trip-1" type={type} open onOpenChange={vi.fn()} />);
    expect(screen.getByRole("group", { name: new RegExp(startLabel) })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: new RegExp(endLabel) })).toBeInTheDocument();
  });

  it("shows a validation error and does not save when endAt is required but missing", async () => {
    const user = userEvent.setup();
    render(<ReservationEditDrawer tripId="trip-1" type={ReservationType.Lodging} open onOpenChange={vi.fn()} />);

    await user.type(screen.getByLabelText("Provider *"), "Grand Hotel");
    await user.type(screen.getByLabelText("Check-in date"), "2026-08-01");
    await user.type(screen.getByLabelText("Check-in time"), "15:00");
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByRole("status")).toHaveTextContent("Check-out is required for this reservation type.");
    expect(createReservation).not.toHaveBeenCalled();
  });

  it("focuses the Provider input when the drawer opens", () => {
    render(<ReservationEditDrawer tripId="trip-1" type={ReservationType.Lodging} open onOpenChange={vi.fn()} />);

    expect(screen.getByLabelText("Provider *")).toHaveFocus();
  });

  it("blocks save and shows an error when the provider is empty", async () => {
    const user = userEvent.setup();
    render(<ReservationEditDrawer tripId="trip-1" type={ReservationType.Other} open onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByRole("status")).toHaveTextContent("Provider is required.");
    expect(createReservation).not.toHaveBeenCalled();
  });

  it("blocks save when a date is provided without a time", async () => {
    const user = userEvent.setup();
    render(<ReservationEditDrawer tripId="trip-1" type={ReservationType.Flight} open onOpenChange={vi.fn()} />);

    await user.type(screen.getByLabelText("Provider *"), "Acme Air");
    await user.type(screen.getByLabelText("Departure date"), "2026-08-01");
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByRole("status")).toHaveTextContent("Enter both a date and a time.");
    expect(createReservation).not.toHaveBeenCalled();
  });

  it("blocks save when the end anchor is set but the start anchor is missing", async () => {
    const user = userEvent.setup();
    render(<ReservationEditDrawer tripId="trip-1" type={ReservationType.Flight} open onOpenChange={vi.fn()} />);

    await user.type(screen.getByLabelText("Provider *"), "Acme Air");
    await user.type(screen.getByLabelText("Arrival date"), "2026-08-05");
    await user.type(screen.getByLabelText("Arrival time"), "11:00");
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByRole("status")).toHaveTextContent("Departure is required when arrival is set.");
    expect(createReservation).not.toHaveBeenCalled();
  });

  it("blocks save when the end anchor is before the start anchor", async () => {
    const user = userEvent.setup();
    render(<ReservationEditDrawer tripId="trip-1" type={ReservationType.Lodging} open onOpenChange={vi.fn()} />);

    await user.type(screen.getByLabelText("Provider *"), "Grand Hotel");
    await user.type(screen.getByLabelText("Check-in date"), "2026-08-05");
    await user.type(screen.getByLabelText("Check-in time"), "15:00");
    await user.type(screen.getByLabelText("Check-out date"), "2026-08-01");
    await user.type(screen.getByLabelText("Check-out time"), "11:00");
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByRole("status")).toHaveTextContent("Check-out must be after check-in.");
    expect(createReservation).not.toHaveBeenCalled();
  });

  it("saves successfully with endAt omitted for optional-anchor types", async () => {
    vi.mocked(createReservation).mockResolvedValueOnce(undefined);
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<ReservationEditDrawer tripId="trip-1" type={ReservationType.Flight} open onOpenChange={onOpenChange} />);

    await user.type(screen.getByLabelText("Provider *"), "Acme Air");
    await user.type(screen.getByLabelText("Departure date"), "2026-08-01");
    await user.type(screen.getByLabelText("Departure time"), "10:00");
    await user.click(screen.getByRole("button", { name: /save/i }));

    await vi.waitFor(() =>
      expect(createReservation).toHaveBeenCalledWith(
        "trip-1",
        expect.objectContaining({
          type: ReservationType.Flight,
          provider: "Acme Air",
          endAt: undefined,
        })
      )
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("saves with startAt and endAt converted from date+time inputs", async () => {
    vi.mocked(createReservation).mockResolvedValueOnce(undefined);
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<ReservationEditDrawer tripId="trip-1" type={ReservationType.Lodging} open onOpenChange={onOpenChange} />);

    changeField("Provider *", "Grand Hotel");
    changeField("Check-in date", "2026-08-01");
    changeField("Check-in time", "15:00");
    changeField("Check-out date", "2026-08-05");
    changeField("Check-out time", "11:00");
    await user.click(screen.getByRole("button", { name: /save/i }));

    await vi.waitFor(
      () =>
        expect(createReservation).toHaveBeenCalledWith("trip-1", {
          type: ReservationType.Lodging,
          provider: "Grand Hotel",
          startAt: "2026-08-01T15:00:00.000Z",
          endAt: "2026-08-05T11:00:00.000Z",
          startAddress: undefined,
          endAddress: undefined,
          cost: undefined,
          confirmationCode: undefined,
          notes: undefined,
        }),
      { timeout: 10_000 }
    );
  }, 15_000);

  it("saves with address fields and cost when provided", async () => {
    vi.mocked(createReservation).mockResolvedValueOnce(undefined);
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<ReservationEditDrawer tripId="trip-1" type={ReservationType.Flight} open onOpenChange={onOpenChange} />);

    await user.type(screen.getByLabelText("Provider *"), "Acme Air");
    await user.type(screen.getByLabelText("Departure date"), "2026-08-01");
    await user.type(screen.getByLabelText("Departure time"), "10:00");
    await user.type(screen.getByLabelText("Departure address (Optional)"), "JFK Airport, New York");
    await user.type(screen.getByLabelText("Arrival address (Optional)"), "LAX Airport, Los Angeles");
    await user.type(screen.getByLabelText("Cost (Optional)"), "349.99");
    await user.click(screen.getByRole("button", { name: /save/i }));

    await vi.waitFor(
      () =>
        expect(createReservation).toHaveBeenCalledWith(
          "trip-1",
          expect.objectContaining({
            startAddress: "JFK Airport, New York",
            startLocationName: undefined,
            startLocationLat: undefined,
            startLocationLng: undefined,
            endAddress: "LAX Airport, Los Angeles",
            endLocationName: undefined,
            endLocationLat: undefined,
            endLocationLng: undefined,
            cost: 349.99,
          })
        ),
      { timeout: 10_000 }
    );
  }, 15_000);

  it("saves structured location fields when suggestions are selected", async () => {
    vi.mocked(createReservation).mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(<ReservationEditDrawer tripId="trip-1" type={ReservationType.Flight} open onOpenChange={vi.fn()} />);

    await user.type(screen.getByLabelText("Provider *"), "Acme Air");
    await user.type(screen.getByLabelText("Departure date"), "2026-08-01");
    await user.type(screen.getByLabelText("Departure time"), "10:00");
    await user.click(screen.getByRole("button", { name: "reservation-start-address-resolve" }));
    await user.click(screen.getByRole("button", { name: "reservation-end-address-resolve" }));
    await user.click(screen.getByRole("button", { name: /save/i }));

    await vi.waitFor(
      () =>
        expect(createReservation).toHaveBeenCalledWith(
          "trip-1",
          expect.objectContaining({
            startAddress: "Queens, NY 11430",
            startLocationName: "JFK Airport",
            startLocationLat: 40.6413,
            startLocationLng: -73.7781,
            endAddress: "1 World Way, Los Angeles, CA",
            endLocationName: "LAX Airport",
            endLocationLat: 33.9416,
            endLocationLng: -118.4085,
          })
        ),
      { timeout: 10_000 }
    );
  }, 15_000);

  it("blocks save and shows an error when cost is not a valid number", async () => {
    const user = userEvent.setup();
    render(<ReservationEditDrawer tripId="trip-1" type={ReservationType.Flight} open onOpenChange={vi.fn()} />);

    await user.type(screen.getByLabelText("Provider *"), "Acme Air");
    await user.type(screen.getByLabelText("Departure date"), "2026-08-01");
    await user.type(screen.getByLabelText("Departure time"), "10:00");
    await user.type(screen.getByLabelText("Cost (Optional)"), "abc");
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByRole("status")).toHaveTextContent("Cost must be a valid number.");
    expect(createReservation).not.toHaveBeenCalled();
  });

  it("shows a toast and does not close the drawer when createReservation fails", async () => {
    vi.mocked(createReservation).mockRejectedValueOnce(new Error("Save failed"));
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<ReservationEditDrawer tripId="trip-1" type={ReservationType.Other} open onOpenChange={onOpenChange} />);

    changeField("Provider *", "Misc");
    changeField("Start date", "2026-08-01");
    changeField("Start time", "10:00");
    await user.click(screen.getByRole("button", { name: /save/i }));

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith("Save failed"), { timeout: 10_000 });
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  }, 15_000);

  it("calls onOpenChange(false) when Cancel is clicked", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<ReservationEditDrawer tripId="trip-1" type={ReservationType.Other} open onOpenChange={onOpenChange} />);

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("calls onOpenChange(false) when the drawer is dismissed", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<ReservationEditDrawer tripId="trip-1" type={ReservationType.Other} open onOpenChange={onOpenChange} />);

    await user.click(screen.getByRole("button", { name: "Simulate drawer dismiss" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("saves with confirmation code and notes included", async () => {
    vi.mocked(createReservation).mockResolvedValueOnce(undefined);
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<ReservationEditDrawer tripId="trip-1" type={ReservationType.Other} open onOpenChange={onOpenChange} />);

    await user.type(screen.getByLabelText("Provider *"), "Misc");
    await user.type(screen.getByLabelText("Start date"), "2026-08-01");
    await user.type(screen.getByLabelText("Start time"), "10:00");
    await user.type(screen.getByLabelText("Confirmation code (Optional)"), "ABC123");
    await user.type(screen.getByLabelText("Notes (Optional)"), "Bring ID");
    await user.click(screen.getByRole("button", { name: /save/i }));

    await vi.waitFor(() =>
      expect(createReservation).toHaveBeenCalledWith(
        "trip-1",
        expect.objectContaining({
          provider: "Misc",
          confirmationCode: "ABC123",
          notes: "Bring ID",
        })
      )
    );
  });

  it.each([
    ReservationType.Flight,
    ReservationType.Train,
    ReservationType.Bus,
    ReservationType.Ferry,
    ReservationType.Cruise,
  ])("renders a service number field for %s", (type) => {
    render(<ReservationEditDrawer tripId="trip-1" type={type} open onOpenChange={vi.fn()} />);

    expect(screen.getByLabelText(/(Flight|Train|Bus|Sailing|Voyage) number \(Optional\)/)).toBeInTheDocument();
  });

  it.each([ReservationType.RentalCar, ReservationType.Lodging, ReservationType.Other])(
    "renders no service number field for %s",
    (type) => {
      render(<ReservationEditDrawer tripId="trip-1" type={type} open onOpenChange={vi.fn()} />);

      expect(screen.queryByLabelText(/number \(Optional\)/)).not.toBeInTheDocument();
    }
  );

  it("includes the flight number in the save payload", async () => {
    vi.mocked(createReservation).mockResolvedValueOnce(undefined);
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<ReservationEditDrawer tripId="trip-1" type={ReservationType.Flight} open onOpenChange={onOpenChange} />);

    await user.type(screen.getByLabelText("Provider *"), "Acme Air");
    await user.type(screen.getByLabelText("Departure date"), "2026-08-01");
    await user.type(screen.getByLabelText("Departure time"), "10:00");
    await user.type(screen.getByLabelText("Flight number (Optional)"), "AA123");
    await user.click(screen.getByRole("button", { name: /save/i }));

    await vi.waitFor(() =>
      expect(createReservation).toHaveBeenCalledWith(
        "trip-1",
        expect.objectContaining({
          provider: "Acme Air",
          serviceNumber: "AA123",
        })
      )
    );
  });

  it("renders the Documents section with the correct empty state description", () => {
    render(<ReservationEditDrawer tripId="trip-1" type={ReservationType.Other} open onOpenChange={vi.fn()} />);

    expect(screen.getByText("No documents yet")).toBeInTheDocument();
    expect(
      screen.getByText("Attach a hotel confirmation, receipt, or other reservation document.")
    ).toBeInTheDocument();
  });
});
