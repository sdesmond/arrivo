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
});
