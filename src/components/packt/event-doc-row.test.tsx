import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Document } from "@/data/types";

vi.mock("@/app/(app)/trips/[tripId]/actions", () => ({
  removeDocument: vi.fn().mockResolvedValue(undefined),
  renameDocument: vi.fn().mockResolvedValue(undefined),
  promoteEventDocToTrip: vi.fn().mockResolvedValue(undefined),
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

import { EventDocRow } from "./event-doc-row";
import { removeDocument, renameDocument, promoteEventDocToTrip } from "@/app/(app)/trips/[tripId]/actions";
import { shareDoc } from "@/lib/utils";

const makeDoc = (overrides: Partial<Document> = {}): Document => ({
  id: "doc-1",
  name: "Boarding Pass.pdf",
  kind: "pdf",
  scope: "event",
  ...overrides,
});

describe("EventDocRow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Rendering ─────────────────────────────────────────────────────────────

  it("renders the document name", () => {
    render(<EventDocRow doc={makeDoc()} />);
    expect(screen.getByText("Boarding Pass.pdf")).toBeInTheDocument();
  });

  it("renders PDF badge for pdf kind", () => {
    render(<EventDocRow doc={makeDoc({ kind: "pdf" })} />);
    expect(screen.getByText("PDF")).toBeInTheDocument();
  });

  it("renders IMG badge for image kind", () => {
    render(<EventDocRow doc={makeDoc({ kind: "image", name: "photo.jpg" })} />);
    expect(screen.getByText("IMG")).toBeInTheDocument();
  });

  it("renders DOC badge for doc kind", () => {
    render(<EventDocRow doc={makeDoc({ kind: "doc", name: "contract.docx" })} />);
    expect(screen.getByText("DOC")).toBeInTheDocument();
  });

  it("renders view button with correct title and aria-label", () => {
    render(<EventDocRow doc={makeDoc()} />);
    const btn = screen.getByRole("button", { name: "View Boarding Pass.pdf" });
    expect(btn).toHaveAttribute("title", "View Boarding Pass.pdf");
    expect(btn).toHaveAttribute("aria-label", "View Boarding Pass.pdf");
  });

  it("renders share button with correct title and aria-label", () => {
    render(<EventDocRow doc={makeDoc()} />);
    const btn = screen.getByRole("button", { name: "Share Boarding Pass.pdf" });
    expect(btn).toHaveAttribute("title", "Share Boarding Pass.pdf");
    expect(btn).toHaveAttribute("aria-label", "Share Boarding Pass.pdf");
  });

  it("renders promote button with correct title and aria-label", () => {
    render(<EventDocRow doc={makeDoc()} />);
    const btn = screen.getByRole("button", { name: "Move Boarding Pass.pdf to trip" });
    expect(btn).toHaveAttribute("title", "Move Boarding Pass.pdf to trip");
    expect(btn).toHaveAttribute("aria-label", "Move Boarding Pass.pdf to trip");
  });

  it("renders delete button with correct title and aria-label", () => {
    render(<EventDocRow doc={makeDoc()} />);
    const btn = screen.getByRole("button", { name: "Delete Boarding Pass.pdf" });
    expect(btn).toHaveAttribute("title", "Delete Boarding Pass.pdf");
    expect(btn).toHaveAttribute("aria-label", "Delete Boarding Pass.pdf");
  });

  it("compact icon buttons have 28px min dimensions", () => {
    render(<EventDocRow doc={makeDoc()} />);
    const viewBtn = screen.getByRole("button", { name: "View Boarding Pass.pdf" });
    expect(viewBtn).toHaveStyle({ minWidth: "28px", minHeight: "28px" });
    const deleteBtn = screen.getByRole("button", { name: "Delete Boarding Pass.pdf" });
    expect(deleteBtn).toHaveStyle({ minWidth: "28px", minHeight: "28px" });
  });

  // ── Rename ────────────────────────────────────────────────────────────────

  it("clicking the name enters edit mode with input pre-filled", async () => {
    const user = userEvent.setup();
    render(<EventDocRow doc={makeDoc()} />);
    await user.click(screen.getByText("Boarding Pass.pdf"));
    const input = screen.getByRole("textbox");
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue("Boarding Pass.pdf");
  });

  it("rename input has underline border using var(--accent-brand)", async () => {
    const user = userEvent.setup();
    render(<EventDocRow doc={makeDoc()} />);
    await user.click(screen.getByText("Boarding Pass.pdf"));
    expect(screen.getByRole("textbox")).toHaveAttribute("style", expect.stringContaining("var(--accent-brand)"));
  });

  it("pressing Enter calls renameDocument with trimmed new name", async () => {
    const user = userEvent.setup();
    render(<EventDocRow doc={makeDoc({ id: "doc-1", name: "Boarding Pass.pdf" })} />);
    await user.click(screen.getByText("Boarding Pass.pdf"));
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "New Name");
    await user.keyboard("{Enter}");
    expect(renameDocument).toHaveBeenCalledWith("doc-1", "New Name");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("blurring the input calls renameDocument", async () => {
    const user = userEvent.setup();
    render(<EventDocRow doc={makeDoc({ id: "doc-1", name: "Boarding Pass.pdf" })} />);
    await user.click(screen.getByText("Boarding Pass.pdf"));
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "Renamed");
    await user.tab();
    expect(renameDocument).toHaveBeenCalledWith("doc-1", "Renamed");
  });

  it("pressing Escape cancels rename without calling renameDocument", async () => {
    const user = userEvent.setup();
    render(<EventDocRow doc={makeDoc({ id: "doc-1", name: "Boarding Pass.pdf" })} />);
    await user.click(screen.getByText("Boarding Pass.pdf"));
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "Cancelled name");
    await user.keyboard("{Escape}");
    expect(renameDocument).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("does not call renameDocument when input is cleared to empty", async () => {
    const user = userEvent.setup();
    render(<EventDocRow doc={makeDoc({ id: "doc-1" })} />);
    await user.click(screen.getByText("Boarding Pass.pdf"));
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.keyboard("{Enter}");
    expect(renameDocument).not.toHaveBeenCalled();
  });

  it("does not call renameDocument when name is unchanged", async () => {
    const user = userEvent.setup();
    render(<EventDocRow doc={makeDoc({ id: "doc-1", name: "Boarding Pass.pdf" })} />);
    await user.click(screen.getByText("Boarding Pass.pdf"));
    await user.keyboard("{Enter}");
    expect(renameDocument).not.toHaveBeenCalled();
  });

  // ── View ──────────────────────────────────────────────────────────────────

  it("clicking the view button opens the DocViewer", async () => {
    const user = userEvent.setup();
    render(<EventDocRow doc={makeDoc()} />);
    expect(screen.queryByTestId("doc-viewer")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "View Boarding Pass.pdf" }));
    expect(screen.getByTestId("doc-viewer")).toBeInTheDocument();
  });

  it("closing the DocViewer hides it", async () => {
    const user = userEvent.setup();
    render(<EventDocRow doc={makeDoc()} />);
    await user.click(screen.getByRole("button", { name: "View Boarding Pass.pdf" }));
    expect(screen.getByTestId("doc-viewer")).toBeInTheDocument();
    await user.click(screen.getByTestId("doc-viewer-close"));
    expect(screen.queryByTestId("doc-viewer")).not.toBeInTheDocument();
  });

  // ── Share ─────────────────────────────────────────────────────────────────

  it("clicking share button calls shareDoc with the doc", async () => {
    const user = userEvent.setup();
    render(
      <EventDocRow doc={makeDoc({ id: "doc-1", name: "Boarding Pass.pdf", url: "https://example.com/doc.pdf" })} />
    );
    await user.click(screen.getByRole("button", { name: "Share Boarding Pass.pdf" }));
    expect(shareDoc).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Boarding Pass.pdf", url: "https://example.com/doc.pdf" })
    );
  });

  // ── Promote ───────────────────────────────────────────────────────────────

  it("clicking the promote button calls promoteEventDocToTrip with doc id", async () => {
    const user = userEvent.setup();
    render(<EventDocRow doc={makeDoc({ id: "doc-42" })} />);
    await user.click(screen.getByRole("button", { name: "Move Boarding Pass.pdf to trip" }));
    expect(promoteEventDocToTrip).toHaveBeenCalledWith("doc-42");
  });

  it("double-click on promote button does not call promoteEventDocToTrip twice", async () => {
    let resolveCall: (() => void) | undefined;
    vi.mocked(promoteEventDocToTrip).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveCall = () => resolve();
        })
    );
    const user = userEvent.setup();
    render(<EventDocRow doc={makeDoc({ id: "doc-99" })} />);
    const promoteBtn = screen.getByRole("button", { name: "Move Boarding Pass.pdf to trip" });
    await user.click(promoteBtn);
    await user.click(promoteBtn);
    expect(promoteEventDocToTrip).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveCall?.();
    });
  });

  it("silently recovers when promoteEventDocToTrip rejects", async () => {
    vi.mocked(promoteEventDocToTrip).mockRejectedValueOnce(new Error("network error"));
    const user = userEvent.setup();
    render(<EventDocRow doc={makeDoc({ id: "doc-err" })} />);
    await user.click(screen.getByRole("button", { name: "Move Boarding Pass.pdf to trip" }));
    expect(promoteEventDocToTrip).toHaveBeenCalledWith("doc-err");
    // Component stays mounted with no unhandled error
    expect(screen.getByRole("button", { name: "Move Boarding Pass.pdf to trip" })).toBeInTheDocument();
  });

  // ── Delete ────────────────────────────────────────────────────────────────

  it("does not open the confirm dialog on initial render", () => {
    render(<EventDocRow doc={makeDoc()} />);
    expect(screen.queryByText("This cannot be undone.")).not.toBeInTheDocument();
  });

  it("opens the confirm dialog when the delete button is clicked", async () => {
    const user = userEvent.setup();
    render(<EventDocRow doc={makeDoc()} />);
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete Boarding Pass.pdf" }));
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("does not call removeDocument when only the trash icon is clicked", async () => {
    const user = userEvent.setup();
    render(<EventDocRow doc={makeDoc()} />);
    await user.click(screen.getByRole("button", { name: "Delete Boarding Pass.pdf" }));
    expect(removeDocument).not.toHaveBeenCalled();
  });

  it("calls removeDocument with doc id after the dialog Delete button is clicked", async () => {
    const user = userEvent.setup();
    render(<EventDocRow doc={makeDoc({ id: "doc-42" })} />);
    await user.click(screen.getByRole("button", { name: "Delete Boarding Pass.pdf" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(removeDocument).toHaveBeenCalledWith("doc-42");
  });

  it("does not call removeDocument when Cancel is clicked", async () => {
    const user = userEvent.setup();
    render(<EventDocRow doc={makeDoc()} />);
    await user.click(screen.getByRole("button", { name: "Delete Boarding Pass.pdf" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(removeDocument).not.toHaveBeenCalled();
  });

  it("shows an error message when removeDocument rejects", async () => {
    vi.mocked(removeDocument).mockRejectedValueOnce(new Error("boom"));
    const user = userEvent.setup();
    render(<EventDocRow doc={makeDoc()} />);
    await user.click(screen.getByRole("button", { name: "Delete Boarding Pass.pdf" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't delete. Try again.");
  });

  it("guards against rapid double-click submitting delete twice", async () => {
    let resolveCall: (() => void) | undefined;
    vi.mocked(removeDocument).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveCall = () => resolve();
        })
    );
    const user = userEvent.setup();
    render(<EventDocRow doc={makeDoc({ id: "doc-99" })} />);
    await user.click(screen.getByRole("button", { name: "Delete Boarding Pass.pdf" }));
    const confirm = screen.getByRole("button", { name: "Delete" });
    await user.click(confirm);
    await user.click(confirm);
    expect(removeDocument).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveCall?.();
    });
  });
});
