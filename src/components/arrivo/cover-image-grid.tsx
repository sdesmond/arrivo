"use client";

import type { CoverImageSearchResult, CoverImageSelection } from "@/data/types";

export interface CoverImageGridProps {
  mapTileUrl: string | null;
  /** Accessible name of the map tile. */
  mapLabel: string;
  images: CoverImageSearchResult[];
  hasError: boolean;
  onImageSelected: (selection: string | CoverImageSelection) => void;
  onMapError: () => void;
  onImageError: (imageId: string) => void;
}

export function CoverImageGrid({
  mapTileUrl,
  mapLabel,
  images,
  hasError,
  onImageSelected,
  onMapError,
  onImageError,
}: CoverImageGridProps) {
  return (
    <div
      data-testid="cover-search-grid"
      style={{
        display: "grid",
        gap: 8,
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
      }}
    >
      {mapTileUrl ? (
        <button
          type="button"
          title="Map view"
          aria-label={mapLabel}
          onClick={() => onImageSelected(mapTileUrl)}
          style={{
            position: "relative",
            aspectRatio: "1 / 1",
            border: "1px solid var(--line)",
            borderRadius: 4,
            overflow: "hidden",
            background: "none",
            cursor: "pointer",
            padding: 0,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mapTileUrl}
            alt={mapLabel}
            style={{ display: "block", height: "100%", objectFit: "cover", width: "100%" }}
            onError={onMapError}
          />
          <span
            style={{
              position: "absolute",
              bottom: 4,
              left: 4,
              fontSize: 11,
              color: "var(--fg)",
              background: "var(--surface)",
              padding: "1px 4px",
              borderRadius: 2,
              pointerEvents: "none",
            }}
          >
            Map view
          </span>
        </button>
      ) : null}
      {!hasError
        ? images.map((item) => (
            <button
              key={item.id}
              type="button"
              title={item.photographer}
              aria-label={item.alt || item.photographer}
              onClick={() =>
                onImageSelected({
                  url: item.url,
                  photographer: item.photographer,
                  photographerUrl: item.photographerUrl,
                })
              }
              style={{
                aspectRatio: "1 / 1",
                border: "1px solid var(--line)",
                padding: 0,
                cursor: "pointer",
                borderRadius: 4,
                overflow: "hidden",
                background: "none",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.url}
                alt={item.alt}
                style={{ display: "block", height: "100%", objectFit: "cover", width: "100%" }}
                onError={() => onImageError(item.id)}
              />
            </button>
          ))
        : null}
      {hasError || (images.length === 0 && !mapTileUrl) ? (
        <div className="p-4 text-center" style={{ color: "var(--fg-3)", gridColumn: "1 / -1", width: "100%" }}>
          No images found
        </div>
      ) : null}
    </div>
  );
}
