import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { ReservationRow } from "./reservation-row";
import { updateReservation, deleteReservation } from "@/app/(app)/trips/[tripId]/reservations/actions";
import { ReservationType, type Reservation } from "@/data/types";
import { formatReservationDateRange } from "./reservation-type-badge";
import type { CostDialogProps } from "@/components/packt/cost-dialog";

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

vi.mock("@/app/(app)/trips/[tripId]/reservations/actions", () => ({
  updateReservation: vi.fn(),
  deleteReservation: vi.fn(),
}));

vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({
    children,
    open,
    onOpenChange,
  }: {
    children: React.ReactNode;
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) =>
    open ? (
      <div>
        {children}
        <button onClick={() => onOpenChange(false)}>dismiss-dialog</button>
      </div>
    ) : null,
  AlertDialogContent: (props: { children: React.ReactNode }) => <>{props.children}</>,
  AlertDialogHeader: (props: { children: React.ReactNode }) => <>{props.children}</>,
  AlertDialogTitle: (props: { children: React.ReactNode }) => <>{props.children}</>,
  AlertDialogDescription: (props: { children: React.ReactNode }) => <>{props.children}</>,
  AlertDialogFooter: (props: { children: React.ReactNode }) => <>{props.children}</>,
  AlertDialogCancel: ({ children, disabled }: { children: React.ReactNode; disabled?: boolean }) => (
    <button disabled={disabled}>{children}</button>
  ),
  AlertDialogAction: ({
    children,
    disabled,
    onClick,
  }: {
    children: React.ReactNode;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/date-picker", () => ({
  DatePicker: ({
    value,
    onChange,
    "aria-label": ariaLabel,
  }: {
    value?: string;
    onChange: (value: string | undefined) => void;
    "aria-label"?: string;
  }) => (
    <input aria-label={ariaLabel} value={value ?? ""} onChange={(event) => onChange(event.target.value || undefined)} />
  ),
}));

vi.mock("@/components/ui/time-picker", () => ({
  TimePicker: ({
    value,
    onChange,
    "aria-label": ariaLabel,
  }: {
    value?: string;
    onChange: (value: string | undefined) => void;
    "aria-label"?: string;
  }) => (
    <input aria-label={ariaLabel} value={value ?? ""} onChange={(event) => onChange(event.target.value || undefined)} />
  ),
}));

vi.mock("./reservation-field-dialog", () => ({
  ReservationFieldDialog: ({
    title,
    open,
    onOpenChange,
    onSave,
    mode,
  }: {
    title: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSave: (value?: string | { address: string; name?: string; lat?: number; lng?: number }) => void;
    mode?: "text" | "location";
  }) =>
    open ? (
      <div>
        <p data-testid="dialog-title">{title}</p>
        <button
          onClick={() => {
            onSave(
              mode === "location"
                ? {
                    address: "Updated value",
                    name: "Updated place",
                    lat: 40.7128,
                    lng: -74.006,
                  }
                : "Updated value"
            );
            onOpenChange(false);
          }}
        >
          dialog-save
        </button>
        <button
          onClick={() => {
            onSave(undefined);
            onOpenChange(false);
          }}
        >
          dialog-remove
        </button>
        <button onClick={() => onOpenChange(false)}>dialog-cancel</button>
      </div>
    ) : null,
}));

vi.mock("@/components/packt/cost-dialog", () => ({
  CostDialog: ({ open, onOpenChange, onSave }: CostDialogProps) =>
    open ? (
      <div>
        <button
          onClick={() => {
            onSave(199.99);
            onOpenChange(false);
          }}
        >
          dialog-save
        </button>
        <button
          onClick={() => {
            onSave(undefined);
            onOpenChange(false);
          }}
        >
          dialog-remove
        </button>
        <button onClick={() => onOpenChange(false)}>dialog-cancel</button>
      </div>
    ) : null,
}));

const populatedReservation: Reservation = {
  id: "res-1",
  tripId: "trip-1",
  type: ReservationType.Lodging,
  provider: "Grand Hotel",
  startAt: "2026-08-01T15:00:00.000Z",
  endAt: "2026-08-05T11:00:00.000Z",
  startAddress: "123 Airport Rd, New York",
  startLocationName: "JFK Airport",
  startLocationLat: 40.6413,
  startLocationLng: -73.7781,
  endAddress: "456 Hotel Ave, Paris",
  endLocationName: "Grand Hotel Paris",
  endLocationLat: 48.8566,
  endLocationLng: 2.3522,
  cost: 499,
  confirmationCode: "ABC123",
  notes: "Late checkout requested",
};

const emptyReservation: Reservation = {
  id: "res-2",
  tripId: "trip-1",
  type: ReservationType.Other,
  provider: "Misc Booking",
};

describe("ReservationRow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(updateReservation).mockResolvedValue(undefined);
  });

  it("renders all fields with values for a populated reservation", () => {
    render(<ReservationRow reservation={populatedReservation} type={ReservationType.Lodging} isLast={false} />);

    const provider = screen.getByRole("button", { name: "Grand Hotel" });
    expect(provider).toBeInTheDocument();
    expect(provider).toHaveStyle({ fontWeight: 600 });

    const expectedRange = formatReservationDateRange(populatedReservation.startAt, populatedReservation.endAt);
    expect(screen.getByRole("button", { name: expectedRange })).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Check-in · JFK Airport" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check-out · Grand Hotel Paris" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "499.00" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ABC123" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Late checkout requested" })).toBeInTheDocument();
  });

  it("renders placeholders for a mostly-empty reservation with the generic 'Other' anchor labels", () => {
    render(<ReservationRow reservation={emptyReservation} type={ReservationType.Other} isLast />);

    expect(screen.getByRole("button", { name: "Misc Booking" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add dates" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add start" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add end" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add start address" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add end address" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add cost" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add confirmation code" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add notes" })).toBeInTheDocument();
  });

  it("renders a confirmation-code chip with the wallet icon when present", () => {
    render(<ReservationRow reservation={populatedReservation} type={ReservationType.Lodging} isLast={false} />);

    const chip = screen.getByRole("button", { name: "ABC123" });
    expect(chip).toBeInTheDocument();
    expect(chip.querySelector("svg")).toBeInTheDocument();
  });

  it("updates only the provider's displayed value after a successful edit, leaving other fields unchanged", async () => {
    const user = userEvent.setup();
    render(<ReservationRow reservation={populatedReservation} type={ReservationType.Lodging} isLast={false} />);

    await user.click(screen.getByRole("button", { name: "Grand Hotel" }));
    const input = screen.getByRole("textbox", { name: "Provider" });
    await user.clear(input);
    await user.type(input, "New Hotel Name");
    await user.keyboard("{Enter}");

    expect(updateReservation).toHaveBeenCalledWith("res-1", { provider: "New Hotel Name" });
    expect(await screen.findByRole("button", { name: "New Hotel Name" })).toBeInTheDocument();

    const expectedRange = formatReservationDateRange(populatedReservation.startAt, populatedReservation.endAt);
    expect(screen.getByRole("button", { name: expectedRange })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ABC123" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Late checkout requested" })).toBeInTheDocument();
  });

  it("trims surrounding whitespace from the provider's displayed value after a successful edit", async () => {
    const user = userEvent.setup();
    render(<ReservationRow reservation={populatedReservation} type={ReservationType.Lodging} isLast={false} />);

    await user.click(screen.getByRole("button", { name: "Grand Hotel" }));
    const input = screen.getByRole("textbox", { name: "Provider" });
    await user.clear(input);
    await user.type(input, "  Trimmed Hotel  ");
    await user.keyboard("{Enter}");

    expect(updateReservation).toHaveBeenCalledWith("res-1", { provider: "Trimmed Hotel" });
    expect(await screen.findByRole("button", { name: "Trimmed Hotel" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "  Trimmed Hotel  " })).not.toBeInTheDocument();
  });

  it("clicking the date range enters edit mode with direct date/time inputs", async () => {
    const user = userEvent.setup();
    render(<ReservationRow reservation={populatedReservation} type={ReservationType.Lodging} isLast={false} />);

    const expectedRange = formatReservationDateRange(populatedReservation.startAt, populatedReservation.endAt);
    await user.click(screen.getByRole("button", { name: expectedRange }));

    expect(screen.getByLabelText("Check-in date")).toBeInTheDocument();
    expect(screen.getByLabelText("Check-in time")).toBeInTheDocument();
    expect(screen.getByLabelText("Check-out date")).toBeInTheDocument();
    expect(screen.getByLabelText("Check-out time")).toBeInTheDocument();
  });

  it("clicking away collapses back to the combined date range display", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <ReservationRow reservation={populatedReservation} type={ReservationType.Lodging} isLast={false} />
        <button type="button">Outside</button>
      </div>
    );

    const expectedRange = formatReservationDateRange(populatedReservation.startAt, populatedReservation.endAt);
    await user.click(screen.getByRole("button", { name: expectedRange }));
    await user.click(screen.getByRole("button", { name: "Outside" }));

    expect(screen.getByRole("button", { name: expectedRange })).toBeInTheDocument();
    expect(screen.queryByLabelText("Check-in date")).not.toBeInTheDocument();
  });

  it("clicking away saves updated startAt and collapses to combined view", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <ReservationRow reservation={populatedReservation} type={ReservationType.Lodging} isLast={false} />
        <button type="button">Outside</button>
      </div>
    );

    const expectedRange = formatReservationDateRange(populatedReservation.startAt, populatedReservation.endAt);
    await user.click(screen.getByRole("button", { name: expectedRange }));

    const timeInput = screen.getByLabelText("Check-in time");
    await user.clear(timeInput);
    await user.type(timeInput, "10:00");
    await user.click(screen.getByRole("button", { name: "Outside" }));

    const expectedIso = new Date("2026-08-01T10:00:00").toISOString();
    expect(updateReservation).toHaveBeenCalledWith("res-1", { startAt: expectedIso });

    const newRange = formatReservationDateRange(expectedIso, populatedReservation.endAt);
    expect(await screen.findByRole("button", { name: newRange })).toBeInTheDocument();
    expect(screen.queryByLabelText("Check-in date")).not.toBeInTheDocument();
  });

  it("clicking the start address chip opens a dialog with the correct title", async () => {
    const user = userEvent.setup();
    render(<ReservationRow reservation={populatedReservation} type={ReservationType.Lodging} isLast={false} />);

    await user.click(screen.getByRole("button", { name: "Check-in · JFK Airport" }));

    expect(screen.getByTestId("dialog-title")).toHaveTextContent("Check-in address");
  });

  it("clicking the end address chip opens a dialog with the correct title", async () => {
    const user = userEvent.setup();
    render(<ReservationRow reservation={populatedReservation} type={ReservationType.Lodging} isLast={false} />);

    await user.click(screen.getByRole("button", { name: "Check-out · Grand Hotel Paris" }));

    expect(screen.getByTestId("dialog-title")).toHaveTextContent("Check-out address");
  });

  it("updates startAddress after saving through the dialog", async () => {
    const user = userEvent.setup();
    render(<ReservationRow reservation={populatedReservation} type={ReservationType.Lodging} isLast={false} />);

    await user.click(screen.getByRole("button", { name: "Check-in · JFK Airport" }));
    await user.click(screen.getByRole("button", { name: "dialog-save" }));

    expect(updateReservation).toHaveBeenCalledWith("res-1", {
      startAddress: "Updated value",
      startLocationName: "Updated place",
      startLocationLat: 40.7128,
      startLocationLng: -74.006,
    });
    expect(screen.getByRole("button", { name: "Check-in · Updated place" })).toBeInTheDocument();
  });

  it("clears startAddress when Remove is clicked in the dialog", async () => {
    const user = userEvent.setup();
    render(<ReservationRow reservation={populatedReservation} type={ReservationType.Lodging} isLast={false} />);

    await user.click(screen.getByRole("button", { name: "Check-in · JFK Airport" }));
    await user.click(screen.getByRole("button", { name: "dialog-remove" }));

    expect(updateReservation).toHaveBeenCalledWith("res-1", { startAddress: "" });
    expect(screen.getByRole("button", { name: "Add check-in address" })).toBeInTheDocument();
  });

  it("updates endAddress after saving through the dialog", async () => {
    const user = userEvent.setup();
    render(<ReservationRow reservation={populatedReservation} type={ReservationType.Lodging} isLast={false} />);

    await user.click(screen.getByRole("button", { name: "Check-out · Grand Hotel Paris" }));
    await user.click(screen.getByRole("button", { name: "dialog-save" }));

    expect(updateReservation).toHaveBeenCalledWith("res-1", {
      endAddress: "Updated value",
      endLocationName: "Updated place",
      endLocationLat: 40.7128,
      endLocationLng: -74.006,
    });
    expect(screen.getByRole("button", { name: "Check-out · Updated place" })).toBeInTheDocument();
  });

  it("updates cost after saving through the cost dialog", async () => {
    const user = userEvent.setup();
    render(<ReservationRow reservation={populatedReservation} type={ReservationType.Lodging} isLast={false} />);

    await user.click(screen.getByRole("button", { name: "499.00" }));
    await user.click(screen.getByRole("button", { name: "dialog-save" }));

    expect(updateReservation).toHaveBeenCalledWith("res-1", { cost: 199.99 });
    expect(
      screen.getByRole("button", {
        name: new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(199.99),
      })
    ).toBeInTheDocument();
  });

  it("clears cost when Remove is clicked in the cost dialog", async () => {
    const user = userEvent.setup();
    render(<ReservationRow reservation={populatedReservation} type={ReservationType.Lodging} isLast={false} />);

    await user.click(screen.getByRole("button", { name: "499.00" }));
    await user.click(screen.getByRole("button", { name: "dialog-remove" }));

    expect(updateReservation).toHaveBeenCalledWith("res-1", { cost: null });
    expect(screen.getByRole("button", { name: "Add cost" })).toBeInTheDocument();
  });

  it("updates confirmation code after saving through the dialog", async () => {
    const user = userEvent.setup();
    render(<ReservationRow reservation={populatedReservation} type={ReservationType.Lodging} isLast={false} />);

    await user.click(screen.getByRole("button", { name: "ABC123" }));
    await user.click(screen.getByRole("button", { name: "dialog-save" }));

    expect(updateReservation).toHaveBeenCalledWith("res-1", { confirmationCode: "Updated value" });
    expect(screen.getByRole("button", { name: "Updated value" })).toBeInTheDocument();
  });

  it("shows a toast when a dialog save fails with an Error", async () => {
    vi.mocked(updateReservation).mockRejectedValueOnce(new Error("Network error"));
    const user = userEvent.setup();
    render(<ReservationRow reservation={populatedReservation} type={ReservationType.Lodging} isLast={false} />);

    await user.click(screen.getByRole("button", { name: "Check-in · JFK Airport" }));
    await user.click(screen.getByRole("button", { name: "dialog-save" }));

    await vi.waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Network error"));
  });

  it("shows a generic toast when a dialog save fails with a non-Error", async () => {
    vi.mocked(updateReservation).mockRejectedValueOnce("oops");
    const user = userEvent.setup();
    render(<ReservationRow reservation={populatedReservation} type={ReservationType.Lodging} isLast={false} />);

    await user.click(screen.getByRole("button", { name: "Check-in · JFK Airport" }));
    await user.click(screen.getByRole("button", { name: "dialog-save" }));

    await vi.waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Failed to save."));
  });

  it("updates notes after a successful inline edit", async () => {
    const user = userEvent.setup();
    render(<ReservationRow reservation={populatedReservation} type={ReservationType.Lodging} isLast={false} />);

    await user.click(screen.getByRole("button", { name: "Late checkout requested" }));
    const notesInput = screen.getByRole("textbox", { name: "Notes" });
    await user.clear(notesInput);
    await user.type(notesInput, "Updated notes");
    await user.tab();

    expect(updateReservation).toHaveBeenCalledWith("res-1", { notes: "Updated notes" });
    expect(await screen.findByRole("button", { name: "Updated notes" })).toBeInTheDocument();
  });

  it("opens the delete confirmation dialog when the delete button is clicked", async () => {
    const user = userEvent.setup();
    render(<ReservationRow reservation={populatedReservation} type={ReservationType.Lodging} isLast={false} />);

    await user.click(screen.getByRole("button", { name: "Delete Grand Hotel" }));

    expect(screen.getByText(/Delete\s+Grand Hotel\?/)).toBeInTheDocument();
  });

  it("closes the dialog without calling deleteReservation when dismissed", async () => {
    const user = userEvent.setup();
    render(<ReservationRow reservation={populatedReservation} type={ReservationType.Lodging} isLast={false} />);

    await user.click(screen.getByRole("button", { name: "Delete Grand Hotel" }));
    expect(screen.getByText(/Delete\s+Grand Hotel\?/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "dismiss-dialog" }));

    expect(screen.queryByText(/Delete\s+Grand Hotel\?/)).not.toBeInTheDocument();
    expect(deleteReservation).not.toHaveBeenCalled();
  });

  it("calls deleteReservation with the reservation id when confirmed", async () => {
    vi.mocked(deleteReservation).mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(<ReservationRow reservation={populatedReservation} type={ReservationType.Lodging} isLast={false} />);

    await user.click(screen.getByRole("button", { name: "Delete Grand Hotel" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(deleteReservation).toHaveBeenCalledWith("res-1");
  });

  it("closes the dialog after a successful delete", async () => {
    vi.mocked(deleteReservation).mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(<ReservationRow reservation={populatedReservation} type={ReservationType.Lodging} isLast={false} />);

    await user.click(screen.getByRole("button", { name: "Delete Grand Hotel" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await vi.waitFor(() => {
      expect(screen.queryByText(/Delete\s+Grand Hotel\?/)).not.toBeInTheDocument();
    });
  });

  it("shows a toast error and keeps the dialog open when deleteReservation throws", async () => {
    vi.mocked(deleteReservation).mockRejectedValueOnce(new Error("Network error"));
    const user = userEvent.setup();
    render(<ReservationRow reservation={populatedReservation} type={ReservationType.Lodging} isLast={false} />);

    await user.click(screen.getByRole("button", { name: "Delete Grand Hotel" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await vi.waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Network error"));
    expect(screen.getByText(/Delete\s+Grand Hotel\?/)).toBeInTheDocument();
  });
});
