"use client";

import { useEffect, useState } from "react";
import { LoaderIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { CoverImageSearchResult } from "@/data/types";
import { resolveDestinationCenter, searchCoverImages } from "@/app/(app)/trips/cover-image-search-actions";

const MAX_REFRESHES = 4;
const PHOTO_PAGE_SIZE_WITH_MAP = 11;
const PHOTO_PAGE_SIZE_WITHOUT_MAP = 12;

export interface CoverImagePickerSearchTabProps {
  destinationName?: string;
  center?: [number, number];
  onImageSelected: (url: string) => void;
}

function buildMapTileUrl(center?: [number, number]) {
  if (!center) {
    return null;
  }

  const searchParams = new URLSearchParams({
    lng: center[0].toString(),
    lat: center[1].toString(),
  });

  return `/api/mapbox/static?${searchParams.toString()}`;
}

function getPhotoPageSize(hasMapTile: boolean) {
  return hasMapTile ? PHOTO_PAGE_SIZE_WITH_MAP : PHOTO_PAGE_SIZE_WITHOUT_MAP;
}

export function CoverImagePickerSearchTab({
  destinationName,
  center,
  onImageSelected,
}: CoverImagePickerSearchTabProps) {
  const [cachedPages, setCachedPages] = useState<Record<number, CoverImageSearchResult[]>>({});
  const [images, setImages] = useState<CoverImageSearchResult[]>([]);
  const [hiddenImageIds, setHiddenImageIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);
  const [resolvedCenter, setResolvedCenter] = useState<[number, number] | undefined>(center);
  const [allowMapTile, setAllowMapTile] = useState(true);

  useEffect(() => {
    let isCurrent = true;
    const query = destinationName?.trim();

    /* eslint-disable react-hooks/set-state-in-effect */
    setCachedPages({});
    setImages([]);
    setHiddenImageIds([]);
    setHasError(false);
    setLoading(false);
    setRefreshing(false);
    setRefreshCount(0);
    setResolvedCenter(center);
    setAllowMapTile(true);
    /* eslint-enable react-hooks/set-state-in-effect */

    if (!query) {
      return () => {
        isCurrent = false;
      };
    }

    const searchQuery = query;

    async function loadInitialPage() {
      setLoading(true);

      try {
        const nextCenter = !center && allowMapTile ? await resolveDestinationCenter(searchQuery) : center;
        if (!isCurrent) return;

        const hasMapTile = allowMapTile && !!nextCenter;
        const perPage = getPhotoPageSize(hasMapTile);
        const firstPage = await searchCoverImages(searchQuery, { page: 1, perPage });
        if (!isCurrent) return;

        setResolvedCenter(hasMapTile ? nextCenter : undefined);
        setCachedPages({ 1: firstPage });
        setImages(firstPage);
      } catch {
        if (!isCurrent) return;
        toast.error("Could not load images");
        setHasError(true);
        setResolvedCenter(undefined);
      } finally {
        if (isCurrent) {
          setLoading(false);
        }
      }
    }

    void loadInitialPage();

    return () => {
      isCurrent = false;
    };
  }, [destinationName, center, allowMapTile]);

  const mapTileUrl = allowMapTile && !hasError ? buildMapTileUrl(resolvedCenter) : null;
  const showMapTile = !!mapTileUrl;
  const photoPageSize = getPhotoPageSize(showMapTile);
  const visibleImages = images.filter((item) => !hiddenImageIds.includes(item.id)).slice(0, photoPageSize);
  const showEmptyState = !loading && (hasError || (visibleImages.length === 0 && !showMapTile));
  const canRefresh = !!destinationName?.trim();

  async function handleRefresh() {
    const query = destinationName?.trim();
    if (!query) {
      return;
    }

    const nextRefreshCount = refreshCount === MAX_REFRESHES ? 0 : refreshCount + 1;
    const nextPage = nextRefreshCount + 1;
    const cachedPage = cachedPages[nextPage];

    setRefreshing(true);
    setHasError(false);
    setHiddenImageIds([]);

    if (cachedPage) {
      setImages(cachedPage);
      setRefreshCount(nextRefreshCount);
      setRefreshing(false);
      return;
    }

    try {
      const nextImages = await searchCoverImages(query, { page: nextPage, perPage: photoPageSize });
      setCachedPages((currentPages) => ({ ...currentPages, [nextPage]: nextImages }));
      setImages(nextImages);
      setRefreshCount(nextRefreshCount);
    } catch {
      toast.error("Could not load images");
      setHasError(true);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="pt-2">
      <div className="flex items-center justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canRefresh || loading || refreshing}
          onClick={handleRefresh}
        >
          {refreshing ? "Refreshing photos..." : "Refresh photos"}
        </Button>
      </div>
      {loading ? (
        <div
          role="status"
          aria-label="Loading images"
          style={{ display: "flex", justifyContent: "center", padding: 32 }}
        >
          <LoaderIcon strokeWidth={1.5} className="animate-spin" />
          <span className="sr-only">Loading images…</span>
        </div>
      ) : (
        <div
          data-testid="cover-search-grid"
          style={{
            display: "grid",
            gap: 8,
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            paddingTop: 8,
          }}
        >
          {showMapTile && mapTileUrl ? (
            <button
              type="button"
              title="Map view"
              aria-label={`Map view of ${destinationName ?? ""}`}
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
                alt={`Map view of ${destinationName ?? ""}`}
                style={{ display: "block", height: "100%", objectFit: "cover", width: "100%" }}
                onError={() => {
                  setAllowMapTile(false);
                }}
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
            ? visibleImages.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  title={item.photographer}
                  aria-label={item.alt || item.photographer}
                  onClick={() => onImageSelected(item.url)}
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
                    onError={() => {
                      setHiddenImageIds((currentIds) =>
                        currentIds.includes(item.id) ? currentIds : [...currentIds, item.id]
                      );
                    }}
                  />
                </button>
              ))
            : null}
          {showEmptyState ? (
            <div className="p-4 text-center" style={{ color: "var(--fg-3)", gridColumn: "1 / -1", width: "100%" }}>
              No images found
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
