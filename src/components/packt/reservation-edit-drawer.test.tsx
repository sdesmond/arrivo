import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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

describe("ReservationEditDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
    expect(screen.getByText(new RegExp(startLabel))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(endLabel))).toBeInTheDocument();
  });

  it("shows a validation error and does not save when endAt is required but missing", async () => {
    const user = userEvent.setup();
    render(<ReservationEditDrawer tripId="trip-1" type={ReservationType.Lodging} open onOpenChange={vi.fn()} />);

    await user.type(screen.getByLabelText("Provider *"), "Grand Hotel");
    await user.type(screen.getByLabelText("Check-in date"), "2026-08-01");
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByRole("status")).toHaveTextContent("Check-out is required for this reservation type.");
    expect(createReservation).not.toHaveBeenCalled();
  });

  it("saves successfully with endAt omitted for optional-anchor types", async () => {
    vi.mocked(createReservation).mockResolvedValueOnce(undefined);
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<ReservationEditDrawer tripId="trip-1" type={ReservationType.Flight} open onOpenChange={onOpenChange} />);

    await user.type(screen.getByLabelText("Provider *"), "Acme Air");
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

    await user.type(screen.getByLabelText("Provider *"), "Grand Hotel");
    await user.type(screen.getByLabelText("Check-in date"), "2026-08-01");
    await user.type(screen.getByLabelText("Check-in time"), "15:00");
    await user.type(screen.getByLabelText("Check-out date"), "2026-08-05");
    await user.type(screen.getByLabelText("Check-out time"), "11:00");
    await user.click(screen.getByRole("button", { name: /save/i }));

    await vi.waitFor(() =>
      expect(createReservation).toHaveBeenCalledWith("trip-1", {
        type: ReservationType.Lodging,
        provider: "Grand Hotel",
        startAt: "2026-08-01T15:00:00.000Z",
        endAt: "2026-08-05T11:00:00.000Z",
        confirmationCode: undefined,
        notes: undefined,
      })
    );
  });

  it("shows a toast and does not close the drawer when createReservation fails", async () => {
    vi.mocked(createReservation).mockRejectedValueOnce(new Error("Save failed"));
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<ReservationEditDrawer tripId="trip-1" type={ReservationType.Other} open onOpenChange={onOpenChange} />);

    await user.type(screen.getByLabelText("Provider *"), "Misc");
    await user.click(screen.getByRole("button", { name: /save/i }));

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith("Save failed"));
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

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
});
