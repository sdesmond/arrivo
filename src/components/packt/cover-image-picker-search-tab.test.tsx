import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CoverImageSearchResult } from "@/data/types";

const mockSearchCoverImages = vi.fn();
const mockResolveDestinationCenter = vi.fn();

vi.mock("@/app/(app)/trips/cover-image-search-actions", () => ({
  searchCoverImages: (...args: unknown[]) => mockSearchCoverImages(...args),
  resolveDestinationCenter: (...args: unknown[]) => mockResolveDestinationCenter(...args),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

import { CoverImagePickerSearchTab } from "./cover-image-picker-search-tab";
import { toast } from "sonner";

function makeImage(id: string): CoverImageSearchResult {
  return {
    id,
    url: `https://img.example.com/${id}.jpg`,
    photographer: `Photographer ${id}`,
    alt: `Alt ${id}`,
  };
}

function makeImages(count: number): CoverImageSearchResult[] {
  return Array.from({ length: count }, (_, i) => makeImage(`img-${i + 1}`));
}

const defaultProps = {
  onImageSelected: vi.fn(),
};

describe("CoverImagePickerSearchTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchCoverImages.mockResolvedValue([]);
    mockResolveDestinationCenter.mockResolvedValue(null);
  });

  it("does not call searchCoverImages when destinationName is absent", async () => {
    render(<CoverImagePickerSearchTab {...defaultProps} />);
    await act(async () => {});
    expect(mockSearchCoverImages).not.toHaveBeenCalled();
  });

  it("shows a loading spinner while images are fetching", async () => {
    let resolveLoad!: (v: CoverImageSearchResult[]) => void;
    mockResolveDestinationCenter.mockResolvedValue(null);
    mockSearchCoverImages.mockReturnValue(new Promise((res) => (resolveLoad = res)));

    render(<CoverImagePickerSearchTab {...defaultProps} destinationName="Paris" />);

    await waitFor(() => {
      expect(screen.getByRole("status", { name: /loading images/i })).toBeInTheDocument();
    });

    await act(async () => {
      resolveLoad([]);
    });
  });

  it("calls searchCoverImages with trimmed destination name on page 1", async () => {
    mockSearchCoverImages.mockResolvedValue(makeImages(2));

    render(<CoverImagePickerSearchTab {...defaultProps} destinationName="  Paris  " />);

    await waitFor(() => {
      expect(mockSearchCoverImages).toHaveBeenCalledWith("Paris", expect.objectContaining({ page: 1 }));
    });
  });

  it("calls resolveDestinationCenter when no center prop is provided", async () => {
    render(<CoverImagePickerSearchTab {...defaultProps} destinationName="Paris" />);

    await waitFor(() => {
      expect(mockResolveDestinationCenter).toHaveBeenCalledWith("Paris");
    });
  });

  it("skips resolveDestinationCenter when center prop is provided", async () => {
    const center: [number, number] = [2.347, 48.859];
    mockSearchCoverImages.mockResolvedValue([]);

    render(<CoverImagePickerSearchTab {...defaultProps} destinationName="Paris" center={center} />);

    await waitFor(() => {
      expect(mockSearchCoverImages).toHaveBeenCalled();
    });
    expect(mockResolveDestinationCenter).not.toHaveBeenCalled();
  });

  it("shows map tile when center prop is provided", async () => {
    const center: [number, number] = [2.347, 48.859];
    mockSearchCoverImages.mockResolvedValue([]);

    render(<CoverImagePickerSearchTab {...defaultProps} destinationName="Paris" center={center} />);

    await waitFor(() => {
      expect(screen.getByTitle("Map view")).toBeInTheDocument();
    });
  });

  it("shows map tile when center is resolved from destination name", async () => {
    mockResolveDestinationCenter.mockResolvedValue([2.347, 48.859]);
    mockSearchCoverImages.mockResolvedValue([]);

    render(<CoverImagePickerSearchTab {...defaultProps} destinationName="Paris" />);

    await waitFor(() => {
      expect(screen.getByTitle("Map view")).toBeInTheDocument();
    });
  });

  it("does not show map tile when center cannot be resolved", async () => {
    mockResolveDestinationCenter.mockResolvedValue(null);
    mockSearchCoverImages.mockResolvedValue([]);

    render(<CoverImagePickerSearchTab {...defaultProps} destinationName="Paris" />);

    await waitFor(() => {
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
    expect(screen.queryByTitle("Map view")).not.toBeInTheDocument();
  });

  it("map tile button URL includes the provided coordinates", async () => {
    const center: [number, number] = [2.347, 48.859];
    const onImageSelected = vi.fn();
    mockSearchCoverImages.mockResolvedValue([]);

    const user = userEvent.setup();
    render(<CoverImagePickerSearchTab destinationName="Paris" center={center} onImageSelected={onImageSelected} />);

    await waitFor(() => {
      expect(screen.getByTitle("Map view")).toBeInTheDocument();
    });

    await user.click(screen.getByTitle("Map view"));
    expect(onImageSelected).toHaveBeenCalledWith(expect.stringContaining("/api/mapbox/static"));
    expect(onImageSelected).toHaveBeenCalledWith(expect.stringContaining("lng=2.347"));
    expect(onImageSelected).toHaveBeenCalledWith(expect.stringContaining("lat=48.859"));
  });

  it("renders image buttons after a successful load", async () => {
    mockSearchCoverImages.mockResolvedValue([makeImage("paris-1"), makeImage("paris-2")]);

    render(<CoverImagePickerSearchTab {...defaultProps} destinationName="Paris" />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Alt paris-1" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Alt paris-2" })).toBeInTheDocument();
    });
  });

  it("calls onImageSelected with the image URL when a photo is clicked", async () => {
    const onImageSelected = vi.fn();
    mockSearchCoverImages.mockResolvedValue([makeImage("test-img")]);

    const user = userEvent.setup();
    render(<CoverImagePickerSearchTab destinationName="Paris" onImageSelected={onImageSelected} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Alt test-img" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Alt test-img" }));
    expect(onImageSelected).toHaveBeenCalledWith("https://img.example.com/test-img.jpg");
  });

  it("shows 'No images found' when search returns empty results and there is no map tile", async () => {
    mockResolveDestinationCenter.mockResolvedValue(null);
    mockSearchCoverImages.mockResolvedValue([]);

    render(<CoverImagePickerSearchTab {...defaultProps} destinationName="Paris" />);

    await waitFor(() => {
      expect(screen.getByText("No images found")).toBeInTheDocument();
    });
  });

  it("shows error toast and empty state when searchCoverImages rejects", async () => {
    mockSearchCoverImages.mockRejectedValue(new Error("network error"));

    render(<CoverImagePickerSearchTab {...defaultProps} destinationName="Paris" />);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Could not load images");
      expect(screen.getByText("No images found")).toBeInTheDocument();
    });
  });

  it("hides an image from the grid when its onError fires", async () => {
    mockSearchCoverImages.mockResolvedValue([makeImage("good"), makeImage("broken")]);

    render(<CoverImagePickerSearchTab {...defaultProps} destinationName="Paris" />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Alt broken" })).toBeInTheDocument();
    });

    act(() => {
      fireEvent.error(screen.getByAltText("Alt broken"));
    });

    expect(screen.queryByRole("button", { name: "Alt broken" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Alt good" })).toBeInTheDocument();
  });

  it("hides the map tile when the map tile image fails to load", async () => {
    const center: [number, number] = [2.347, 48.859];
    mockSearchCoverImages.mockResolvedValue([]);

    render(<CoverImagePickerSearchTab {...defaultProps} destinationName="Paris" center={center} />);

    await waitFor(() => {
      expect(screen.getByTitle("Map view")).toBeInTheDocument();
    });

    const callsBefore = mockSearchCoverImages.mock.calls.length;

    act(() => {
      fireEvent.error(screen.getByAltText("Map view of Paris"));
    });

    await waitFor(() => {
      expect(screen.queryByTitle("Map view")).not.toBeInTheDocument();
    });
    expect(mockSearchCoverImages.mock.calls.length).toBe(callsBefore);
  });

  it("resets and reloads when destinationName changes", async () => {
    mockSearchCoverImages.mockResolvedValue(makeImages(2));

    const { rerender } = render(<CoverImagePickerSearchTab {...defaultProps} destinationName="Paris" />);

    await waitFor(() => {
      expect(mockSearchCoverImages).toHaveBeenCalledWith("Paris", expect.anything());
    });

    rerender(<CoverImagePickerSearchTab {...defaultProps} destinationName="Tokyo" />);

    await waitFor(() => {
      expect(mockSearchCoverImages).toHaveBeenCalledWith("Tokyo", expect.anything());
    });
  });

  it("clears the image grid when destinationName is cleared", async () => {
    mockSearchCoverImages.mockResolvedValue(makeImages(2));

    const { rerender } = render(<CoverImagePickerSearchTab {...defaultProps} destinationName="Paris" />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Alt img-1" })).toBeInTheDocument();
    });

    rerender(<CoverImagePickerSearchTab {...defaultProps} destinationName="" />);

    await act(async () => {});
    expect(screen.queryByRole("button", { name: "Alt img-1" })).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
