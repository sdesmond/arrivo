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

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

vi.mock("@/lib/api/client", async (original) => ({
  ...(await original<typeof import("@/lib/api/client")>()),
  api: vi.fn().mockResolvedValue({ id: "doc" }),
}));
import { api, ApiClientError } from "@/lib/api/client";
import { updateDocument, uploadReservationDocument } from "@/lib/api/contract/documents";

import { AddReservationDocDialog } from "./add-reservation-doc-dialog";

const makeDoc = (overrides: Record<string, unknown> = {}) => ({
  id: "doc-1",
  name: "Itinerary.pdf",
  kind: "pdf" as const,
  scope: "trip" as const,

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

  it("clicking a doc in pick list calls document attachment PATCH and closes", async () => {
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
      expect(api).toHaveBeenCalledWith(updateDocument, {
        params: { documentId: "doc-1" },
        body: { reservationId: "res-1" },
      });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("attach failure shows a toast and keeps the dialog open", async () => {
    const { toast } = await import("sonner");
    vi.mocked(api).mockRejectedValueOnce(new Error("Reservation not found"));
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
      expect(toast.error).toHaveBeenCalledWith("Could not save changes. Try again.");
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

  it("clicking Attach with a file uploads through the multipart API and closes", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<AddReservationDocDialog open reservationId="res-1" onOpenChange={onOpenChange} />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const validFile = new File(["content"], "confirmation.pdf", { type: "application/pdf" });
    await user.upload(fileInput, validFile);
    await user.click(screen.getByRole("button", { name: /attach/i }));
    await waitFor(() => {
      expect(api).toHaveBeenCalledWith(
        uploadReservationDocument,
        expect.objectContaining({
          params: { reservationId: "res-1" },
          file: validFile,
          body: { id: expect.any(String) },
        })
      );
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("upload failure shows toast error", async () => {
    const { toast } = await import("sonner");
    vi.mocked(api).mockRejectedValueOnce(new Error("Network error"));
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<AddReservationDocDialog open reservationId="res-1" onOpenChange={onOpenChange} />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const validFile = new File(["content"], "confirmation.pdf", { type: "application/pdf" });
    await user.upload(fileInput, validFile);
    await user.click(screen.getByRole("button", { name: /attach/i }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Could not save changes. Try again.");
    });
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});

describe("API retry lifecycle", () => {
  it("keeps failed file and client id across retry, but changes id for a new target or file", async () => {
    vi.mocked(api).mockRejectedValue(new Error("offline"));
    const onOpenChange = vi.fn();
    const view = render(<AddReservationDocDialog open reservationId="target-1" onOpenChange={onOpenChange} />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [new File(["pdf"], "pass.pdf", { type: "application/pdf" })] } });
    fireEvent.click(screen.getByRole("button", { name: /^attach$/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /^attach$/i })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /^attach$/i }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api).mock.calls[1][1].body).toEqual(vi.mocked(api).mock.calls[0][1].body);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByText("pass.pdf")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /^attach$/i })).toBeEnabled());
    view.rerender(<AddReservationDocDialog open reservationId="target-2" onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByRole("button", { name: /^attach$/i }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(3));
    expect(vi.mocked(api).mock.calls[2][1].body).not.toEqual(vi.mocked(api).mock.calls[1][1].body);
    await waitFor(() => expect(screen.getByRole("button", { name: /^attach$/i })).toBeEnabled());
    fireEvent.change(fileInput, {
      target: { files: [new File(["different"], "other.pdf", { type: "application/pdf" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: /^attach$/i }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(4));
    expect(vi.mocked(api).mock.calls[3][1].body).not.toEqual(vi.mocked(api).mock.calls[2][1].body);
    vi.mocked(api).mockResolvedValue({ id: "doc" });
  });
  it("disables repeat submission while upload is pending", async () => {
    let finish!: (value: unknown) => void;
    vi.mocked(api).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    render(<AddReservationDocDialog open reservationId="target-1" onOpenChange={vi.fn()} />);
    fireEvent.change(document.querySelector('input[type="file"]')!, {
      target: { files: [new File(["pdf"], "pass.pdf", { type: "application/pdf" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: /^attach$/i }));
    expect(screen.getByRole("button", { name: /^attach$/i })).toBeDisabled();
    finish({ id: "doc" });
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
  });
});

it.each(["unauthenticated", "mfa_enrollment_required"])("closes upload dialog on auth loss: %s", async (code) => {
  vi.mocked(api).mockRejectedValueOnce(new ApiClientError(401, code, "Sign in again"));
  const onOpenChange = vi.fn();
  render(<AddReservationDocDialog open reservationId="target-1" onOpenChange={onOpenChange} />);
  fireEvent.change(document.querySelector('input[type="file"]')!, {
    target: { files: [new File(["pdf"], "pass.pdf", { type: "application/pdf" })] },
  });
  fireEvent.click(screen.getByRole("button", { name: /^attach$/i }));
  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
});

it("blocks repeated picks while pending and allows retry after error", async () => {
  let fail!: (error: Error) => void;
  vi.mocked(api).mockReturnValueOnce(
    new Promise((_resolve, reject) => {
      fail = reject;
    })
  );
  const onOpenChange = vi.fn();
  render(<AddReservationDocDialog open reservationId="res-1" onOpenChange={onOpenChange} tripDocs={[makeDoc()]} />);
  const pick = screen.getByRole("button", { name: /Itinerary.pdf/ });
  fireEvent.click(pick);
  fireEvent.click(pick);
  expect(api).toHaveBeenCalledTimes(1);
  expect(pick).toBeDisabled();
  fail(new Error("offline"));
  await waitFor(() => expect(pick).toBeEnabled());
  expect(onOpenChange).not.toHaveBeenCalled();
  fireEvent.click(pick);
  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  expect(api).toHaveBeenCalledTimes(2);
});
it.each(["unauthenticated", "mfa_enrollment_required"])("closes picker on auth loss: %s", async (code) => {
  vi.mocked(api).mockRejectedValueOnce(new ApiClientError(401, code, "Sign in"));
  const onOpenChange = vi.fn();
  render(<AddReservationDocDialog open reservationId="res-1" onOpenChange={onOpenChange} tripDocs={[makeDoc()]} />);
  fireEvent.click(screen.getByRole("button", { name: /Itinerary.pdf/ }));
  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
});
