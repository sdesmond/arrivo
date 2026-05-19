// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TripDocsTab } from "./trip-docs-tab";
import type { Document } from "@/data/types";
import { uploadDocument } from "@/app/(app)/trips/[tripId]/actions";

vi.mock("@/app/(app)/trips/[tripId]/actions", () => ({
  uploadDocument: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./doc-row", () => ({
  DocRow: ({ doc }: { doc: Document }) => <div data-testid="doc-row">{doc.name}</div>,
}));

const makeDoc = (id: string): Document => ({
  id,
  name: `Doc ${id}`,
  kind: "pdf",
  scope: "trip",
  offline: false,
});

describe("TripDocsTab", () => {
  it("renders empty state message when docs array is empty", () => {
    render(<TripDocsTab tripId="trip-1" docs={[]} />);
    expect(
      screen.getByText("Add your first trip document — boarding passes, insurance, visas, and more.")
    ).toBeInTheDocument();
  });

  it("does not render empty state when docs are present", () => {
    render(<TripDocsTab tripId="trip-1" docs={[makeDoc("1")]} />);
    expect(
      screen.queryByText("Add your first trip document — boarding passes, insurance, visas, and more.")
    ).not.toBeInTheDocument();
  });

  it("renders a DocRow for each document", () => {
    render(<TripDocsTab tripId="trip-1" docs={[makeDoc("1"), makeDoc("2"), makeDoc("3")]} />);
    expect(screen.getAllByTestId("doc-row")).toHaveLength(3);
  });

  it("renders the Add label with visible text", () => {
    render(<TripDocsTab tripId="trip-1" docs={[]} />);
    expect(screen.getByText("Add")).toBeInTheDocument();
  });

  it("file input accepts the correct file types", () => {
    render(<TripDocsTab tripId="trip-1" docs={[]} />);
    const input = document.getElementById("doc-upload") as HTMLInputElement;
    expect(input.accept).toBe(".pdf,.jpg,.jpeg,.png,.webp,.heic");
  });

  it("file input is associated with the label via htmlFor", () => {
    render(<TripDocsTab tripId="trip-1" docs={[]} />);
    const label = screen.getByText("Add").closest("label");
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
});
