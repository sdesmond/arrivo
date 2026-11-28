"use client";

import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { createRandomId } from "@/lib/utils";
import type { LocationSuggestion } from "@/data/types";
import { searchLocations, retrieveLocation } from "@/app/(app)/trips/actions";

function simplifyLocationName(name: string): string {
  const parts = name
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length <= 2) return name;
  return `${parts[0]}, ${parts[1]}`;
}

export interface CoverLocationSearchProps {
  value: string;
  /** The location whose photos are shown; typing its query again does not search. */
  activeLocation: { query: string; center?: [number, number] } | null;
  onValueChange: (value: string) => void;
  onLocationSelected: (location: { query: string; center?: [number, number] }) => void;
}

export function CoverLocationSearch({
  value,
  activeLocation,
  onValueChange,
  onLocationSelected,
}: CoverLocationSearchProps) {
  const sessionTokenRef = useRef(createRandomId());
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  useEffect(() => {
    const query = value.trim();
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
  }, [value, activeLocation]);

  async function handleSuggestionSelect(suggestion: LocationSuggestion) {
    const displayName = simplifyLocationName(suggestion.placeName);
    onValueChange(displayName);
    setSuggestions([]);
    setHighlightedIndex(-1);

    try {
      const location = await retrieveLocation(suggestion.mapboxId, sessionTokenRef.current);
      sessionTokenRef.current = createRandomId();
      onLocationSelected({
        query: displayName,
        center: location.center,
      });
    } catch {
      onLocationSelected({
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

  return (
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
          value={value}
          placeholder="Search location"
          autoComplete="off"
          onChange={(event) => {
            onValueChange(event.target.value);
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
  );
}
