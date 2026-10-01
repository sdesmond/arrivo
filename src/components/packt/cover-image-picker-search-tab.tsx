"use client";

import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { LoaderIcon, Search } from "lucide-react";
import { toast } from "sonner";
import { createRandomId } from "@/lib/utils";
import type { CoverImageSearchResult, CoverImageSelection } from "@/data/types";
import type { LocationSuggestion } from "@/app/(app)/trips/actions";
import { searchLocations, retrieveLocation } from "@/app/(app)/trips/actions";
import { resolveDestinationCenter, searchCoverImages } from "@/app/(app)/trips/cover-image-search-actions";

const PHOTO_PAGE_SIZE = 19;

function simplifyLocationName(name: string): string {
  const parts = name
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length <= 2) return name;
  return `${parts[0]}, ${parts[1]}`;
}

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
  const sessionTokenRef = useRef(createRandomId());
  const [searchInput, setSearchInput] = useState(destinationName ?? "");
  const [activeLocation, setActiveLocation] = useState<{
    query: string;
    center?: [number, number];
  } | null>(destinationName ? { query: destinationName.trim(), center: initialCenter } : null);
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
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
        const nextCenter = initialCenter ?? (await resolveDestinationCenter(query));
        if (!isCurrent) return;
        setResolvedCenter(nextCenter ?? undefined);

        const results = await searchCoverImages(query, {
          page: 1,
          perPage: PHOTO_PAGE_SIZE,
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

  useEffect(() => {
    const query = searchInput.trim();
    if (query.length < 2 || (activeLocation && query === activeLocation.query)) return;

    let active = true;
    const sessionToken = sessionTokenRef.current;

    const timerId = window.setTimeout(async () => {
      try {
        const results = await searchLocations(query, sessionToken);
        if (!active) return;
        setSuggestions(results.slice(0, 5));
        setHighlightedIndex(-1);
      } catch {
        if (!active) return;
        setSuggestions([]);
        toast.error("Could not search locations");
      }
    }, 300);

    return () => {
      active = false;
      window.clearTimeout(timerId);
    };
  }, [searchInput, activeLocation]);

  async function handleSuggestionSelect(suggestion: LocationSuggestion) {
    const displayName = simplifyLocationName(suggestion.placeName);
    setSearchInput(displayName);
    setSuggestions([]);
    setHighlightedIndex(-1);

    try {
      const location = await retrieveLocation(suggestion.mapboxId, sessionTokenRef.current);
      sessionTokenRef.current = createRandomId();
      setActiveLocation({
        query: displayName,
        center: location.center,
      });
    } catch {
      setActiveLocation({
        query: displayName,
      });
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      setSuggestions([]);
      setHighlightedIndex(-1);
      return;
    }

    if (suggestions.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((prev) => Math.max(prev - 1, 0));
      return;
    }

    if (event.key === "Enter" && highlightedIndex >= 0) {
      event.preventDefault();
      void handleSuggestionSelect(suggestions[highlightedIndex]);
    }
  }

  const mapTileUrl = showMapTile && !hasError ? buildMapTileUrl(resolvedCenter) : null;
  const visibleImages = images.filter((item) => !hiddenImageIds.includes(item.id));

  return (
    <div className="pt-2">
      <div style={{ position: "relative", marginBottom: 8 }}>
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <Search
            strokeWidth={1.5}
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              width: 16,
              height: 16,
              color: "var(--fg-3)",
              pointerEvents: "none",
            }}
          />
          <input
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={suggestions.length > 0}
            aria-controls={suggestions.length > 0 ? "cover-image-search-suggestions" : undefined}
            aria-activedescendant={
              highlightedIndex >= 0 ? `cover-image-search-suggestion-${highlightedIndex}` : undefined
            }
            aria-label="Search location for photos"
            value={searchInput}
            placeholder="Search location"
            autoComplete="off"
            onChange={(event) => {
              setSearchInput(event.target.value);
            }}
            onKeyDown={handleKeyDown}
            style={{
              width: "100%",
              padding: "8px 10px 8px 32px",
              border: "1px solid var(--line)",
              borderRadius: 6,
              background: "var(--surface)",
              color: "var(--fg)",
              fontSize: "0.875rem",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {suggestions.length > 0 ? (
          <ul
            id="cover-image-search-suggestions"
            role="listbox"
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              right: 0,
              left: 0,
              zIndex: 10,
              margin: 0,
              padding: 4,
              listStyle: "none",
              border: "1px solid var(--line)",
              borderRadius: 8,
              background: "var(--surface)",
              boxShadow: "0 10px 30px color-mix(in srgb, var(--surface-3) 45%, transparent)",
            }}
          >
            {suggestions.map((suggestion, index) => (
              <li
                key={`${index}-${suggestion.mapboxId ?? suggestion.placeName}`}
                id={`cover-image-search-suggestion-${index}`}
                role="option"
                aria-selected={highlightedIndex === index}
                style={{
                  padding: "8px 10px",
                  borderRadius: 6,
                  cursor: "pointer",
                  color: "var(--fg)",
                  background: highlightedIndex === index ? "var(--accent-soft)" : "transparent",
                }}
                onMouseDown={(event) => {
                  event.preventDefault();
                  void handleSuggestionSelect(suggestion);
                }}
              >
                {simplifyLocationName(suggestion.placeName)}
              </li>
            ))}
          </ul>
        ) : null}
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
      ) : activeLocation ? (
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
              aria-label={`Map view of ${searchInput || destinationName || ""}`}
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
                alt={`Map view of ${searchInput || destinationName || ""}`}
                style={{ display: "block", height: "100%", objectFit: "cover", width: "100%" }}
                onError={() => {
                  setShowMapTile(false);
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
                    onError={() => {
                      setHiddenImageIds((currentIds) =>
                        currentIds.includes(item.id) ? currentIds : [...currentIds, item.id]
                      );
                    }}
                  />
                </button>
              ))
            : null}
          {!loading && (hasError || (visibleImages.length === 0 && !mapTileUrl)) ? (
            <div className="p-4 text-center" style={{ color: "var(--fg-3)", gridColumn: "1 / -1", width: "100%" }}>
              No images found
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
