// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/use-is-mobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("@/app/(app)/trips/actions", () => ({
  searchCoverImages: vi.fn(),
}));

vi.mock("@/app/(app)/trips/[tripId]/actions", () => ({
  uploadCoverImage: vi.fn(),
}));

const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => toastError(...args), success: vi.fn() },
}));

import { CoverImagePicker } from "./cover-image-picker";
import { searchCoverImages } from "@/app/(app)/trips/actions";

const parisImages = [
  { id: "img-1", url: "https://unsplash.com/photo-1.jpg", photographer: "Alice", alt: "A scenic mountain" },
  { id: "img-2", url: "https://unsplash.com/photo-2.jpg", photographer: "Bob", alt: "A city skyline" },
];

const defaultProps = {
  tripId: "trip-123",
  destinationName: "Paris",
  center: [2.347, 48.859] as [number, number],
  onImageSelected: vi.fn(),
  onClose: vi.fn(),
};

describe("CoverImagePicker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(searchCoverImages).mockResolvedValue(parisImages);
  });

  describe("tab layout", () => {
    it("renders 4 tabs with Search active by default", async () => {
      render(<CoverImagePicker {...defaultProps} />);
      await waitFor(() => expect(searchCoverImages).toHaveBeenCalled());

      expect(screen.getByRole("tab", { name: /search/i, selected: true })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /upload/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /url/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /custom/i })).toBeInTheDocument();
    });

    it("renders Upload tab drop zone and URL tab input on tab switch", async () => {
      const user = userEvent.setup();
      render(<CoverImagePicker {...defaultProps} />);
      await waitFor(() => expect(searchCoverImages).toHaveBeenCalled());

      await user.click(screen.getByRole("tab", { name: /upload/i }));
      expect(screen.getByText(/drop file here or browse/i)).toBeInTheDocument();

      await user.click(screen.getByRole("tab", { name: /url/i }));
      expect(screen.getByRole("button", { name: /apply/i })).toBeInTheDocument();

      await user.click(screen.getByRole("tab", { name: /custom/i }));
      expect(screen.getByText("Custom tab content")).toBeInTheDocument();
    });
  });

  describe("Search tab — API call", () => {
    it("calls searchCoverImages on mount when destinationName is provided", async () => {
      render(<CoverImagePicker {...defaultProps} />);
      await waitFor(() => expect(searchCoverImages).toHaveBeenCalledWith("Paris"));
    });

    it("does not call searchCoverImages when destinationName is absent", () => {
      render(<CoverImagePicker {...defaultProps} destinationName={undefined} />);
      expect(searchCoverImages).not.toHaveBeenCalled();
    });

    it("shows loading state while fetching", async () => {
      let resolve: (v: typeof parisImages) => void = () => {};
      vi.mocked(searchCoverImages).mockReturnValueOnce(
        new Promise((r) => {
          resolve = r;
        })
      );

      render(<CoverImagePicker {...defaultProps} />);
      expect(screen.getByRole("status", { name: /loading images/i })).toBeInTheDocument();

      resolve(parisImages);
      await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    });

    it("clears prior results when destinationName is removed", async () => {
      const { rerender } = render(<CoverImagePicker {...defaultProps} />);
      await waitFor(() => expect(screen.getByAltText("A scenic mountain")).toBeInTheDocument());

      rerender(<CoverImagePicker {...defaultProps} destinationName={undefined} center={undefined} />);

      expect(screen.queryByAltText("A scenic mountain")).not.toBeInTheDocument();
      expect(screen.getByText("No images found")).toBeInTheDocument();
    });

    it("ignores stale search results from an older destination", async () => {
      let resolveParis: ((images: typeof parisImages) => void) | undefined;
      const romeImages = [
        { id: "rome-1", url: "https://unsplash.com/rome.jpg", photographer: "Carla", alt: "A Roman plaza" },
      ];

      vi.mocked(searchCoverImages)
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveParis = resolve;
            })
        )
        .mockResolvedValueOnce(romeImages);

      const { rerender } = render(<CoverImagePicker {...defaultProps} />);
      rerender(<CoverImagePicker {...defaultProps} destinationName="Rome" center={[12.4964, 41.9028]} />);

      await waitFor(() => expect(screen.getByAltText("A Roman plaza")).toBeInTheDocument());

      resolveParis?.(parisImages);
      await waitFor(() => expect(screen.queryByAltText("A scenic mountain")).not.toBeInTheDocument());
    });
  });

  describe("Search tab — grid", () => {
    it("renders map tile at position 0 when center is provided", async () => {
      render(<CoverImagePicker {...defaultProps} />);
      const mapImg = await screen.findByAltText(/map view of paris/i);
      expect(mapImg).toBeInTheDocument();
      expect(mapImg).toHaveAttribute("src", "/api/mapbox/static?lng=2.347&lat=48.859");

      const mapButton = mapImg.closest("button");
      expect(mapButton?.parentElement?.firstElementChild).toBe(mapButton);
    });

    it("does not render map tile when center is absent", async () => {
      render(<CoverImagePicker {...defaultProps} center={undefined} />);
      await waitFor(() => expect(searchCoverImages).toHaveBeenCalled());

      expect(screen.queryByAltText(/map view/i)).not.toBeInTheDocument();
    });

    it("renders Unsplash photo thumbnails after results load", async () => {
      render(<CoverImagePicker {...defaultProps} />);
      await waitFor(() => {
        expect(screen.getByAltText("A scenic mountain")).toBeInTheDocument();
        expect(screen.getByAltText("A city skyline")).toBeInTheDocument();
      });
    });

    it("photo buttons have title set to photographer name", async () => {
      render(<CoverImagePicker {...defaultProps} />);
      await waitFor(() => {
        expect(screen.getByTitle("Alice")).toBeInTheDocument();
        expect(screen.getByTitle("Bob")).toBeInTheDocument();
      });
    });

    it("removes the map option and shows an empty state when the tile fails and no photos are available", async () => {
      vi.mocked(searchCoverImages).mockResolvedValueOnce([]);
      render(<CoverImagePicker {...defaultProps} />);
      const mapImg = await screen.findByAltText(/map view of paris/i);

      fireEvent.error(mapImg);

      await waitFor(() => expect(screen.queryByTitle("Map view")).not.toBeInTheDocument());
      expect(screen.getByText("No images found")).toBeInTheDocument();
    });
  });

  describe("image selection", () => {
    it("clicking an Unsplash result calls onImageSelected with its URL", async () => {
      const user = userEvent.setup();
      const onImageSelected = vi.fn();
      render(<CoverImagePicker {...defaultProps} onImageSelected={onImageSelected} />);
      await waitFor(() => expect(screen.getByTitle("Alice")).toBeInTheDocument());

      await user.click(screen.getByTitle("Alice"));
      expect(onImageSelected).toHaveBeenCalledWith("https://unsplash.com/photo-1.jpg");
    });

    it("clicking an Unsplash result calls onClose", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      render(<CoverImagePicker {...defaultProps} onClose={onClose} />);
      await waitFor(() => expect(screen.getByTitle("Alice")).toBeInTheDocument());

      await user.click(screen.getByTitle("Alice"));
      expect(onClose).toHaveBeenCalled();
    });

    it("clicking the map tile calls onImageSelected with the tile URL", async () => {
      const user = userEvent.setup();
      const onImageSelected = vi.fn();
      render(<CoverImagePicker {...defaultProps} onImageSelected={onImageSelected} />);
      const mapBtn = await screen.findByTitle("Map view");
      await user.click(mapBtn);
      expect(onImageSelected).toHaveBeenCalledWith("/api/mapbox/static?lng=2.347&lat=48.859");
    });
  });

  describe("error state", () => {
    it("shows toast.error when searchCoverImages throws", async () => {
      vi.mocked(searchCoverImages).mockRejectedValueOnce(new Error("API down"));
      render(<CoverImagePicker {...defaultProps} />);
      await waitFor(() => expect(toastError).toHaveBeenCalledWith("Could not load images"));
    });

    it("shows empty state when API fails", async () => {
      vi.mocked(searchCoverImages).mockRejectedValueOnce(new Error("API down"));
      render(<CoverImagePicker {...defaultProps} center={undefined} />);
      await waitFor(() => expect(screen.getByText("No images found")).toBeInTheDocument());
    });

    it("hides the map tile and shows an empty state when the API fails with center coordinates", async () => {
      vi.mocked(searchCoverImages).mockRejectedValueOnce(new Error("API down"));
      render(<CoverImagePicker {...defaultProps} />);

      await waitFor(() => expect(screen.getByText("No images found")).toBeInTheDocument());
      expect(screen.queryByTitle("Map view")).not.toBeInTheDocument();
    });

    it("shows empty state when no destinationName and no center", () => {
      render(<CoverImagePicker {...defaultProps} destinationName={undefined} center={undefined} />);
      expect(screen.getByText("No images found")).toBeInTheDocument();
    });
  });

  describe("keyboard / close", () => {
    it("Escape (dialog close) calls onClose", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      render(<CoverImagePicker {...defaultProps} onClose={onClose} />);
      await waitFor(() => expect(searchCoverImages).toHaveBeenCalled());

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
});
