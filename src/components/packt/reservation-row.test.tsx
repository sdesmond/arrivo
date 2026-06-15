import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReservationRow } from "./reservation-row";
import { updateReservation } from "@/app/(app)/trips/[tripId]/reservations/actions";
import { ReservationType, type Reservation } from "@/data/types";
import { formatAnchorDateTime } from "./reservation-type-badge";

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

vi.mock("@/app/(app)/trips/[tripId]/reservations/actions", () => ({
  updateReservation: vi.fn(),
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

const populatedReservation: Reservation = {
  id: "res-1",
  tripId: "trip-1",
  type: ReservationType.Lodging,
  provider: "Grand Hotel",
  startAt: "2026-08-01T15:00:00.000Z",
  endAt: "2026-08-05T11:00:00.000Z",
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
  });

  it("renders all fields with values for a populated reservation", () => {
    render(<ReservationRow reservation={populatedReservation} type={ReservationType.Lodging} isLast={false} />);

    const provider = screen.getByRole("button", { name: "Grand Hotel" });
    expect(provider).toBeInTheDocument();
    expect(provider).toHaveStyle({ fontWeight: 600 });

    expect(
      screen.getByRole("button", { name: `Check-in: ${formatAnchorDateTime(populatedReservation.startAt!)}` })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: `Check-out: ${formatAnchorDateTime(populatedReservation.endAt!)}` })
    ).toBeInTheDocument();

    expect(screen.getByText("ABC123")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Late checkout requested" })).toBeInTheDocument();
  });

  it("renders placeholders for a mostly-empty reservation with the generic 'Other' anchor labels", () => {
    render(<ReservationRow reservation={emptyReservation} type={ReservationType.Other} isLast />);

    expect(screen.getByRole("button", { name: "Misc Booking" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add start" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add end" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add confirmation code" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add notes" })).toBeInTheDocument();
  });

  it("renders a confirmation-code chip with the wallet icon when present", () => {
    render(<ReservationRow reservation={populatedReservation} type={ReservationType.Lodging} isLast={false} />);

    const chip = screen.getByText("ABC123").closest("span");
    expect(chip).toBeInTheDocument();
    expect(chip?.querySelector("svg")).toBeInTheDocument();
  });

  it("updates only the provider's displayed value after a successful edit, leaving other fields unchanged", async () => {
    vi.mocked(updateReservation).mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(<ReservationRow reservation={populatedReservation} type={ReservationType.Lodging} isLast={false} />);

    await user.click(screen.getByRole("button", { name: "Grand Hotel" }));
    const input = screen.getByRole("textbox", { name: "Provider" });
    await user.clear(input);
    await user.type(input, "New Hotel Name");
    await user.keyboard("{Enter}");

    expect(updateReservation).toHaveBeenCalledWith("res-1", { provider: "New Hotel Name" });
    expect(await screen.findByRole("button", { name: "New Hotel Name" })).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: `Check-in: ${formatAnchorDateTime(populatedReservation.startAt!)}` })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: `Check-out: ${formatAnchorDateTime(populatedReservation.endAt!)}` })
    ).toBeInTheDocument();
    expect(screen.getByText("ABC123")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Late checkout requested" })).toBeInTheDocument();
  });

  it("trims surrounding whitespace from the provider's displayed value after a successful edit", async () => {
    vi.mocked(updateReservation).mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(<ReservationRow reservation={populatedReservation} type={ReservationType.Lodging} isLast={false} />);

    await user.click(screen.getByRole("button", { name: "Grand Hotel" }));
    const input = screen.getByRole("textbox", { name: "Provider" });
    await user.clear(input);
    await user.type(input, "  Trimmed Hotel  ");
    await user.keyboard("{Enter}");

    expect(updateReservation).toHaveBeenCalledWith("res-1", { provider: "  Trimmed Hotel  " });
    expect(await screen.findByRole("button", { name: "Trimmed Hotel" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "  Trimmed Hotel  " })).not.toBeInTheDocument();
  });

  it("updates the Check-in anchor after a successful edit", async () => {
    vi.mocked(updateReservation).mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(<ReservationRow reservation={populatedReservation} type={ReservationType.Lodging} isLast={false} />);

    await user.click(
      screen.getByRole("button", { name: `Check-in: ${formatAnchorDateTime(populatedReservation.startAt!)}` })
    );
    const timeInput = screen.getByLabelText("Check-in time");
    await user.clear(timeInput);
    await user.type(timeInput, "10:00");
    await user.click(screen.getByRole("button", { name: "Save Check-in" }));

    expect(updateReservation).toHaveBeenCalledWith("res-1", { startAt: "2026-08-01T10:00:00.000Z" });
    expect(
      await screen.findByRole("button", { name: `Check-in: ${formatAnchorDateTime("2026-08-01T10:00:00.000Z")}` })
    ).toBeInTheDocument();
  });

  it("updates the confirmation code and notes after successful edits", async () => {
    vi.mocked(updateReservation).mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ReservationRow reservation={populatedReservation} type={ReservationType.Lodging} isLast={false} />);

    await user.click(screen.getByText("ABC123"));
    const codeInput = screen.getByRole("textbox", { name: "Confirmation code" });
    await user.clear(codeInput);
    await user.type(codeInput, "XYZ987");
    await user.keyboard("{Enter}");

    expect(updateReservation).toHaveBeenCalledWith("res-1", { confirmationCode: "XYZ987" });
    expect(await screen.findByText("XYZ987")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Late checkout requested" }));
    const notesInput = screen.getByRole("textbox", { name: "Notes" });
    await user.clear(notesInput);
    await user.type(notesInput, "Updated notes");
    await user.tab();

    expect(updateReservation).toHaveBeenCalledWith("res-1", { notes: "Updated notes" });
    expect(await screen.findByRole("button", { name: "Updated notes" })).toBeInTheDocument();
  });
});
