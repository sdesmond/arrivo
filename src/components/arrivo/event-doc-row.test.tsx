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

vi.mock("@/app/(app)/trips/[tripId]/actions", () => ({
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
import { TripEditAccessProvider } from "./trip-edit-access";
import { promoteEventDocToTrip } from "@/app/(app)/trips/[tripId]/actions";
import { shareDoc } from "@/lib/utils";
import { FIELD_LIMITS } from "@/lib/validation-limits";

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
    render(<EventDocRow tripId="trip-1" doc={makeDoc()} />);
    expect(screen.getByText("Boarding Pass.pdf")).toBeInTheDocument();
  });

  it("renders PDF badge for pdf kind", () => {
    render(<EventDocRow tripId="trip-1" doc={makeDoc({ kind: "pdf" })} />);
    expect(screen.getByText("PDF")).toBeInTheDocument();
  });

  it("renders IMG badge for image kind", () => {
    render(<EventDocRow tripId="trip-1" doc={makeDoc({ kind: "image", name: "photo.jpg" })} />);
    expect(screen.getByText("IMG")).toBeInTheDocument();
  });

  it("renders DOC badge for doc kind", () => {
    render(<EventDocRow tripId="trip-1" doc={makeDoc({ kind: "doc", name: "contract.docx" })} />);
    expect(screen.getByText("DOC")).toBeInTheDocument();
  });

  it("renders view button with correct title and aria-label", () => {
    render(<EventDocRow tripId="trip-1" doc={makeDoc()} />);
    const btn = screen.getByRole("button", { name: "View Boarding Pass.pdf" });
    expect(btn).toHaveAttribute("title", "View Boarding Pass.pdf");
    expect(btn).toHaveAttribute("aria-label", "View Boarding Pass.pdf");
  });

  it("renders share button with correct title and aria-label", () => {
    render(<EventDocRow tripId="trip-1" doc={makeDoc()} />);
    const btn = screen.getByRole("button", { name: "Share Boarding Pass.pdf" });
    expect(btn).toHaveAttribute("title", "Share Boarding Pass.pdf");
    expect(btn).toHaveAttribute("aria-label", "Share Boarding Pass.pdf");
  });

  it("renders promote button with correct title and aria-label", () => {
    render(<EventDocRow tripId="trip-1" doc={makeDoc()} />);
    const btn = screen.getByRole("button", { name: "Move Boarding Pass.pdf to trip" });
    expect(btn).toHaveAttribute("title", "Move Boarding Pass.pdf to trip");
    expect(btn).toHaveAttribute("aria-label", "Move Boarding Pass.pdf to trip");
  });

  it("renders delete button with correct title and aria-label", () => {
    render(<EventDocRow tripId="trip-1" doc={makeDoc()} />);
    const btn = screen.getByRole("button", { name: "Delete Boarding Pass.pdf" });
    expect(btn).toHaveAttribute("title", "Delete Boarding Pass.pdf");
    expect(btn).toHaveAttribute("aria-label", "Delete Boarding Pass.pdf");
  });

  it("compact icon buttons have 44px min dimensions", () => {
    render(<EventDocRow tripId="trip-1" doc={makeDoc()} />);
    const viewBtn = screen.getByRole("button", { name: "View Boarding Pass.pdf" });
    expect(viewBtn).toHaveStyle({ minWidth: "44px", minHeight: "44px" });
    const deleteBtn = screen.getByRole("button", { name: "Delete Boarding Pass.pdf" });
    expect(deleteBtn).toHaveStyle({ minWidth: "44px", minHeight: "44px" });
  });

  // ── Rename ────────────────────────────────────────────────────────────────

  it("clicking the name enters edit mode with input pre-filled", async () => {
    const user = userEvent.setup();
    render(<EventDocRow tripId="trip-1" doc={makeDoc()} />);
    await user.click(screen.getByText("Boarding Pass.pdf"));
    const input = screen.getByRole("textbox");
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue("Boarding Pass.pdf");
  });

  it("rename input has underline border using var(--accent-brand)", async () => {
    const user = userEvent.setup();
    render(<EventDocRow tripId="trip-1" doc={makeDoc()} />);
    await user.click(screen.getByText("Boarding Pass.pdf"));
    expect(screen.getByRole("textbox")).toHaveAttribute("style", expect.stringContaining("var(--accent-brand)"));
  });

  it("pressing Enter calls renameDocument with trimmed new name", async () => {
    const user = userEvent.setup();
    render(<EventDocRow tripId="trip-1" doc={makeDoc({ id: "doc-1", name: "Boarding Pass.pdf" })} />);
    await user.click(screen.getByText("Boarding Pass.pdf"));
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "New Name");
    await user.keyboard("{Enter}");
    expect(renameDocument).toHaveBeenCalledWith({ params: { documentId: "doc-1" }, body: { name: "New Name" } });
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("blurring the input calls renameDocument", async () => {
    const user = userEvent.setup();
    render(<EventDocRow tripId="trip-1" doc={makeDoc({ id: "doc-1", name: "Boarding Pass.pdf" })} />);
    await user.click(screen.getByText("Boarding Pass.pdf"));
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "Renamed");
    await user.tab();
    expect(renameDocument).toHaveBeenCalledWith({ params: { documentId: "doc-1" }, body: { name: "Renamed" } });
  });

  it("pressing Escape cancels rename without calling renameDocument", async () => {
    const user = userEvent.setup();
    render(<EventDocRow tripId="trip-1" doc={makeDoc({ id: "doc-1", name: "Boarding Pass.pdf" })} />);
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
    render(<EventDocRow tripId="trip-1" doc={makeDoc({ id: "doc-1" })} />);
    await user.click(screen.getByText("Boarding Pass.pdf"));
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.keyboard("{Enter}");
    expect(renameDocument).not.toHaveBeenCalled();
  });

  it("does not call renameDocument when name is unchanged", async () => {
    const user = userEvent.setup();
    render(<EventDocRow tripId="trip-1" doc={makeDoc({ id: "doc-1", name: "Boarding Pass.pdf" })} />);
    await user.click(screen.getByText("Boarding Pass.pdf"));
    await user.keyboard("{Enter}");
    expect(renameDocument).not.toHaveBeenCalled();
  });

  // ── View ──────────────────────────────────────────────────────────────────

  it("clicking the view button opens the DocViewer", async () => {
    const user = userEvent.setup();
    render(<EventDocRow tripId="trip-1" doc={makeDoc()} />);
    expect(screen.queryByTestId("doc-viewer")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "View Boarding Pass.pdf" }));
    expect(screen.getByTestId("doc-viewer")).toBeInTheDocument();
  });

  it("closing the DocViewer hides it", async () => {
    const user = userEvent.setup();
    render(<EventDocRow tripId="trip-1" doc={makeDoc()} />);
    await user.click(screen.getByRole("button", { name: "View Boarding Pass.pdf" }));
    expect(screen.getByTestId("doc-viewer")).toBeInTheDocument();
    await user.click(screen.getByTestId("doc-viewer-close"));
    expect(screen.queryByTestId("doc-viewer")).not.toBeInTheDocument();
  });

  // ── Share ─────────────────────────────────────────────────────────────────

  it("clicking share button calls shareDoc with the doc", async () => {
    const user = userEvent.setup();
    render(
      <EventDocRow
        tripId="trip-1"
        doc={makeDoc({ id: "doc-1", name: "Boarding Pass.pdf", url: "https://example.com/doc.pdf" })}
      />
    );
    await user.click(screen.getByRole("button", { name: "Share Boarding Pass.pdf" }));
    expect(shareDoc).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Boarding Pass.pdf", url: "https://example.com/doc.pdf" })
    );
  });

  // ── Promote ───────────────────────────────────────────────────────────────

  it("clicking the promote button calls promoteEventDocToTrip with doc id", async () => {
    const user = userEvent.setup();
    render(<EventDocRow tripId="trip-1" doc={makeDoc({ id: "doc-42" })} />);
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
    render(<EventDocRow tripId="trip-1" doc={makeDoc({ id: "doc-99" })} />);
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
    render(<EventDocRow tripId="trip-1" doc={makeDoc({ id: "doc-err" })} />);
    await user.click(screen.getByRole("button", { name: "Move Boarding Pass.pdf to trip" }));
    expect(promoteEventDocToTrip).toHaveBeenCalledWith("doc-err");
    // Component stays mounted with no unhandled error
    expect(screen.getByRole("button", { name: "Move Boarding Pass.pdf to trip" })).toBeInTheDocument();
  });

  // ── Delete ────────────────────────────────────────────────────────────────

  it("does not open the confirm dialog on initial render", () => {
    render(<EventDocRow tripId="trip-1" doc={makeDoc()} />);
    expect(screen.queryByText("This cannot be undone.")).not.toBeInTheDocument();
  });

  it("opens the confirm dialog when the delete button is clicked", async () => {
    const user = userEvent.setup();
    render(<EventDocRow tripId="trip-1" doc={makeDoc()} />);
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete Boarding Pass.pdf" }));
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("does not call removeDocument when only the trash icon is clicked", async () => {
    const user = userEvent.setup();
    render(<EventDocRow tripId="trip-1" doc={makeDoc()} />);
    await user.click(screen.getByRole("button", { name: "Delete Boarding Pass.pdf" }));
    expect(removeDocument).not.toHaveBeenCalled();
  });

  it("calls removeDocument with doc id after the dialog Delete button is clicked", async () => {
    const user = userEvent.setup();
    render(<EventDocRow tripId="trip-1" doc={makeDoc({ id: "doc-42" })} />);
    await user.click(screen.getByRole("button", { name: "Delete Boarding Pass.pdf" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(removeDocument).toHaveBeenCalledWith({ params: { documentId: "doc-42" }, body: { tripId: "trip-1" } });
  });

  it("does not call removeDocument when Cancel is clicked", async () => {
    const user = userEvent.setup();
    render(<EventDocRow tripId="trip-1" doc={makeDoc()} />);
    await user.click(screen.getByRole("button", { name: "Delete Boarding Pass.pdf" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(removeDocument).not.toHaveBeenCalled();
  });

  it("shows an error message when removeDocument rejects", async () => {
    vi.mocked(removeDocument).mockRejectedValueOnce(new Error("boom"));
    const user = userEvent.setup();
    render(<EventDocRow tripId="trip-1" doc={makeDoc()} />);
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
    render(<EventDocRow tripId="trip-1" doc={makeDoc({ id: "doc-99" })} />);
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

describe("EventDocRow for a viewer", () => {
  function renderAsViewer() {
    return render(
      <TripEditAccessProvider canEdit={false}>
        <EventDocRow tripId="trip-1" doc={makeDoc()} />
      </TripEditAccessProvider>
    );
  }

  it("keeps View and Share but drops Move to trip and Delete", () => {
    renderAsViewer();
    expect(screen.getByRole("button", { name: "View Boarding Pass.pdf" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Share Boarding Pass.pdf" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Move Boarding Pass.pdf to trip" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete Boarding Pass.pdf" })).not.toBeInTheDocument();
  });

  it("shows the name as text that cannot be renamed", async () => {
    const user = userEvent.setup();
    renderAsViewer();
    expect(screen.queryByRole("button", { name: "Boarding Pass.pdf" })).not.toBeInTheDocument();
    await user.click(screen.getByText("Boarding Pass.pdf"));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});

describe("EventDocRow rename limit", () => {
  it("caps the rename input at the shared document name limit", async () => {
    const user = userEvent.setup();
    render(<EventDocRow tripId="trip-1" doc={makeDoc()} />);
    await user.click(screen.getByText("Boarding Pass.pdf"));
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
  render(<EventDocRow tripId="trip-1" doc={makeDoc({ name: "A" })} />);
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
  render(<EventDocRow tripId="trip-1" doc={makeDoc()} />);
  await user.click(screen.getByRole("button", { name: "Delete Boarding Pass.pdf" }));
  await user.click(screen.getByRole("button", { name: "Delete" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument());
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

describe("EventDocRow rename failure and retry", () => {
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
    render(<EventDocRow tripId="trip-1" doc={makeDoc({ name: "A" })} />);
    await renameTo(user, "A", "B");
    expect(await screen.findByRole("button", { name: "A" })).toBeVisible();
  });

  it("restores the last saved name, not the stale prop, when a later rename fails", async () => {
    mutationMocks.rename.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("network down"));
    const user = userEvent.setup();
    render(<EventDocRow tripId="trip-1" doc={makeDoc({ name: "A" })} />);
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
    render(<EventDocRow tripId="trip-1" doc={makeDoc({ name: "A" })} />);
    await renameTo(user, "A", "B");
    expect(await screen.findByRole("button", { name: "A" })).toBeVisible();
  });

  it("sends delete again after a failed attempt", async () => {
    mutationMocks.remove.mockRejectedValueOnce(new Error("network down"));
    const user = userEvent.setup();
    render(<EventDocRow tripId="trip-1" doc={makeDoc()} />);
    await user.click(screen.getByRole("button", { name: "Delete Boarding Pass.pdf" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't delete. Try again.");
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(mutationMocks.remove).toHaveBeenCalledTimes(2));
  });

  it("keeps the name button and rename input at 44px", async () => {
    const user = userEvent.setup();
    render(<EventDocRow tripId="trip-1" doc={makeDoc({ name: "A" })} />);
    expect(screen.getByRole("button", { name: "A" })).toHaveStyle({ minWidth: "44px", minHeight: "44px" });
    await user.click(screen.getByRole("button", { name: "A" }));
    expect(screen.getByRole("textbox", { name: "Document name" })).toHaveStyle({ minHeight: "44px" });
  });
});
