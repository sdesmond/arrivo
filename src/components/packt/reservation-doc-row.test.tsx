import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Document } from "@/data/types";

vi.mock("@/app/(app)/trips/[tripId]/reservations/reservation-document-actions", () => ({
  removeReservationDocument: vi.fn().mockResolvedValue(undefined),
  renameReservationDocument: vi.fn().mockResolvedValue(undefined),
  promoteReservationDocToTrip: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ render }: { render?: React.ReactElement }) => render ?? null,
  TooltipContent: () => null,
}));

vi.mock("./doc-viewer", () => ({
  DocViewer: ({ open, doc, onClose }: { open: boolean; doc: { name: string }; onClose: () => void }) =>
    open ? (
      <div data-testid="doc-viewer">
        {doc.name}
        <button data-testid="doc-viewer-close" onClick={onClose}>
          close
        </button>
      </div>
    ) : null,
}));

vi.mock("@/lib/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/utils")>();
  return {
    ...actual,
    shareDoc: vi.fn().mockResolvedValue(undefined),
  };
});

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
  DialogDescription: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { ReservationDocRow } from "./reservation-doc-row";
import {
  removeReservationDocument,
  renameReservationDocument,
  promoteReservationDocToTrip,
} from "@/app/(app)/trips/[tripId]/reservations/reservation-document-actions";
import { shareDoc } from "@/lib/utils";

const makeDoc = (overrides: Partial<Document> = {}): Document => ({
  id: "doc-1",
  name: "Confirmation.pdf",
  kind: "pdf",
  scope: "reservation",
  ...overrides,
});

describe("ReservationDocRow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the document name", () => {
    render(<ReservationDocRow doc={makeDoc()} />);
    expect(screen.getByText("Confirmation.pdf")).toBeInTheDocument();
  });

  it("renders view, share, promote, and delete buttons", () => {
    render(<ReservationDocRow doc={makeDoc()} />);
    expect(screen.getByRole("button", { name: "View Confirmation.pdf" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Share Confirmation.pdf" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move Confirmation.pdf to trip" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete Confirmation.pdf" })).toBeInTheDocument();
  });

  it("clicking the name enters edit mode with input pre-filled", async () => {
    const user = userEvent.setup();
    render(<ReservationDocRow doc={makeDoc()} />);
    await user.click(screen.getByText("Confirmation.pdf"));
    const input = screen.getByRole("textbox");
    expect(input).toHaveValue("Confirmation.pdf");
  });

  it("pressing Enter calls renameReservationDocument with trimmed new name", async () => {
    const user = userEvent.setup();
    render(<ReservationDocRow doc={makeDoc({ id: "doc-1", name: "Confirmation.pdf" })} />);
    await user.click(screen.getByText("Confirmation.pdf"));
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "New Name");
    await user.keyboard("{Enter}");
    expect(renameReservationDocument).toHaveBeenCalledWith("doc-1", "New Name");
  });

  it("pressing Escape cancels rename without calling renameReservationDocument", async () => {
    const user = userEvent.setup();
    render(<ReservationDocRow doc={makeDoc()} />);
    await user.click(screen.getByText("Confirmation.pdf"));
    const input = screen.getByRole("textbox");
    await user.type(input, "Cancelled");
    await user.keyboard("{Escape}");
    expect(renameReservationDocument).not.toHaveBeenCalled();
  });

  it("clicking the view button opens the DocViewer", async () => {
    const user = userEvent.setup();
    render(<ReservationDocRow doc={makeDoc()} />);
    await user.click(screen.getByRole("button", { name: "View Confirmation.pdf" }));
    expect(screen.getByTestId("doc-viewer")).toBeInTheDocument();
  });

  it("closing the DocViewer hides it", async () => {
    const user = userEvent.setup();
    render(<ReservationDocRow doc={makeDoc()} />);
    await user.click(screen.getByRole("button", { name: "View Confirmation.pdf" }));
    expect(screen.getByTestId("doc-viewer")).toBeInTheDocument();
    await user.click(screen.getByTestId("doc-viewer-close"));
    expect(screen.queryByTestId("doc-viewer")).not.toBeInTheDocument();
  });

  it("clicking share button calls shareDoc with the doc", async () => {
    const user = userEvent.setup();
    render(<ReservationDocRow doc={makeDoc({ url: "https://example.com/doc.pdf" })} />);
    await user.click(screen.getByRole("button", { name: "Share Confirmation.pdf" }));
    expect(shareDoc).toHaveBeenCalledWith(expect.objectContaining({ url: "https://example.com/doc.pdf" }));
  });

  it("clicking the promote button calls promoteReservationDocToTrip with doc id", async () => {
    const user = userEvent.setup();
    render(<ReservationDocRow doc={makeDoc({ id: "doc-42" })} />);
    await user.click(screen.getByRole("button", { name: "Move Confirmation.pdf to trip" }));
    expect(promoteReservationDocToTrip).toHaveBeenCalledWith("doc-42");
  });

  it("double-click on promote button does not call promoteReservationDocToTrip twice", async () => {
    let resolveCall: (() => void) | undefined;
    vi.mocked(promoteReservationDocToTrip).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveCall = () => resolve();
        })
    );
    const user = userEvent.setup();
    render(<ReservationDocRow doc={makeDoc({ id: "doc-99" })} />);
    const promoteBtn = screen.getByRole("button", { name: "Move Confirmation.pdf to trip" });
    await user.click(promoteBtn);
    await user.click(promoteBtn);
    expect(promoteReservationDocToTrip).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveCall?.();
    });
  });

  it("silently recovers when promoteReservationDocToTrip rejects", async () => {
    vi.mocked(promoteReservationDocToTrip).mockRejectedValueOnce(new Error("network error"));
    const user = userEvent.setup();
    render(<ReservationDocRow doc={makeDoc({ id: "doc-err" })} />);
    await user.click(screen.getByRole("button", { name: "Move Confirmation.pdf to trip" }));
    expect(promoteReservationDocToTrip).toHaveBeenCalledWith("doc-err");
    expect(screen.getByRole("button", { name: "Move Confirmation.pdf to trip" })).toBeInTheDocument();
  });

  it("opens the confirm dialog when the delete button is clicked", async () => {
    const user = userEvent.setup();
    render(<ReservationDocRow doc={makeDoc()} />);
    await user.click(screen.getByRole("button", { name: "Delete Confirmation.pdf" }));
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("calls removeReservationDocument with doc id after the dialog Delete button is clicked", async () => {
    const user = userEvent.setup();
    render(<ReservationDocRow doc={makeDoc({ id: "doc-42" })} />);
    await user.click(screen.getByRole("button", { name: "Delete Confirmation.pdf" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(removeReservationDocument).toHaveBeenCalledWith("doc-42");
  });

  it("does not call removeReservationDocument when Cancel is clicked", async () => {
    const user = userEvent.setup();
    render(<ReservationDocRow doc={makeDoc()} />);
    await user.click(screen.getByRole("button", { name: "Delete Confirmation.pdf" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(removeReservationDocument).not.toHaveBeenCalled();
  });

  it("shows an error message when removeReservationDocument rejects", async () => {
    vi.mocked(removeReservationDocument).mockRejectedValueOnce(new Error("boom"));
    const user = userEvent.setup();
    render(<ReservationDocRow doc={makeDoc()} />);
    await user.click(screen.getByRole("button", { name: "Delete Confirmation.pdf" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't delete. Try again.");
  });
});
