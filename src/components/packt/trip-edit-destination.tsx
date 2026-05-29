"use client";

import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { searchLocations, retrieveLocation } from "@/app/(app)/trips/actions";
import type { LocationSuggestion, RetrievedLocation } from "@/app/(app)/trips/actions";
import { Field, Section } from "@/components/packt/form-section";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export interface TripEditDestinationProps {
  value: string;
  onInputChange: (text: string) => void;
  onSelect: (data: {
    name: string;
    country: string | null;
    countryCode: string | null;
    center: [number, number];
  }) => void;
  onClear: () => void;
  disabled?: boolean;
}

export function TripEditDestination({
  value,
  onInputChange,
  onSelect,
  onClear,
  disabled = false,
}: TripEditDestinationProps) {
  const sessionTokenRef = useRef<string>("");
  const cancelRetrieveRef = useRef(false);
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [retrieveLoading, setRetrieveLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [lastResolvedName, setLastResolvedName] = useState<string | null>(value || null);

  useEffect(() => {
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = crypto.randomUUID();
    }
  }, []);

  useEffect(() => {
    const searchQuery = lastResolvedName === value ? "" : value.trim();
    if (searchQuery.length < 2) {
      return;
    }

    let active = true;
    const sessionToken = sessionTokenRef.current;

    const timerId = window.setTimeout(async () => {
      setSuggestionsLoading(true);
      try {
        const results = await searchLocations(searchQuery, sessionToken);
        if (!active) return;
        setSuggestions(results.slice(0, 5));
        setHighlightedIndex(-1);
      } catch {
        if (!active) return;
        setSuggestions([]);
        toast.error("Could not search locations");
      } finally {
        if (active) setSuggestionsLoading(false);
      }
    }, 300);

    return () => {
      active = false;
      window.clearTimeout(timerId);
    };
  }, [value, lastResolvedName]);

  async function handleSuggestionSelect(suggestion: LocationSuggestion) {
    cancelRetrieveRef.current = true;
    onInputChange(suggestion.placeName);
    setSuggestions([]);
    setHighlightedIndex(-1);
    setSuggestionsLoading(false);
    setRetrieveLoading(true);
    cancelRetrieveRef.current = false;

    try {
      const location: RetrievedLocation = await retrieveLocation(suggestion.mapboxId, sessionTokenRef.current);
      if (cancelRetrieveRef.current) {
        sessionTokenRef.current = crypto.randomUUID();
        return;
      }
      sessionTokenRef.current = crypto.randomUUID();
      setLastResolvedName(location.placeName);
      onSelect({
        name: location.placeName,
        country: location.country ?? null,
        countryCode: location.countryCode ?? null,
        center: location.center,
      });
    } catch (error) {
      if (!cancelRetrieveRef.current) {
        console.error("Location retrieve failed:", error);
        toast.error("Could not load location details");
      }
    } finally {
      if (!cancelRetrieveRef.current) setRetrieveLoading(false);
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

  function handleClear() {
    cancelRetrieveRef.current = true;
    setSuggestions([]);
    setHighlightedIndex(-1);
    setSuggestionsLoading(false);
    setRetrieveLoading(false);
    setLastResolvedName(null);
    sessionTokenRef.current = crypto.randomUUID();
    onClear();
  }

  return (
    <Section title="Destination">
      <Field label="Destination" htmlFor="trip-edit-destination">
        <div style={{ position: "relative" }}>
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <Input
              id="trip-edit-destination"
              role="combobox"
              aria-autocomplete="list"
              aria-busy={suggestionsLoading || retrieveLoading}
              aria-controls={suggestions.length > 0 ? "trip-edit-destination-suggestions" : undefined}
              aria-expanded={suggestions.length > 0}
              aria-haspopup="listbox"
              aria-activedescendant={
                highlightedIndex >= 0 && suggestions.length > 0
                  ? `trip-edit-destination-suggestion-${highlightedIndex}`
                  : undefined
              }
              value={value}
              placeholder="Search destination"
              autoComplete="off"
              disabled={disabled}
              style={{ paddingRight: value ? "2rem" : undefined }}
              onChange={(event) => {
                cancelRetrieveRef.current = true;
                setRetrieveLoading(false);
                setLastResolvedName(null);
                setSuggestions([]);
                setHighlightedIndex(-1);
                setSuggestionsLoading(event.target.value.trim().length >= 2);
                onInputChange(event.target.value);
              }}
              onKeyDown={handleKeyDown}
            />
            {value ? (
              <button
                type="button"
                title="Clear destination"
                onClick={handleClear}
                disabled={disabled}
                style={{
                  position: "absolute",
                  right: "0.5rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  color: "var(--fg-muted, var(--fg))",
                }}
              >
                <X size={14} strokeWidth={1.5} />
              </button>
            ) : null}
          </div>

          {suggestionsLoading && suggestions.length === 0 && value.trim().length >= 2 ? (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                right: 0,
                left: 0,
                zIndex: 10,
                padding: "8px 12px",
                border: "1px solid var(--line)",
                borderRadius: 8,
                background: "var(--surface)",
                color: "var(--fg-muted, var(--fg))",
                fontSize: "0.875rem",
                boxShadow: "0 10px 30px color-mix(in srgb, var(--surface-3) 45%, transparent)",
              }}
            >
              Searching…
            </div>
          ) : suggestions.length > 0 ? (
            <ul
              id="trip-edit-destination-suggestions"
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
                  id={`trip-edit-destination-suggestion-${index}`}
                  role="option"
                  aria-selected={highlightedIndex === index}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 6,
                    cursor: retrieveLoading ? "wait" : "pointer",
                    color: "var(--fg)",
                    background: highlightedIndex === index ? "var(--accent-soft)" : "transparent",
                  }}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    void handleSuggestionSelect(suggestion);
                  }}
                >
                  {suggestion.placeName}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </Field>
    </Section>
  );
}
