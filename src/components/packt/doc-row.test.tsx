// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Document } from "@/data/types";

vi.mock("@/app/(app)/trips/[tripId]/actions", () => ({
  removeDocument: vi.fn().mockResolvedValue(undefined),
  uploadDocument: vi.fn().mockResolvedValue(undefined),
  renameDocument: vi.fn().mockResolvedValue(undefined),
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

import { DocRow } from "./doc-row";
import { removeDocument, renameDocument } from "@/app/(app)/trips/[tripId]/actions";
import { shareDoc } from "@/lib/utils";

const makeDoc = (overrides: Partial<Document> = {}): Document => ({
  id: "doc-1",
  name: "Boarding Pass.pdf",
  kind: "pdf",
  scope: "trip",
  offline: false,
  ...overrides,
});

describe("DocRow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the document name", () => {
    render(<DocRow doc={makeDoc()} />);
    expect(screen.getByText("Boarding Pass.pdf")).toBeInTheDocument();
  });

  it("renders PDF badge for pdf kind", () => {
    render(<DocRow doc={makeDoc({ kind: "pdf" })} />);
    expect(screen.getByText("PDF")).toBeInTheDocument();
  });

  it("renders IMG badge for image kind", () => {
    render(<DocRow doc={makeDoc({ kind: "image", name: "photo.jpg" })} />);
    expect(screen.getByText("IMG")).toBeInTheDocument();
  });

  it("renders DOC badge for doc kind", () => {
    render(<DocRow doc={makeDoc({ kind: "doc", name: "contract.docx" })} />);
    expect(screen.getByText("DOC")).toBeInTheDocument();
  });

  it("renders document name for image doc", () => {
    render(<DocRow doc={makeDoc({ kind: "image", name: "vacation-photo.png" })} />);
    expect(screen.getByText("vacation-photo.png")).toBeInTheDocument();
  });

  it("renders a delete button with title and aria-label", () => {
    render(<DocRow doc={makeDoc()} />);
    const btn = screen.getByRole("button", { name: "Delete Boarding Pass.pdf" });
    expect(btn).toHaveAttribute("title", "Delete Boarding Pass.pdf");
    expect(btn).toHaveAttribute("aria-label", "Delete Boarding Pass.pdf");
  });

  it("delete button uses doc name in title/aria-label", () => {
    render(<DocRow doc={makeDoc({ name: "insurance.pdf" })} />);
    expect(screen.getByRole("button", { name: "Delete insurance.pdf" })).toBeInTheDocument();
  });

  it("delete button has min 44px touch target via minWidth/minHeight", () => {
    render(<DocRow doc={makeDoc()} />);
    const btn = screen.getByRole("button", { name: "Delete Boarding Pass.pdf" });
    expect(btn).toHaveStyle({ minWidth: "44px", minHeight: "44px" });
  });

  it("does not open the confirm dialog on initial render", () => {
    render(<DocRow doc={makeDoc()} />);
    expect(screen.queryByText("This cannot be undone.")).not.toBeInTheDocument();
  });

  it("opens the confirm dialog when the delete button is clicked", async () => {
    const user = userEvent.setup();
    render(<DocRow doc={makeDoc()} />);
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete Boarding Pass.pdf" }));
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("does not call removeDocument when only the trash icon is clicked", async () => {
    const user = userEvent.setup();
    render(<DocRow doc={makeDoc()} />);
    await user.click(screen.getByRole("button", { name: "Delete Boarding Pass.pdf" }));
    expect(removeDocument).not.toHaveBeenCalled();
  });

  it("calls removeDocument with doc id after the dialog Delete button is clicked", async () => {
    const user = userEvent.setup();
    render(<DocRow doc={makeDoc({ id: "doc-42" })} />);
    await user.click(screen.getByRole("button", { name: "Delete Boarding Pass.pdf" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(removeDocument).toHaveBeenCalledWith("doc-42");
  });

  it("does not call removeDocument when Cancel is clicked", async () => {
    const user = userEvent.setup();
    render(<DocRow doc={makeDoc()} />);
    await user.click(screen.getByRole("button", { name: "Delete Boarding Pass.pdf" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(removeDocument).not.toHaveBeenCalled();
  });

  it("shows an error message when removeDocument rejects", async () => {
    vi.mocked(removeDocument).mockRejectedValueOnce(new Error("boom"));
    const user = userEvent.setup();
    render(<DocRow doc={makeDoc()} />);
    await user.click(screen.getByRole("button", { name: "Delete Boarding Pass.pdf" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't delete. Try again.");
  });

  it("guards against rapid double-click submitting twice", async () => {
    let resolveCall: (() => void) | undefined;
    vi.mocked(removeDocument).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveCall = () => resolve();
        })
    );
    const user = userEvent.setup();
    render(<DocRow doc={makeDoc({ id: "doc-99" })} />);
    await user.click(screen.getByRole("button", { name: "Delete Boarding Pass.pdf" }));
    const confirm = screen.getByRole("button", { name: "Delete" });
    await user.click(confirm);
    await user.click(confirm);
    expect(removeDocument).toHaveBeenCalledTimes(1);
    resolveCall?.();
  });

  it("clicking the name enters edit mode with input pre-filled", async () => {
    const user = userEvent.setup();
    render(<DocRow doc={makeDoc()} />);
    await user.click(screen.getByText("Boarding Pass.pdf"));
    const input = screen.getByRole("textbox");
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue("Boarding Pass.pdf");
  });

  it("rename input has underline border using var(--accent-brand)", async () => {
    const user = userEvent.setup();
    render(<DocRow doc={makeDoc()} />);
    await user.click(screen.getByText("Boarding Pass.pdf"));
    expect(screen.getByRole("textbox")).toHaveAttribute("style", expect.stringContaining("var(--accent-brand)"));
  });

  it("pressing Enter calls renameDocument with trimmed new name", async () => {
    const user = userEvent.setup();
    render(<DocRow doc={makeDoc({ id: "doc-1", name: "Boarding Pass.pdf" })} />);
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
    render(<DocRow doc={makeDoc({ id: "doc-1", name: "Boarding Pass.pdf" })} />);
    await user.click(screen.getByText("Boarding Pass.pdf"));
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "Renamed");
    await user.tab();
    expect(renameDocument).toHaveBeenCalledWith("doc-1", "Renamed");
  });

  it("pressing Escape cancels rename without calling renameDocument", async () => {
    const user = userEvent.setup();
    render(<DocRow doc={makeDoc({ id: "doc-1", name: "Boarding Pass.pdf" })} />);
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
    render(<DocRow doc={makeDoc({ id: "doc-1" })} />);
    await user.click(screen.getByText("Boarding Pass.pdf"));
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.keyboard("{Enter}");
    expect(renameDocument).not.toHaveBeenCalled();
  });

  it("does not call renameDocument when input is whitespace only", async () => {
    const user = userEvent.setup();
    render(<DocRow doc={makeDoc({ id: "doc-1" })} />);
    await user.click(screen.getByText("Boarding Pass.pdf"));
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "   ");
    await user.keyboard("{Enter}");
    expect(renameDocument).not.toHaveBeenCalled();
  });

  it("does not call renameDocument when name is unchanged", async () => {
    const user = userEvent.setup();
    render(<DocRow doc={makeDoc({ id: "doc-1", name: "Boarding Pass.pdf" })} />);
    await user.click(screen.getByText("Boarding Pass.pdf"));
    await user.keyboard("{Enter}");
    expect(renameDocument).not.toHaveBeenCalled();
  });

  it("renders a 'Not cached offline' indicator when doc.offline is false", () => {
    render(<DocRow doc={makeDoc({ offline: false })} />);
    const indicator = screen.getByRole("img", { name: "Not cached offline" });
    expect(indicator).toBeInTheDocument();
  });

  it("renders a 'Cached offline' indicator when doc.offline is true", () => {
    render(<DocRow doc={makeDoc({ offline: true })} />);
    const indicator = screen.getByRole("img", { name: "Cached offline" });
    expect(indicator).toBeInTheDocument();
  });

  it("renders a view button with correct title and aria-label", () => {
    render(<DocRow doc={makeDoc()} />);
    const btn = screen.getByRole("button", { name: "View Boarding Pass.pdf" });
    expect(btn).toHaveAttribute("title", "View Boarding Pass.pdf");
    expect(btn).toHaveAttribute("aria-label", "View Boarding Pass.pdf");
  });

  it("view button has min 44px touch target", () => {
    render(<DocRow doc={makeDoc()} />);
    const btn = screen.getByRole("button", { name: "View Boarding Pass.pdf" });
    expect(btn).toHaveStyle({ minWidth: "44px", minHeight: "44px" });
  });

  it("clicking the view button opens the DocViewer", async () => {
    const user = userEvent.setup();
    render(<DocRow doc={makeDoc()} />);
    expect(screen.queryByTestId("doc-viewer")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "View Boarding Pass.pdf" }));
    expect(screen.getByTestId("doc-viewer")).toBeInTheDocument();
  });

  it("closing the DocViewer hides it", async () => {
    const user = userEvent.setup();
    render(<DocRow doc={makeDoc()} />);
    await user.click(screen.getByRole("button", { name: "View Boarding Pass.pdf" }));
    expect(screen.getByTestId("doc-viewer")).toBeInTheDocument();
    await user.click(screen.getByTestId("doc-viewer-close"));
    expect(screen.queryByTestId("doc-viewer")).not.toBeInTheDocument();
  });

  describe("share button", () => {
    it("renders a share button with correct title and aria-label", () => {
      render(<DocRow doc={makeDoc()} />);
      const btn = screen.getByRole("button", { name: "Share Boarding Pass.pdf" });
      expect(btn).toHaveAttribute("title", "Share Boarding Pass.pdf");
      expect(btn).toHaveAttribute("aria-label", "Share Boarding Pass.pdf");
    });

    it("share button uses doc name in title/aria-label", () => {
      render(<DocRow doc={makeDoc({ name: "insurance.pdf" })} />);
      expect(screen.getByRole("button", { name: "Share insurance.pdf" })).toBeInTheDocument();
    });

    it("share button has min 44px touch target", () => {
      render(<DocRow doc={makeDoc()} />);
      const btn = screen.getByRole("button", { name: "Share Boarding Pass.pdf" });
      expect(btn).toHaveStyle({ minWidth: "44px", minHeight: "44px" });
    });

    it("clicking share button calls shareDoc with the doc", async () => {
      const user = userEvent.setup();
      render(<DocRow doc={makeDoc({ id: "doc-1", name: "Boarding Pass.pdf", url: "https://example.com/doc.pdf" })} />);
      await user.click(screen.getByRole("button", { name: "Share Boarding Pass.pdf" }));
      expect(shareDoc).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Boarding Pass.pdf", url: "https://example.com/doc.pdf" })
      );
    });
  });
});
