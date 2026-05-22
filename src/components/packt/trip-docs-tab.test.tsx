// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TripDocsTab } from "./trip-docs-tab";
import type { Document } from "@/data/types";
import { uploadDocument, markAllDocsOffline } from "@/app/(app)/trips/[tripId]/actions";
import { MAX_UPLOAD_BYTES } from "@/lib/utils";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
  Toaster: () => null,
}));

vi.mock("@/app/(app)/trips/[tripId]/actions", () => ({
  uploadDocument: vi.fn().mockResolvedValue(undefined),
  markAllDocsOffline: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./doc-row", () => ({
  DocRow: ({ doc }: { doc: Document }) => <div data-testid="doc-row">{doc.name}</div>,
}));

const makeDoc = (id: string, name?: string): Document => ({
  id,
  name: name ?? `Doc ${id}`,
  kind: "pdf",
  scope: "trip",
  offline: false,
});

describe("TripDocsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders empty state message when docs array is empty", () => {
    render(<TripDocsTab tripId="trip-1" docs={[]} />);
    expect(
      screen.getByText("Add your first trip document — boarding passes, insurance, visas, and more.")
    ).toBeInTheDocument();
    expect(screen.getByText("No documents yet")).toBeInTheDocument();
  });

  it("does not render empty state when docs are present", () => {
    render(<TripDocsTab tripId="trip-1" docs={[makeDoc("1")]} />);
    expect(
      screen.queryByText("Add your first trip document — boarding passes, insurance, visas, and more.")
    ).not.toBeInTheDocument();
    expect(screen.queryByText("No documents yet")).not.toBeInTheDocument();
  });

  it("renders a DocRow for each document", () => {
    render(<TripDocsTab tripId="trip-1" docs={[makeDoc("1"), makeDoc("2"), makeDoc("3")]} />);
    expect(screen.getAllByTestId("doc-row")).toHaveLength(3);
  });

  it("renders the Add label with visible text", () => {
    render(<TripDocsTab tripId="trip-1" docs={[]} />);
    expect(screen.getByText("Add document")).toBeInTheDocument();
  });

  it("file input accepts the correct file types", () => {
    render(<TripDocsTab tripId="trip-1" docs={[]} />);
    const input = document.getElementById("doc-upload") as HTMLInputElement;
    expect(input.accept).toBe(".pdf,.jpg,.jpeg,.png,.webp,.heic");
  });

  it("file input is associated with the label via htmlFor", () => {
    render(<TripDocsTab tripId="trip-1" docs={[]} />);
    const label = screen.getByText("Add document").closest("label");
    expect(label).toHaveAttribute("for", "doc-upload");
  });

  it("calls uploadDocument when a file is selected", async () => {
    render(<TripDocsTab tripId="trip-1" docs={[]} />);
    const input = document.getElementById("doc-upload") as HTMLInputElement;
    const file = new File(["pdf content"], "test.pdf", { type: "application/pdf" });
    Object.defineProperty(input, "files", { value: [file], writable: false });
    fireEvent.change(input);
    await waitFor(() => {
      expect(vi.mocked(uploadDocument)).toHaveBeenCalledWith("trip-1", expect.any(FormData));
    });
  });

  it("renders a visually hidden label 'Search documents' associated with the search input", () => {
    render(<TripDocsTab tripId="trip-1" docs={[makeDoc("1")]} />);
    const label = document.querySelector('label[for="doc-search"]');
    expect(label).toBeInTheDocument();
    expect(label?.textContent).toBe("Search documents");
  });

  it("filters docs to only those whose names contain the query (case-insensitive)", async () => {
    const user = userEvent.setup();
    const docs = [makeDoc("1", "boarding-pass.pdf"), makeDoc("2", "visa.pdf")];
    render(<TripDocsTab tripId="trip-1" docs={docs} />);
    await user.type(screen.getByRole("searchbox"), "BOARDING");
    expect(screen.getByText("boarding-pass.pdf")).toBeInTheDocument();
    expect(screen.queryByText("visa.pdf")).not.toBeInTheDocument();
  });

  it("restores all docs when search query is cleared", async () => {
    const user = userEvent.setup();
    const docs = [makeDoc("1", "boarding-pass.pdf"), makeDoc("2", "visa.pdf")];
    render(<TripDocsTab tripId="trip-1" docs={docs} />);
    const search = screen.getByRole("searchbox");
    await user.type(search, "boarding");
    await user.clear(search);
    expect(screen.getByText("boarding-pass.pdf")).toBeInTheDocument();
    expect(screen.getByText("visa.pdf")).toBeInTheDocument();
  });

  it("does not render the Save offline button when docs array is empty", () => {
    render(<TripDocsTab tripId="trip-1" docs={[]} />);
    expect(screen.queryByRole("button", { name: /save offline/i })).not.toBeInTheDocument();
  });

  it("renders the Save offline button when at least one doc is present", () => {
    render(<TripDocsTab tripId="trip-1" docs={[makeDoc("1")]} />);
    expect(screen.getByRole("button", { name: /save offline/i })).toBeInTheDocument();
  });

  it("calls markAllDocsOffline with tripId when Save offline button is clicked", async () => {
    const user = userEvent.setup();
    render(<TripDocsTab tripId="trip-99" docs={[makeDoc("1")]} />);
    await user.click(screen.getByRole("button", { name: /save offline/i }));
    await waitFor(() => {
      expect(vi.mocked(markAllDocsOffline)).toHaveBeenCalledWith("trip-99");
    });
  });

  it("shows file type and size hint text when there is no error", () => {
    render(<TripDocsTab tripId="trip-1" docs={[]} />);
    expect(screen.getByText("PDF, JPG, PNG, WEBP, HEIC · max 25 MB")).toBeInTheDocument();
  });

  it("does not call uploadDocument when the selected file exceeds the size limit", async () => {
    render(<TripDocsTab tripId="trip-1" docs={[]} />);
    const input = document.getElementById("doc-upload") as HTMLInputElement;
    const oversized = new File(["x".repeat(100)], "huge.pdf", { type: "application/pdf" });
    Object.defineProperty(oversized, "size", { value: MAX_UPLOAD_BYTES + 1 });
    Object.defineProperty(input, "files", { value: [oversized], writable: false });
    fireEvent.change(input);
    await waitFor(() => {
      expect(vi.mocked(uploadDocument)).not.toHaveBeenCalled();
    });
  });

  it("calls toast.error when the selected file exceeds the size limit", async () => {
    render(<TripDocsTab tripId="trip-1" docs={[]} />);
    const input = document.getElementById("doc-upload") as HTMLInputElement;
    const oversized = new File(["x".repeat(100)], "huge.pdf", { type: "application/pdf" });
    Object.defineProperty(oversized, "size", { value: MAX_UPLOAD_BYTES + 1 });
    Object.defineProperty(input, "files", { value: [oversized], writable: false });
    fireEvent.change(input);
    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("File is too large. Max 25 MB.");
    });
  });

  it("always shows the hint text regardless of errors", async () => {
    render(<TripDocsTab tripId="trip-1" docs={[]} />);
    const input = document.getElementById("doc-upload") as HTMLInputElement;
    const oversized = new File(["x".repeat(100)], "huge.pdf", { type: "application/pdf" });
    Object.defineProperty(oversized, "size", { value: MAX_UPLOAD_BYTES + 1 });
    Object.defineProperty(input, "files", { value: [oversized], writable: false });
    fireEvent.change(input);
    await waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalled());
    expect(screen.getByText("PDF, JPG, PNG, WEBP, HEIC · max 25 MB")).toBeInTheDocument();
  });

  it("calls toast.error when uploadDocument rejects", async () => {
    vi.mocked(uploadDocument).mockRejectedValueOnce(new Error("server error"));
    render(<TripDocsTab tripId="trip-1" docs={[]} />);
    const input = document.getElementById("doc-upload") as HTMLInputElement;
    const file = new File(["pdf content"], "test.pdf", { type: "application/pdf" });
    Object.defineProperty(input, "files", { value: [file], writable: false });
    fireEvent.change(input);
    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Upload failed. Please try again.");
    });
  });
});
