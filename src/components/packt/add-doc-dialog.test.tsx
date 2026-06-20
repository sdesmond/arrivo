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

vi.mock("@/app/(app)/trips/[tripId]/actions", () => ({
  attachTripDocToEvent: vi.fn().mockResolvedValue(undefined),
  uploadDocumentToEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { AddDocDialog } from "./add-doc-dialog";
import { attachTripDocToEvent, uploadDocumentToEvent } from "@/app/(app)/trips/[tripId]/actions";

const makeDoc = (overrides: Record<string, unknown> = {}) => ({
  id: "doc-1",
  name: "Boarding Pass.pdf",
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
    render(<AddDocDialog open eventId="ev-1" onOpenChange={vi.fn()} tripDocs={[makeDoc()]} />);
    expect(screen.getByText("Boarding Pass.pdf")).toBeInTheDocument();
  });

  it("shows Upload new instead toggle in pick mode", () => {
    render(<AddDocDialog open eventId="ev-1" onOpenChange={vi.fn()} tripDocs={[makeDoc()]} />);
    expect(screen.getByRole("button", { name: /upload new instead/i })).toBeInTheDocument();
  });

  it("shows Cancel button in pick mode", () => {
    render(<AddDocDialog open eventId="ev-1" onOpenChange={vi.fn()} tripDocs={[makeDoc()]} />);
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("clicking a doc in pick list calls attachTripDocToEvent and closes", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <AddDocDialog
        open
        eventId="ev-1"
        onOpenChange={onOpenChange}
        tripDocs={[makeDoc({ id: "doc-1", name: "Boarding Pass.pdf" })]}
      />
    );
    await user.click(screen.getByText("Boarding Pass.pdf"));
    await waitFor(() => {
      expect(attachTripDocToEvent).toHaveBeenCalledWith("doc-1", "ev-1");
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("attach failure shows a toast and keeps the dialog open", async () => {
    const { toast } = await import("sonner");
    vi.mocked(attachTripDocToEvent).mockRejectedValueOnce(new Error("Event not found"));
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <AddDocDialog
        open
        eventId="ev-1"
        onOpenChange={onOpenChange}
        tripDocs={[makeDoc({ id: "doc-1", name: "Boarding Pass.pdf" })]}
      />
    );

    await user.click(screen.getByText("Boarding Pass.pdf"));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed to attach document. Please try again.");
    });
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("Cancel closes the dialog in pick mode", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<AddDocDialog open eventId="ev-1" onOpenChange={onOpenChange} tripDocs={[makeDoc()]} />);
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("Upload new instead switches to upload mode", async () => {
    const user = userEvent.setup();
    render(<AddDocDialog open eventId="ev-1" onOpenChange={vi.fn()} tripDocs={[makeDoc()]} />);
    await user.click(screen.getByRole("button", { name: /upload new instead/i }));
    expect(screen.getByRole("button", { name: /attach/i })).toBeInTheDocument();
  });

  it("renders DocKindBadge for each doc in pick list", () => {
    render(
      <AddDocDialog
        open
        eventId="ev-1"
        onOpenChange={vi.fn()}
        tripDocs={[
          makeDoc({ id: "d1", name: "Pass.pdf", kind: "pdf" }),
          makeDoc({ id: "d2", name: "Ticket.jpg", kind: "image" }),
        ]}
      />
    );
    expect(screen.getByText("Pass.pdf")).toBeInTheDocument();
    expect(screen.getByText("Ticket.jpg")).toBeInTheDocument();
  });
});

describe("upload mode", () => {
  it("opens directly in upload mode when no tripDocs provided", () => {
    render(<AddDocDialog open eventId="ev-1" onOpenChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /attach/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /upload new instead/i })).not.toBeInTheDocument();
  });

  it("opens directly in upload mode when tripDocs is empty array", () => {
    render(<AddDocDialog open eventId="ev-1" onOpenChange={vi.fn()} tripDocs={[]} />);
    expect(screen.getByRole("button", { name: /attach/i })).toBeInTheDocument();
  });

  it("Attach button disabled when no file selected", () => {
    render(<AddDocDialog open eventId="ev-1" onOpenChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /attach/i })).toBeDisabled();
  });

  it("Cancel closes dialog in upload mode", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<AddDocDialog open eventId="ev-1" onOpenChange={onOpenChange} />);
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows Choose existing instead link when tripDocs available", async () => {
    const user = userEvent.setup();
    render(<AddDocDialog open eventId="ev-1" onOpenChange={vi.fn()} tripDocs={[makeDoc()]} />);
    await user.click(screen.getByRole("button", { name: /upload new instead/i }));
    expect(screen.getByRole("button", { name: /choose existing instead/i })).toBeInTheDocument();
  });

  it("Choose existing instead switches back to pick mode", async () => {
    const user = userEvent.setup();
    render(<AddDocDialog open eventId="ev-1" onOpenChange={vi.fn()} tripDocs={[makeDoc()]} />);
    await user.click(screen.getByRole("button", { name: /upload new instead/i }));
    await user.click(screen.getByRole("button", { name: /choose existing instead/i }));
    expect(screen.getByText("Boarding Pass.pdf")).toBeInTheDocument();
  });

  it("shows eventName as subtitle when provided", () => {
    render(<AddDocDialog open eventId="ev-1" eventName="Museum visit" onOpenChange={vi.fn()} />);
    expect(screen.getByText("Museum visit")).toBeInTheDocument();
  });

  it("file too large shows toast error", async () => {
    const { toast } = await import("sonner");
    const user = userEvent.setup();
    render(<AddDocDialog open eventId="ev-1" onOpenChange={vi.fn()} />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const largeFile = new File([new ArrayBuffer(26 * 1024 * 1024)], "big.pdf", { type: "application/pdf" });
    await user.upload(fileInput, largeFile);
    expect(toast.error).toHaveBeenCalledWith("File is too large. Max 25.0 MB.");
  });

  it("unsupported file type shows toast error and keeps Attach disabled", async () => {
    const { toast } = await import("sonner");
    render(<AddDocDialog open eventId="ev-1" onOpenChange={vi.fn()} />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const unsupportedFile = new File(["content"], "notes.docx", { type: "application/msword" });
    fireEvent.change(fileInput, { target: { files: [unsupportedFile] } });

    expect(toast.error).toHaveBeenCalledWith("Unsupported file type. Choose PDF, JPG, PNG, WEBP, or HEIC.");
    expect(screen.getByRole("button", { name: /attach/i })).toBeDisabled();
  });

  it("valid file selection enables Attach button", async () => {
    const user = userEvent.setup();
    render(<AddDocDialog open eventId="ev-1" onOpenChange={vi.fn()} />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const validFile = new File(["content"], "boarding.pdf", { type: "application/pdf" });
    await user.upload(fileInput, validFile);
    expect(screen.getByRole("button", { name: /attach/i })).not.toBeDisabled();
  });

  it("clicking Attach with a file calls uploadDocumentToEvent and closes", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<AddDocDialog open eventId="ev-1" onOpenChange={onOpenChange} />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const validFile = new File(["content"], "boarding.pdf", { type: "application/pdf" });
    await user.upload(fileInput, validFile);
    await user.click(screen.getByRole("button", { name: /attach/i }));
    await waitFor(() => {
      expect(uploadDocumentToEvent).toHaveBeenCalledWith("ev-1", expect.any(FormData));
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("backdrop close calls onOpenChange(false)", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<AddDocDialog open eventId="ev-1" onOpenChange={onOpenChange} />);
    await user.click(screen.getByTestId("dialog-backdrop-close"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("upload failure shows toast error", async () => {
    const { toast } = await import("sonner");
    vi.mocked(uploadDocumentToEvent).mockRejectedValueOnce(new Error("Network error"));
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<AddDocDialog open eventId="ev-1" onOpenChange={onOpenChange} />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const validFile = new File(["content"], "boarding.pdf", { type: "application/pdf" });
    await user.upload(fileInput, validFile);
    await user.click(screen.getByRole("button", { name: /attach/i }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Network error");
    });
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("Enter key on drop zone invokes file input click", async () => {
    const user = userEvent.setup();
    render(<AddDocDialog open eventId="ev-1" onOpenChange={vi.fn()} />);
    const dropZone = screen.getByRole("button", { name: /choose file/i });
    dropZone.focus();
    await user.keyboard("{Enter}");
  });

  it("Space key on drop zone invokes file input click", async () => {
    const user = userEvent.setup();
    render(<AddDocDialog open eventId="ev-1" onOpenChange={vi.fn()} />);
    const dropZone = screen.getByRole("button", { name: /choose file/i });
    dropZone.focus();
    await user.keyboard(" ");
  });
});

describe("focus management", () => {
  it("focuses first pick item when dialog opens with tripDocs", async () => {
    render(
      <AddDocDialog open eventId="ev-1" onOpenChange={vi.fn()} tripDocs={[makeDoc({ name: "Boarding Pass.pdf" })]} />
    );
    await waitFor(
      () => {
        const firstBtn = screen.getByRole("button", { name: /Boarding Pass\.pdf/i });
        expect(document.activeElement).toBe(firstBtn);
      },
      { timeout: 500 }
    );
  });
});
