import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CoverImageSearchResult } from "@/data/types";
import { CoverImageGrid, type CoverImageGridProps } from "./cover-image-grid";

const image: CoverImageSearchResult = {
  id: "img-1",
  url: "https://img.example.com/img-1.jpg",
  photographer: "Ada",
  photographerUrl: "https://unsplash.com/@ada",
  alt: "A canal",
};

function renderGrid(overrides: Partial<CoverImageGridProps> = {}) {
  const props: CoverImageGridProps = {
    mapTileUrl: "/api/mapbox/static?lng=2&lat=48",
    mapLabel: "Map view of Paris",
    images: [image],
    hasError: false,
    onImageSelected: vi.fn(),
    onMapError: vi.fn(),
    onImageError: vi.fn(),
    ...overrides,
  };
  render(<CoverImageGrid {...props} />);
  return props;
}

describe("CoverImageGrid", () => {
  it("selects the map tile by its URL", () => {
    const props = renderGrid();

    fireEvent.click(screen.getByRole("button", { name: "Map view of Paris" }));

    expect(screen.getByTitle("Map view")).toBeInTheDocument();
    expect(props.onImageSelected).toHaveBeenCalledWith("/api/mapbox/static?lng=2&lat=48");
  });

  it("selects a photo with its photographer metadata", () => {
    const props = renderGrid();

    fireEvent.click(screen.getByRole("button", { name: "A canal" }));

    expect(props.onImageSelected).toHaveBeenCalledWith({
      url: image.url,
      photographer: "Ada",
      photographerUrl: "https://unsplash.com/@ada",
    });
  });

  it("labels a photo with no description by its photographer", () => {
    renderGrid({ images: [{ ...image, alt: "" }] });

    expect(screen.getByRole("button", { name: "Ada" })).toBeInTheDocument();
  });

  it("reports a map tile that fails to load", () => {
    const props = renderGrid();

    fireEvent.error(screen.getByAltText("Map view of Paris"));

    expect(props.onMapError).toHaveBeenCalledOnce();
  });

  it("reports a photo that fails to load by its ID", () => {
    const props = renderGrid();

    fireEvent.error(screen.getByAltText("A canal"));

    expect(props.onImageError).toHaveBeenCalledWith("img-1");
  });

  it("shows the empty state when there is neither a photo nor a map tile", () => {
    renderGrid({ images: [], mapTileUrl: null });

    expect(screen.getByText("No images found")).toBeInTheDocument();
    expect(screen.queryByTitle("Map view")).not.toBeInTheDocument();
  });

  it("shows no empty state when only the map tile is available", () => {
    renderGrid({ images: [] });

    expect(screen.queryByText("No images found")).not.toBeInTheDocument();
  });

  it("hides the photos and shows the empty state after a load error", () => {
    renderGrid({ hasError: true, mapTileUrl: null });

    expect(screen.queryByRole("button", { name: "A canal" })).not.toBeInTheDocument();
    expect(screen.getByText("No images found")).toBeInTheDocument();
  });
});
