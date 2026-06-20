import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({
    children,
    open,
    onOpenChange,
  }: {
    children: React.ReactNode;
    open: boolean;
    onOpenChange?: (o: boolean) => void;
  }) =>
    open ? (
      <>
        {children}
        <button data-testid="dialog-backdrop-close" onClick={() => onOpenChange?.(false)} />
      </>
    ) : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/app/(app)/trips/[tripId]/reservations/reservation-document-actions", () => ({
  attachTripDocToReservation: vi.fn().mockResolvedValue(undefined),
  uploadReservationDocument: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { AddReservationDocDialog } from "./add-reservation-doc-dialog";
import {
  attachTripDocToReservation,
  uploadReservationDocument,
} from "@/app/(app)/trips/[tripId]/reservations/reservation-document-actions";

const makeDoc = (overrides: Record<string, unknown> = {}) => ({
  id: "doc-1",
  name: "Itinerary.pdf",
  kind: "pdf" as const,
  scope: "trip" as const,
  offline: false,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("pick mode", () => {
  it("shows pick list when tripDocs are provided", () => {
    render(<AddReservationDocDialog open reservationId="res-1" onOpenChange={vi.fn()} tripDocs={[makeDoc()]} />);
    expect(screen.getByText("Itinerary.pdf")).toBeInTheDocument();
  });

  it("clicking a doc in pick list calls attachTripDocToReservation and closes", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <AddReservationDocDialog
        open
        reservationId="res-1"
        onOpenChange={onOpenChange}
        tripDocs={[makeDoc({ id: "doc-1", name: "Itinerary.pdf" })]}
      />
    );
    await user.click(screen.getByText("Itinerary.pdf"));
    await waitFor(() => {
      expect(attachTripDocToReservation).toHaveBeenCalledWith("doc-1", "res-1");
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("attach failure shows a toast and keeps the dialog open", async () => {
    const { toast } = await import("sonner");
    vi.mocked(attachTripDocToReservation).mockRejectedValueOnce(new Error("Reservation not found"));
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <AddReservationDocDialog
        open
        reservationId="res-1"
        onOpenChange={onOpenChange}
        tripDocs={[makeDoc({ id: "doc-1", name: "Itinerary.pdf" })]}
      />
    );

    await user.click(screen.getByText("Itinerary.pdf"));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed to attach document. Please try again.");
    });
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("Upload new instead switches to upload mode", async () => {
    const user = userEvent.setup();
    render(<AddReservationDocDialog open reservationId="res-1" onOpenChange={vi.fn()} tripDocs={[makeDoc()]} />);
    await user.click(screen.getByRole("button", { name: /upload new instead/i }));
    expect(screen.getByRole("button", { name: /attach/i })).toBeInTheDocument();
  });
});

describe("upload mode", () => {
  it("opens directly in upload mode when no tripDocs provided", () => {
    render(<AddReservationDocDialog open reservationId="res-1" onOpenChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /attach/i })).toBeInTheDocument();
  });

  it("Attach button disabled when no file selected", () => {
    render(<AddReservationDocDialog open reservationId="res-1" onOpenChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /attach/i })).toBeDisabled();
  });

  it("shows providerName as subtitle when provided", () => {
    render(<AddReservationDocDialog open reservationId="res-1" providerName="Grand Hotel" onOpenChange={vi.fn()} />);
    expect(screen.getByText("Grand Hotel")).toBeInTheDocument();
  });

  it("file too large shows toast error", async () => {
    const { toast } = await import("sonner");
    const user = userEvent.setup();
    render(<AddReservationDocDialog open reservationId="res-1" onOpenChange={vi.fn()} />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const largeFile = new File([new ArrayBuffer(26 * 1024 * 1024)], "big.pdf", { type: "application/pdf" });
    await user.upload(fileInput, largeFile);
    expect(toast.error).toHaveBeenCalledWith("File is too large. Max 25.0 MB.");
  });

  it("unsupported file type shows toast error and keeps Attach disabled", async () => {
    const { toast } = await import("sonner");
    render(<AddReservationDocDialog open reservationId="res-1" onOpenChange={vi.fn()} />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const unsupportedFile = new File(["content"], "notes.docx", { type: "application/msword" });
    fireEvent.change(fileInput, { target: { files: [unsupportedFile] } });

    expect(toast.error).toHaveBeenCalledWith("Unsupported file type. Choose PDF, JPG, PNG, WEBP, or HEIC.");
    expect(screen.getByRole("button", { name: /attach/i })).toBeDisabled();
  });

  it("clicking Attach with a file calls uploadReservationDocument and closes", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<AddReservationDocDialog open reservationId="res-1" onOpenChange={onOpenChange} />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const validFile = new File(["content"], "confirmation.pdf", { type: "application/pdf" });
    await user.upload(fileInput, validFile);
    await user.click(screen.getByRole("button", { name: /attach/i }));
    await waitFor(() => {
      expect(uploadReservationDocument).toHaveBeenCalledWith("res-1", expect.any(FormData));
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("upload failure shows toast error", async () => {
    const { toast } = await import("sonner");
    vi.mocked(uploadReservationDocument).mockRejectedValueOnce(new Error("Network error"));
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<AddReservationDocDialog open reservationId="res-1" onOpenChange={onOpenChange} />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const validFile = new File(["content"], "confirmation.pdf", { type: "application/pdf" });
    await user.upload(fileInput, validFile);
    await user.click(screen.getByRole("button", { name: /attach/i }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Network error");
    });
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
