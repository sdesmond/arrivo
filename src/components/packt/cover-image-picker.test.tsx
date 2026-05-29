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
    onImageSelected: (url: string) => void;
  }) => (
    <div data-testid="cover-search-tab" data-destination={destinationName ?? ""} data-center={center?.join(",") ?? ""}>
      <button onClick={() => onImageSelected("https://images.example.com/search-result.jpg")}>
        select-search-image
      </button>
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

  it("routes search-tab image selection through onImageSelected and onClose", async () => {
    const user = userEvent.setup();
    const onImageSelected = vi.fn();
    const onClose = vi.fn();

    render(<CoverImagePicker {...defaultProps} onImageSelected={onImageSelected} onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "select-search-image" }));

    expect(onImageSelected).toHaveBeenCalledWith("https://images.example.com/search-result.jpg");
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
});
