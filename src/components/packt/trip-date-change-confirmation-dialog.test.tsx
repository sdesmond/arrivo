import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({
    children,
    open,
    onOpenChange,
  }: {
    children: React.ReactNode;
    open: boolean;
    onOpenChange?: (v: boolean) => void;
  }) =>
    open ? (
      <>
        {children}
        <button data-testid="alert-dialog-cancel" onClick={() => onOpenChange?.(false)} />
      </>
    ) : null,
  AlertDialogAction: ({
    children,
    disabled,
    onClick,
    variant,
    className,
  }: React.PropsWithChildren<{
    disabled?: boolean;
    onClick?: () => void;
    variant?: string;
    className?: string;
  }>) => (
    <button disabled={disabled} onClick={onClick} data-variant={variant} className={className}>
      {children}
    </button>
  ),
  AlertDialogCancel: ({
    children,
    disabled,
    onClick,
    variant,
  }: React.PropsWithChildren<{
    disabled?: boolean;
    onClick?: () => void;
    variant?: string;
  }>) => (
    <button disabled={disabled} onClick={onClick} data-variant={variant}>
      {children}
    </button>
  ),
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

import { TripDateChangeConfirmationDialog } from "./trip-date-change-confirmation-dialog";
import { TripDateConflictResolution } from "@/data/types";

const defaultConfirmation = {
  removedDates: ["2026-06-03", "2026-06-04"],
  removedDayLabels: undefined,
  events: [],
  noteCount: 0,
  checklistCount: 0,
  eventDocumentCount: 0,
};

const defaultProps = {
  dateChangeConfirmation: defaultConfirmation,
  dateFormat: "MM/DD/YYYY" as string,
  onResolveDateChange: vi.fn(),
  onCancelDateChange: vi.fn(),
};

describe("TripDateChangeConfirmationDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render when dateChangeConfirmation is null", () => {
    render(<TripDateChangeConfirmationDialog dateChangeConfirmation={null} dateFormat="MM/DD/YYYY" />);
    expect(screen.queryByText("Confirm Date Change")).not.toBeInTheDocument();
  });

  it("renders title and description when confirmation is provided", () => {
    render(<TripDateChangeConfirmationDialog {...defaultProps} />);
    expect(screen.getByText("Confirm Date Change")).toBeInTheDocument();
    expect(screen.getByText(/Jun 3, 2026 - Jun 4, 2026/)).toBeInTheDocument();
  });

  it("calls onResolveDateChange with DeleteEvents when Remove Events is clicked", async () => {
    const user = userEvent.setup();
    const onResolveDateChange = vi.fn();
    render(<TripDateChangeConfirmationDialog {...defaultProps} onResolveDateChange={onResolveDateChange} />);
    await user.click(screen.getByRole("button", { name: /remove events/i }));
    expect(onResolveDateChange).toHaveBeenCalledWith(TripDateConflictResolution.DeleteEvents);
  });

  it("calls onResolveDateChange with KeepAsUnscheduled when Keep Events is clicked", async () => {
    const user = userEvent.setup();
    const onResolveDateChange = vi.fn();
    render(<TripDateChangeConfirmationDialog {...defaultProps} onResolveDateChange={onResolveDateChange} />);
    await user.click(screen.getByRole("button", { name: /keep events/i }));
    expect(onResolveDateChange).toHaveBeenCalledWith(TripDateConflictResolution.KeepAsUnscheduled);
  });

  it("calls onCancelDateChange when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onCancelDateChange = vi.fn();
    render(<TripDateChangeConfirmationDialog {...defaultProps} onCancelDateChange={onCancelDateChange} />);
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancelDateChange).toHaveBeenCalled();
  });

  it("calls onCancelDateChange when dialog is dismissed via backdrop", async () => {
    const user = userEvent.setup();
    const onCancelDateChange = vi.fn();
    render(<TripDateChangeConfirmationDialog {...defaultProps} onCancelDateChange={onCancelDateChange} />);
    await user.click(screen.getByTestId("alert-dialog-cancel"));
    expect(onCancelDateChange).toHaveBeenCalled();
  });

  it("disables buttons when saving is true", () => {
    render(<TripDateChangeConfirmationDialog {...defaultProps} saving />);
    expect(screen.getByRole("button", { name: /remove events/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeDisabled();
  });

  it("formats a single removed date", () => {
    render(
      <TripDateChangeConfirmationDialog
        {...defaultProps}
        dateChangeConfirmation={{ ...defaultConfirmation, removedDates: ["2026-06-03"] }}
      />
    );
    expect(screen.getByText(/Jun 3, 2026/)).toBeInTheDocument();
  });

  it("formats non-contiguous removed dates as comma-separated list", () => {
    render(
      <TripDateChangeConfirmationDialog
        {...defaultProps}
        dateChangeConfirmation={{ ...defaultConfirmation, removedDates: ["2026-06-03", "2026-06-10"] }}
      />
    );
    expect(screen.getByText(/Jun 3, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Jun 10, 2026/)).toBeInTheDocument();
  });

  it("formats empty removedDates as empty string", () => {
    render(
      <TripDateChangeConfirmationDialog
        {...defaultProps}
        dateChangeConfirmation={{ ...defaultConfirmation, removedDates: [] }}
      />
    );
    expect(screen.getByText(/your new trip dates will remove events/i)).toBeInTheDocument();
  });

  it("prefers removed day labels when the removed days are dateless", () => {
    render(
      <TripDateChangeConfirmationDialog
        {...defaultProps}
        dateChangeConfirmation={{ ...defaultConfirmation, removedDates: [], removedDayLabels: ["Day 3"] }}
      />
    );

    expect(screen.getByText(/Day 3/)).toBeInTheDocument();
    expect(screen.queryByText(/Jun 3, 2026/)).not.toBeInTheDocument();
  });

  it("formats contiguous removed day labels as a range", () => {
    render(
      <TripDateChangeConfirmationDialog
        {...defaultProps}
        dateChangeConfirmation={{
          ...defaultConfirmation,
          removedDates: [],
          removedDayLabels: ["Day 3", "Day 4", "Day 5"],
        }}
      />
    );

    expect(screen.getByText(/Day 3 - Day 5/)).toBeInTheDocument();
  });

  it("formats non-contiguous removed day labels as a comma-separated list", () => {
    render(
      <TripDateChangeConfirmationDialog
        {...defaultProps}
        dateChangeConfirmation={{
          ...defaultConfirmation,
          removedDates: [],
          removedDayLabels: ["Day 3", "Day 5"],
        }}
      />
    );

    expect(screen.getByText(/Day 3, Day 5/)).toBeInTheDocument();
  });

  it("lists affected reservations and explains keep vs remove", () => {
    render(
      <TripDateChangeConfirmationDialog
        {...defaultProps}
        dateChangeConfirmation={{
          ...defaultConfirmation,
          reservations: [
            { id: "res-1", provider: "Delta", type: "flight", date: "2026-06-03" },
            { id: "res-2", provider: "Hilton", type: "lodging", date: "2026-06-04" },
          ],
        }}
      />
    );

    expect(screen.getByText(/Delta/)).toBeInTheDocument();
    expect(screen.getByText(/Hilton/)).toBeInTheDocument();
    expect(screen.getByText(/stay in the Reservations tab/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove all/i })).toBeInTheDocument();
  });

  it("omits the reservations section when none are affected", () => {
    render(<TripDateChangeConfirmationDialog {...defaultProps} />);
    expect(screen.queryByText(/Reservations tab/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^remove events$/i })).toBeInTheDocument();
  });

  it("uses reservation-only wording when no events, notes or checklists are affected", () => {
    render(
      <TripDateChangeConfirmationDialog
        {...defaultProps}
        dateChangeConfirmation={{
          ...defaultConfirmation,
          reservations: [{ id: "res-1", provider: "Delta", type: "flight", date: "2026-06-03" }],
        }}
      />
    );

    expect(screen.queryByText(/move those events to unscheduled/i)).not.toBeInTheDocument();
    expect(screen.getByText(/your new trip dates will remove reservations/i)).toBeInTheDocument();
  });

  it("keeps the event wording when events are affected alongside reservations", () => {
    render(
      <TripDateChangeConfirmationDialog
        {...defaultProps}
        dateChangeConfirmation={{
          ...defaultConfirmation,
          events: [{ id: "event-1", name: "Dinner", displacedDate: "2026-06-03", docCount: 0 }],
          reservations: [{ id: "res-1", provider: "Delta", type: "flight", date: "2026-06-03" }],
        }}
      />
    );

    expect(screen.getByText(/move those events to unscheduled/i)).toBeInTheDocument();
  });

  it("shows a readable type label and falls back to it when the provider is blank", () => {
    render(
      <TripDateChangeConfirmationDialog
        {...defaultProps}
        dateChangeConfirmation={{
          ...defaultConfirmation,
          reservations: [
            { id: "res-1", provider: "Avis", type: "rental-car", date: "2026-06-03" },
            { id: "res-2", provider: "  ", type: "lodging", date: "2026-06-04" },
          ],
        }}
      />
    );

    expect(screen.getByText(/Avis \(Rental Car\)/)).toBeInTheDocument();
    expect(screen.getByText(/^Lodging — /)).toBeInTheDocument();
  });
});
