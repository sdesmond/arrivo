import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/use-is-mobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("@/app/(app)/trips/[tripId]/actions", () => ({
  uploadCoverImage: vi.fn(),
}));

vi.mock("./cover-image-picker-search-tab", () => ({
  CoverImagePickerSearchTab: ({
    destinationName,
    center,
    onImageSelected,
  }: {
    destinationName?: string;
    center?: [number, number];
    onImageSelected: (selection: string | { url: string; photographer?: string; photographerUrl?: string }) => void;
  }) => (
    <div data-testid="cover-search-tab" data-destination={destinationName ?? ""} data-center={center?.join(",") ?? ""}>
      <button
        onClick={() =>
          onImageSelected({
            url: "https://images.example.com/search-result.jpg",
            photographer: "Search Photographer",
            photographerUrl: "https://unsplash.com/@search-photographer",
          })
        }
      >
        select-search-image
      </button>
      <button onClick={() => onImageSelected("/api/mapbox/static?lng=1&lat=2")}>select-map-image</button>
    </div>
  ),
}));

import { CoverImagePicker } from "./cover-image-picker";

const defaultProps = {
  tripId: "trip-123",
  destinationName: "Paris",
  center: [2.347, 48.859] as [number, number],
  onImageSelected: vi.fn(),
  onClose: vi.fn(),
};

describe("CoverImagePicker", () => {
  it("renders 4 tabs with Search active by default", () => {
    render(<CoverImagePicker {...defaultProps} />);

    expect(screen.getByRole("tab", { name: /search/i, selected: true })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /upload/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /url/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /custom/i })).toBeInTheDocument();
  });

  it("passes destination and center into the search tab", () => {
    render(<CoverImagePicker {...defaultProps} />);

    expect(screen.getByTestId("cover-search-tab")).toHaveAttribute("data-destination", "Paris");
    expect(screen.getByTestId("cover-search-tab")).toHaveAttribute("data-center", "2.347,48.859");
  });

  it("routes search photo selection through onImageSelected and onClose", async () => {
    const user = userEvent.setup();
    const onImageSelected = vi.fn();
    const onClose = vi.fn();

    render(<CoverImagePicker {...defaultProps} onImageSelected={onImageSelected} onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "select-search-image" }));

    expect(onImageSelected).toHaveBeenCalledWith({
      url: "https://images.example.com/search-result.jpg",
      photographer: "Search Photographer",
      photographerUrl: "https://unsplash.com/@search-photographer",
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("normalizes map string selections into image objects", async () => {
    const user = userEvent.setup();
    const onImageSelected = vi.fn();
    const onClose = vi.fn();

    render(<CoverImagePicker {...defaultProps} onImageSelected={onImageSelected} onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "select-map-image" }));

    expect(onImageSelected).toHaveBeenCalledWith({ url: "/api/mapbox/static?lng=1&lat=2" });
    expect(onClose).toHaveBeenCalled();
  });

  it("renders Upload tab drop zone and URL tab input on tab switch", async () => {
    const user = userEvent.setup();
    render(<CoverImagePicker {...defaultProps} />);

    await user.click(screen.getByRole("tab", { name: /upload/i }));
    expect(screen.getByText(/drop file here or browse/i)).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /url/i }));
    expect(screen.getByRole("button", { name: /apply/i })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /custom/i }));
    expect(screen.getByLabelText(/background color/i)).toBeInTheDocument();
  });

  it("Escape calls onClose", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CoverImagePicker {...defaultProps} onClose={onClose} />);

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("clicking the X button calls onClose", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CoverImagePicker {...defaultProps} onClose={onClose} />);

    await user.click(screen.getByTitle("Close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("opens to custom tab by default when currentCoverImageUrl is a graphic cover", () => {
    render(<CoverImagePicker {...defaultProps} currentCoverImageUrl="graphic:var(--color-amber-400)/dots/mountain" />);

    expect(screen.getByRole("tab", { name: /custom/i, selected: true })).toBeInTheDocument();
  });

  it("opens to search tab by default when currentCoverImageUrl is a photo URL", () => {
    render(<CoverImagePicker {...defaultProps} currentCoverImageUrl="https://images.example.com/photo.jpg" />);

    expect(screen.getByRole("tab", { name: /search/i, selected: true })).toBeInTheDocument();
  });

  it("pre-selects graphic cover values in custom tab when currentCoverImageUrl is a graphic cover", () => {
    render(<CoverImagePicker {...defaultProps} currentCoverImageUrl="graphic:var(--color-amber-400)/dots/mountain" />);

    expect(screen.getByLabelText(/background color/i)).toHaveValue("var(--color-amber-400)");
    expect(screen.getByLabelText(/pattern/i)).toHaveValue("dots");
    expect(screen.getByLabelText(/^icon$/i)).toHaveValue("mountain");
  });
});
