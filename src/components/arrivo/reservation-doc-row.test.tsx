const mutationMocks = vi.hoisted(() => ({
  rename: vi.fn().mockResolvedValue({}),
  remove: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/api/client", () => ({
  api: (endpoint: { method: string }, input: unknown) =>
    endpoint.method === "PATCH" ? mutationMocks.rename(input) : mutationMocks.remove(input),
  ApiClientError: class extends Error {
    code = "unauthenticated";
  },
}));
const renameDocument = mutationMocks.rename;
const removeDocument = mutationMocks.remove;
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Document } from "@/data/types";

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
import { shareDoc } from "@/lib/utils";
import { FIELD_LIMITS } from "@/lib/validation-limits";

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
    render(<ReservationDocRow tripId="trip-1" doc={makeDoc()} />);
    expect(screen.getByText("Confirmation.pdf")).toBeInTheDocument();
  });

  it("renders view, share, promote, and delete buttons", () => {
    render(<ReservationDocRow tripId="trip-1" doc={makeDoc()} />);
    expect(screen.getByRole("button", { name: "View Confirmation.pdf" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Share Confirmation.pdf" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move Confirmation.pdf to trip" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete Confirmation.pdf" })).toBeInTheDocument();
  });

  it("clicking the name enters edit mode with input pre-filled", async () => {
    const user = userEvent.setup();
    render(<ReservationDocRow tripId="trip-1" doc={makeDoc()} />);
    await user.click(screen.getByText("Confirmation.pdf"));
    const input = screen.getByRole("textbox");
    expect(input).toHaveValue("Confirmation.pdf");
  });

  it("pressing Enter calls renameDocument with trimmed new name", async () => {
    const user = userEvent.setup();
    render(<ReservationDocRow tripId="trip-1" doc={makeDoc({ id: "doc-1", name: "Confirmation.pdf" })} />);
    await user.click(screen.getByText("Confirmation.pdf"));
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "New Name");
    await user.keyboard("{Enter}");
    expect(renameDocument).toHaveBeenCalledWith({ params: { documentId: "doc-1" }, body: { name: "New Name" } });
  });

  it("pressing Escape cancels rename without calling renameDocument", async () => {
    const user = userEvent.setup();
    render(<ReservationDocRow tripId="trip-1" doc={makeDoc()} />);
    await user.click(screen.getByText("Confirmation.pdf"));
    const input = screen.getByRole("textbox");
    await user.type(input, "Cancelled");
    await user.keyboard("{Escape}");
    expect(renameDocument).not.toHaveBeenCalled();
  });

  it("clicking the view button opens the DocViewer", async () => {
    const user = userEvent.setup();
    render(<ReservationDocRow tripId="trip-1" doc={makeDoc()} />);
    await user.click(screen.getByRole("button", { name: "View Confirmation.pdf" }));
    expect(screen.getByTestId("doc-viewer")).toBeInTheDocument();
  });

  it("closing the DocViewer hides it", async () => {
    const user = userEvent.setup();
    render(<ReservationDocRow tripId="trip-1" doc={makeDoc()} />);
    await user.click(screen.getByRole("button", { name: "View Confirmation.pdf" }));
    expect(screen.getByTestId("doc-viewer")).toBeInTheDocument();
    await user.click(screen.getByTestId("doc-viewer-close"));
    expect(screen.queryByTestId("doc-viewer")).not.toBeInTheDocument();
  });

  it("clicking share button calls shareDoc with the doc", async () => {
    const user = userEvent.setup();
    render(<ReservationDocRow tripId="trip-1" doc={makeDoc({ url: "https://example.com/doc.pdf" })} />);
    await user.click(screen.getByRole("button", { name: "Share Confirmation.pdf" }));
    expect(shareDoc).toHaveBeenCalledWith(expect.objectContaining({ url: "https://example.com/doc.pdf" }));
  });

  it("clicking the promote button calls document promotion PATCH with doc id", async () => {
    const user = userEvent.setup();
    render(<ReservationDocRow tripId="trip-1" doc={makeDoc({ id: "doc-42" })} />);
    await user.click(screen.getByRole("button", { name: "Move Confirmation.pdf to trip" }));
    expect(renameDocument).toHaveBeenCalledWith({ params: { documentId: "doc-42" }, body: { reservationId: null } });
  });

  it("double-click on promote button does not call document promotion PATCH twice", async () => {
    let resolveCall: (() => void) | undefined;
    vi.mocked(renameDocument).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveCall = () => resolve();
        })
    );
    const user = userEvent.setup();
    render(<ReservationDocRow tripId="trip-1" doc={makeDoc({ id: "doc-99" })} />);
    const promoteBtn = screen.getByRole("button", { name: "Move Confirmation.pdf to trip" });
    await user.click(promoteBtn);
    await user.click(promoteBtn);
    expect(renameDocument).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveCall?.();
    });
  });

  it("silently recovers when document promotion PATCH rejects", async () => {
    vi.mocked(renameDocument).mockRejectedValueOnce(new Error("network error"));
    const user = userEvent.setup();
    render(<ReservationDocRow tripId="trip-1" doc={makeDoc({ id: "doc-err" })} />);
    await user.click(screen.getByRole("button", { name: "Move Confirmation.pdf to trip" }));
    expect(renameDocument).toHaveBeenCalledWith({ params: { documentId: "doc-err" }, body: { reservationId: null } });
    expect(screen.getByRole("button", { name: "Move Confirmation.pdf to trip" })).toBeInTheDocument();
  });

  it("opens the confirm dialog when the delete button is clicked", async () => {
    const user = userEvent.setup();
    render(<ReservationDocRow tripId="trip-1" doc={makeDoc()} />);
    await user.click(screen.getByRole("button", { name: "Delete Confirmation.pdf" }));
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("calls removeDocument with doc id after the dialog Delete button is clicked", async () => {
    const user = userEvent.setup();
    render(<ReservationDocRow tripId="trip-1" doc={makeDoc({ id: "doc-42" })} />);
    await user.click(screen.getByRole("button", { name: "Delete Confirmation.pdf" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(removeDocument).toHaveBeenCalledWith({ params: { documentId: "doc-42" }, body: { tripId: "trip-1" } });
  });

  it("does not call removeDocument when Cancel is clicked", async () => {
    const user = userEvent.setup();
    render(<ReservationDocRow tripId="trip-1" doc={makeDoc()} />);
    await user.click(screen.getByRole("button", { name: "Delete Confirmation.pdf" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(removeDocument).not.toHaveBeenCalled();
  });

  it("shows an error message when removeDocument rejects", async () => {
    vi.mocked(removeDocument).mockRejectedValueOnce(new Error("boom"));
    const user = userEvent.setup();
    render(<ReservationDocRow tripId="trip-1" doc={makeDoc()} />);
    await user.click(screen.getByRole("button", { name: "Delete Confirmation.pdf" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't delete. Try again.");
  });
});

describe("ReservationDocRow rename limit", () => {
  it("caps the rename input at the shared document name limit", async () => {
    const user = userEvent.setup();
    render(<ReservationDocRow tripId="trip-1" doc={makeDoc()} />);
    await user.click(screen.getByText("Confirmation.pdf"));
    expect(screen.getByRole("textbox")).toHaveAttribute("maxLength", String(FIELD_LIMITS.documentName));
  });
});

it("serializes rapid A to B to A renames and keeps the final optimistic name", async () => {
  let finish: () => void = () => undefined;
  mutationMocks.rename.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      })
  );
  const user = userEvent.setup();
  render(<ReservationDocRow tripId="trip-1" doc={makeDoc({ name: "A" })} />);
  await user.click(screen.getByRole("button", { name: "A" }));
  expect(screen.getByRole("textbox", { name: "Document name" })).toHaveAttribute("aria-label", "Document name");
  await user.clear(screen.getByRole("textbox"));
  await user.type(screen.getByRole("textbox"), "B{Enter}");
  await user.click(screen.getByRole("button", { name: "B" }));
  await user.clear(screen.getByRole("textbox"));
  await user.type(screen.getByRole("textbox"), "A{Enter}");
  expect(mutationMocks.rename).toHaveBeenCalledTimes(1);
  await act(async () => finish());
  await waitFor(() => expect(mutationMocks.rename).toHaveBeenCalledTimes(2));
  expect(mutationMocks.rename.mock.calls.map((call) => call[0].body.name)).toEqual(["B", "A"]);
  expect(screen.getByRole("button", { name: "A" })).toBeVisible();
});
it("closes deletion dialog on auth loss without showing retry error", async () => {
  const { ApiClientError } = await import("@/lib/api/client");
  mutationMocks.remove.mockRejectedValueOnce(new ApiClientError(401, "unauthenticated", "Sign in"));
  const user = userEvent.setup();
  render(<ReservationDocRow tripId="trip-1" doc={makeDoc()} />);
  await user.click(screen.getByRole("button", { name: "Delete Confirmation.pdf" }));
  await user.click(screen.getByRole("button", { name: "Delete" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument());
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

describe("ReservationDocRow rename failure and retry", () => {
  beforeEach(() => {
    mutationMocks.rename.mockClear();
    mutationMocks.remove.mockClear();
  });

  async function renameTo(user: ReturnType<typeof userEvent.setup>, from: string, to: string) {
    await user.click(screen.getByRole("button", { name: from }));
    await user.clear(screen.getByRole("textbox"));
    await user.type(screen.getByRole("textbox"), `${to}{Enter}`);
  }

  it("restores the saved name when a rename fails", async () => {
    mutationMocks.rename.mockRejectedValueOnce(new Error("network down"));
    const user = userEvent.setup();
    render(<ReservationDocRow tripId="trip-1" doc={makeDoc({ name: "A" })} />);
    await renameTo(user, "A", "B");
    expect(await screen.findByRole("button", { name: "A" })).toBeVisible();
  });

  it("restores the last saved name, not the stale prop, when a later rename fails", async () => {
    mutationMocks.rename.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("network down"));
    const user = userEvent.setup();
    render(<ReservationDocRow tripId="trip-1" doc={makeDoc({ name: "A" })} />);
    await renameTo(user, "A", "B");
    await waitFor(() => expect(mutationMocks.rename).toHaveBeenCalledTimes(1));
    await act(async () => undefined);
    await renameTo(user, "B", "A");
    await waitFor(() => expect(mutationMocks.rename).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("button", { name: "B" })).toBeVisible();
  });

  it("restores the saved name when a rename loses auth", async () => {
    const { ApiClientError } = await import("@/lib/api/client");
    mutationMocks.rename.mockRejectedValueOnce(new ApiClientError(401, "unauthenticated", "Sign in"));
    const user = userEvent.setup();
    render(<ReservationDocRow tripId="trip-1" doc={makeDoc({ name: "A" })} />);
    await renameTo(user, "A", "B");
    expect(await screen.findByRole("button", { name: "A" })).toBeVisible();
  });

  it("sends delete again after a failed attempt", async () => {
    mutationMocks.remove.mockRejectedValueOnce(new Error("network down"));
    const user = userEvent.setup();
    render(<ReservationDocRow tripId="trip-1" doc={makeDoc()} />);
    await user.click(screen.getByRole("button", { name: "Delete Confirmation.pdf" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't delete. Try again.");
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(mutationMocks.remove).toHaveBeenCalledTimes(2));
  });

  it("keeps the name button and rename input at 44px", async () => {
    const user = userEvent.setup();
    render(<ReservationDocRow tripId="trip-1" doc={makeDoc({ name: "A" })} />);
    expect(screen.getByRole("button", { name: "A" })).toHaveStyle({ minWidth: "44px", minHeight: "44px" });
    await user.click(screen.getByRole("button", { name: "A" }));
    expect(screen.getByRole("textbox", { name: "Document name" })).toHaveStyle({ minHeight: "44px" });
  });
});

it("retries failed promotion through PATCH", async () => {
  mutationMocks.rename.mockClear();
  mutationMocks.rename.mockRejectedValueOnce(new Error("offline"));
  const user = userEvent.setup();
  render(<ReservationDocRow tripId="trip-1" doc={makeDoc()} />);
  const promote = screen.getByRole("button", { name: /Move .* to trip/ });
  await user.click(promote);
  await waitFor(() => expect(promote).toBeEnabled());
  await user.click(promote);
  await waitFor(() => expect(mutationMocks.rename).toHaveBeenCalledTimes(2));
});
it("stops promotion retries after auth loss", async () => {
  mutationMocks.rename.mockClear();
  mutationMocks.remove.mockClear();
  const { ApiClientError } = await import("@/lib/api/client");
  mutationMocks.rename.mockRejectedValueOnce(new ApiClientError(401, "unauthenticated", "Sign in"));
  const user = userEvent.setup();
  render(<ReservationDocRow tripId="trip-1" doc={makeDoc()} />);
  const promote = screen.getByRole("button", { name: /Move .* to trip/ });
  await user.click(promote);
  await waitFor(() => expect(promote).toBeEnabled());
  await user.click(promote);
  expect(mutationMocks.rename).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(promote).toBeEnabled());
  expect(screen.getByRole("button", { name: /Delete .*pdf/ })).toBeEnabled();
  await user.click(screen.getByRole("button", { name: /Delete .*pdf/ }));
  await user.click(screen.getByRole("button", { name: "Delete" }));
  await waitFor(() => expect(mutationMocks.remove).toHaveBeenCalledTimes(1));
});

it("queues promotion behind an in-flight rename for the same document", async () => {
  mutationMocks.rename.mockClear();
  let finish!: () => void;
  mutationMocks.rename.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      })
  );
  const user = userEvent.setup();
  render(<ReservationDocRow tripId="trip-1" doc={makeDoc({ name: "Old" })} />);
  await user.click(screen.getByRole("button", { name: "Old" }));
  await user.clear(screen.getByRole("textbox"));
  await user.type(screen.getByRole("textbox"), "New{Enter}");
  await user.click(screen.getByRole("button", { name: "Move Old to trip" }));
  expect(mutationMocks.rename).toHaveBeenCalledTimes(1);
  await act(async () => finish());
  await waitFor(() => expect(mutationMocks.rename).toHaveBeenCalledTimes(2));
  expect(mutationMocks.rename.mock.calls[1][0]).toEqual({
    params: { documentId: "doc-1" },
    body: { reservationId: null },
  });
});
