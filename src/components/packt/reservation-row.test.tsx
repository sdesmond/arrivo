import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { ReservationRow } from "./reservation-row";
import {
  updateReservation,
  deleteReservation,
  uploadReservationDocument,
  removeReservationDocument,
} from "@/app/(app)/trips/[tripId]/reservations/actions";
import { ReservationType, type Reservation } from "@/data/types";
import { formatAnchorDateTime } from "./reservation-type-badge";

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

vi.mock("@/app/(app)/trips/[tripId]/reservations/actions", () => ({
  updateReservation: vi.fn(),
  deleteReservation: vi.fn(),
  uploadReservationDocument: vi.fn(),
  removeReservationDocument: vi.fn(),
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

const populatedReservation: Reservation = {
  id: "res-1",
  tripId: "trip-1",
  type: ReservationType.Lodging,
  provider: "Grand Hotel",
  startAt: "2026-08-01T15:00:00.000Z",
  endAt: "2026-08-05T11:00:00.000Z",
  confirmationCode: "ABC123",
  notes: "Late checkout requested",
  documents: [],
};

const emptyReservation: Reservation = {
  id: "res-2",
  tripId: "trip-1",
  type: ReservationType.Other,
  provider: "Misc Booking",
};

const withDocReservation: Reservation = {
  ...populatedReservation,
  documents: [
    {
      id: "doc-1",
      name: "confirmation.pdf",
      kind: "pdf",
      size: "1 KB",
      scope: "reservation",
      offline: false,
      addedAt: "2026-08-01T00:00:00.000Z",
    },
  ],
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

  it("shows the 'Add confirmation document' dashed button when there are no documents", () => {
    render(<ReservationRow reservation={emptyReservation} type={ReservationType.Other} isLast />);

    expect(screen.getByRole("button", { name: "Add confirmation document" })).toBeInTheDocument();
  });

  it("renders attached documents with name and remove button", () => {
    render(<ReservationRow reservation={withDocReservation} type={ReservationType.Lodging} isLast={false} />);

    expect(screen.getByText("confirmation.pdf")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove confirmation.pdf" })).toBeInTheDocument();
  });

  it("does not show the dashed add button when documents exist", () => {
    render(<ReservationRow reservation={withDocReservation} type={ReservationType.Lodging} isLast={false} />);

    expect(screen.queryByRole("button", { name: "Add confirmation document" })).not.toBeInTheDocument();
  });

  it("shows the 'Add document' icon button when documents exist", () => {
    render(<ReservationRow reservation={withDocReservation} type={ReservationType.Lodging} isLast={false} />);

    expect(screen.getByRole("button", { name: "Add document" })).toBeInTheDocument();
  });

  it("calls uploadReservationDocument with the reservation id and formData on file change", async () => {
    vi.mocked(uploadReservationDocument).mockResolvedValueOnce(undefined);
    render(<ReservationRow reservation={emptyReservation} type={ReservationType.Other} isLast />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["content"], "test.pdf", { type: "application/pdf" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    input.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.waitFor(() => {
      expect(uploadReservationDocument).toHaveBeenCalledWith("res-2", expect.any(FormData));
    });
  });

  it("rejects a file larger than MAX_UPLOAD_BYTES with a toast error", async () => {
    render(<ReservationRow reservation={emptyReservation} type={ReservationType.Other} isLast />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const bigFile = new File(["x"], "big.pdf", { type: "application/pdf" });
    Object.defineProperty(bigFile, "size", { value: 30 * 1024 * 1024 });
    Object.defineProperty(input, "files", { value: [bigFile], configurable: true });
    input.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("File is too large. Max 25 MB.");
    });
    expect(uploadReservationDocument).not.toHaveBeenCalled();
  });

  it("calls removeReservationDocument with the doc id when remove is clicked", async () => {
    vi.mocked(removeReservationDocument).mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(<ReservationRow reservation={withDocReservation} type={ReservationType.Lodging} isLast={false} />);

    await user.click(screen.getByRole("button", { name: "Remove confirmation.pdf" }));

    await vi.waitFor(() => {
      expect(removeReservationDocument).toHaveBeenCalledWith("doc-1");
    });
  });

  it("shows a toast error when upload fails", async () => {
    vi.mocked(uploadReservationDocument).mockRejectedValueOnce(new Error("Server error"));
    render(<ReservationRow reservation={emptyReservation} type={ReservationType.Other} isLast />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["content"], "test.pdf", { type: "application/pdf" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    input.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Upload failed. Please try again.");
    });
  });

  it("shows a toast error when remove fails", async () => {
    vi.mocked(removeReservationDocument).mockRejectedValueOnce(new Error("Server error"));
    const user = userEvent.setup();
    render(<ReservationRow reservation={withDocReservation} type={ReservationType.Lodging} isLast={false} />);

    await user.click(screen.getByRole("button", { name: "Remove confirmation.pdf" }));

    await vi.waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Failed to remove document.");
    });
  });
});
