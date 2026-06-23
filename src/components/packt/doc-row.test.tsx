import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Document } from "@/data/types";

vi.mock("@/app/(app)/trips/[tripId]/actions", () => ({
  uploadDocument: vi.fn().mockResolvedValue(undefined),
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
import { shareDoc } from "@/lib/utils";

const makeDoc = (overrides: Partial<Document> = {}): Document => ({
  id: "doc-1",
  name: "Boarding Pass.pdf",
  kind: "pdf",
  scope: "trip",
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

  it("DocViewer is not in the DOM when viewerOpen is false (initial state)", () => {
    render(<DocRow doc={makeDoc()} />);
    expect(screen.queryByTestId("doc-viewer")).not.toBeInTheDocument();
  });

  it("focus returns to the view button after the DocViewer is closed", async () => {
    const user = userEvent.setup();
    render(<DocRow doc={makeDoc()} />);
    const viewBtn = screen.getByRole("button", { name: "View Boarding Pass.pdf" });
    await user.click(viewBtn);
    expect(screen.getByTestId("doc-viewer")).toBeInTheDocument();
    await user.click(screen.getByTestId("doc-viewer-close"));
    expect(viewBtn).toHaveFocus();
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
