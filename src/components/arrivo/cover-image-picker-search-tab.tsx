"use client";

import { useEffect, useState } from "react";
import { LoaderIcon } from "lucide-react";
import { toast } from "sonner";
import { CoverImageGrid } from "@/components/arrivo/cover-image-grid";
import { CoverLocationSearch } from "@/components/arrivo/cover-location-search";
import type { CoverImageSearchResult, CoverImageSelection } from "@/data/types";
import { api } from "@/lib/api/client";
import { resolveDestinationCenter, searchCoverImages } from "@/lib/api/contract/cover-images";

const PHOTO_PAGE_SIZE = 19;

export interface CoverImagePickerSearchTabProps {
  destinationName?: string;
  center?: [number, number];
  onImageSelected: (selection: string | CoverImageSelection) => void;
}

function buildMapTileUrl(center?: [number, number]) {
  if (!center) return null;

  const searchParams = new URLSearchParams({
    lng: center[0].toString(),
    lat: center[1].toString(),
  });

  return `/api/mapbox/static?${searchParams.toString()}`;
}

export function CoverImagePickerSearchTab({
  destinationName,
  center: initialCenter,
  onImageSelected,
}: CoverImagePickerSearchTabProps) {
  const [searchInput, setSearchInput] = useState(destinationName ?? "");
  const [activeLocation, setActiveLocation] = useState<{
    query: string;
    center?: [number, number];
  } | null>(destinationName ? { query: destinationName.trim(), center: initialCenter } : null);
  const [images, setImages] = useState<CoverImageSearchResult[]>([]);
  const [hiddenImageIds, setHiddenImageIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [resolvedCenter, setResolvedCenter] = useState<[number, number] | undefined>(initialCenter);
  const [showMapTile, setShowMapTile] = useState(true);

  useEffect(() => {
    if (!activeLocation) return;

    const query = activeLocation.query;
    const initialCenter = activeLocation.center;
    let isCurrent = true;

    /* eslint-disable react-hooks/set-state-in-effect */
    setImages([]);
    setHiddenImageIds([]);
    setHasError(false);
    setShowMapTile(true);
    setLoading(true);
    /* eslint-enable react-hooks/set-state-in-effect */

    async function load() {
      try {
        let nextCenter: [number, number] | null | undefined = initialCenter;
        if (!nextCenter) {
          try {
            nextCenter = (await api(resolveDestinationCenter, { params: {}, body: { name: query } })).center;
          } catch {
            // The map tile is optional: a spent Mapbox budget or a failed lookup must not block the photos.
            nextCenter = null;
          }
        }
        if (!isCurrent) return;
        setResolvedCenter(nextCenter ?? undefined);

        const { images: results } = await api(searchCoverImages, {
          params: {},
          body: { query, page: 1, perPage: PHOTO_PAGE_SIZE },
        });
        if (!isCurrent) return;
        setImages(results);
      } catch {
        if (!isCurrent) return;
        toast.error("Could not load images");
        setHasError(true);
      } finally {
        if (isCurrent) setLoading(false);
      }
    }

    void load();

    return () => {
      isCurrent = false;
    };
  }, [activeLocation]);

  const mapTileUrl = showMapTile && !hasError ? buildMapTileUrl(resolvedCenter) : null;
  const visibleImages = images.filter((item) => !hiddenImageIds.includes(item.id));

  return (
    <div className="pt-2">
      <CoverLocationSearch
        value={searchInput}
        activeLocation={activeLocation}
        onValueChange={setSearchInput}
        onLocationSelected={setActiveLocation}
      />

      {loading ? (
        <div
          role="status"
          aria-label="Loading images"
          style={{ display: "flex", justifyContent: "center", padding: 32 }}
        >
          <LoaderIcon strokeWidth={1.5} className="animate-spin" />
          <span className="sr-only">Loading images…</span>
        </div>
      ) : activeLocation ? (
        <CoverImageGrid
          mapTileUrl={mapTileUrl}
          mapLabel={`Map view of ${searchInput || destinationName || ""}`}
          images={visibleImages}
          hasError={hasError}
          onImageSelected={onImageSelected}
          onMapError={() => setShowMapTile(false)}
          onImageError={(imageId) => {
            setHiddenImageIds((currentIds) => (currentIds.includes(imageId) ? currentIds : [...currentIds, imageId]));
          }}
        />
      ) : null}
    </div>
  );
}
