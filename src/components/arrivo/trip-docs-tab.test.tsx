import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TripDocsTab } from "./trip-docs-tab";
import type { Document } from "@/data/types";
import { uploadTripDocument } from "@/lib/api/contract/documents";
import { DOCUMENT_UPLOAD_HINT } from "@/lib/upload-policy";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
  Toaster: () => null,
}));

const { mutate, isPending, endpoints } = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: { value: false },
  endpoints: [] as unknown[],
}));
vi.mock("@/lib/api/use-api-mutation", () => ({
  useApiMutation: (endpoint: unknown) => {
    endpoints.push(endpoint);
    return {
      mutate,
      get isPending() {
        return isPending.value;
      },
      fields: {},
    };
  },
}));

vi.mock("./doc-row", () => ({
  DocRow: ({ doc }: { doc: Document }) => <div data-testid="doc-row">{doc.name}</div>,
}));

const makeDoc = (id: string, name?: string): Document => ({
  id,
  name: name ?? `Doc ${id}`,
  kind: "pdf",
  scope: "trip",
});

function selectFile(file: File) {
  const input = document.getElementById("doc-upload") as HTMLInputElement;
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  fireEvent.change(input);
}

describe("TripDocsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isPending.value = false;
    mutate.mockResolvedValue(undefined);
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

  it("uploads through the API with the trip, a client document id and the file", async () => {
    render(<TripDocsTab tripId="trip-1" docs={[]} />);
    const file = new File(["pdf content"], "test.pdf", { type: "application/pdf" });
    selectFile(file);
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
    expect(mutate.mock.calls[0][0]).toEqual({
      params: { tripId: "trip-1" },
      body: { id: expect.stringMatching(/^[0-9a-f-]{36}$/) },
      file,
    });
  });

  it("sends uploads through the trip document contract", () => {
    render(<TripDocsTab tripId="trip-1" docs={[]} />);
    expect(endpoints).toContain(uploadTripDocument);
  });

  it("keeps one document id across a retry of the same file and gets a new one after success", async () => {
    render(<TripDocsTab tripId="trip-1" docs={[]} />);
    const file = () => new File(["pdf content"], "test.pdf", { type: "application/pdf", lastModified: 1 });
    selectFile(file());
    selectFile(file());
    const [first, second] = mutate.mock.calls.map((call) => call[0].body.id);
    expect(second).toBe(first);
    mutate.mock.calls[1][1].onSuccess();
    selectFile(file());
    expect(mutate.mock.calls[2][0].body.id).not.toBe(first);
  });

  it("uses a new document id for a different file", () => {
    render(<TripDocsTab tripId="trip-1" docs={[]} />);
    selectFile(new File(["a"], "a.pdf", { type: "application/pdf" }));
    selectFile(new File(["bb"], "b.pdf", { type: "application/pdf" }));
    expect(mutate.mock.calls[1][0].body.id).not.toBe(mutate.mock.calls[0][0].body.id);
  });

  it("dims the Add control while an upload is pending", () => {
    isPending.value = true;
    render(<TripDocsTab tripId="trip-1" docs={[]} />);
    expect(screen.getByText("Add document").closest("label")).toHaveStyle({ opacity: "0.5" });
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

  it("shows file type and size hint text when there is no error", () => {
    render(<TripDocsTab tripId="trip-1" docs={[]} />);
    expect(screen.getByText(DOCUMENT_UPLOAD_HINT)).toBeInTheDocument();
  });

  it("does not upload when the selected file exceeds the size limit", async () => {
    render(<TripDocsTab tripId="trip-1" docs={[]} />);
    const input = document.getElementById("doc-upload") as HTMLInputElement;
    const oversized = new File(["x".repeat(100)], "huge.pdf", { type: "application/pdf" });
    Object.defineProperty(oversized, "size", { value: 25 * 1024 * 1024 + 1 });
    Object.defineProperty(input, "files", { value: [oversized], writable: false });
    fireEvent.change(input);
    await waitFor(() => {
      expect(mutate).not.toHaveBeenCalled();
    });
  });

  it("calls toast.error when the selected file exceeds the size limit", async () => {
    render(<TripDocsTab tripId="trip-1" docs={[]} />);
    const input = document.getElementById("doc-upload") as HTMLInputElement;
    const oversized = new File(["x".repeat(100)], "huge.pdf", { type: "application/pdf" });
    Object.defineProperty(oversized, "size", { value: 25 * 1024 * 1024 + 1 });
    Object.defineProperty(input, "files", { value: [oversized], writable: false });
    fireEvent.change(input);
    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("File is too large. Max 25.0 MB.");
    });
  });

  it("rejects unsupported file types before uploading", async () => {
    render(<TripDocsTab tripId="trip-1" docs={[]} />);
    const input = document.getElementById("doc-upload") as HTMLInputElement;
    const unsupported = new File(["word content"], "notes.docx", { type: "application/msword" });
    Object.defineProperty(input, "files", { value: [unsupported], writable: false });

    fireEvent.change(input);

    await waitFor(() => {
      expect(mutate).not.toHaveBeenCalled();
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
        "Unsupported file type. Choose PDF, JPG, PNG, WEBP, or HEIC."
      );
    });
  });

  it("always shows the hint text regardless of errors", async () => {
    render(<TripDocsTab tripId="trip-1" docs={[]} />);
    const input = document.getElementById("doc-upload") as HTMLInputElement;
    const oversized = new File(["x".repeat(100)], "huge.pdf", { type: "application/pdf" });
    Object.defineProperty(oversized, "size", { value: 25 * 1024 * 1024 + 1 });
    Object.defineProperty(input, "files", { value: [oversized], writable: false });
    fireEvent.change(input);
    await waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalled());
    expect(screen.getByText(DOCUMENT_UPLOAD_HINT)).toBeInTheDocument();
  });
});
