"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { RetrievedLocation } from "@/app/(app)/trips/actions";
import { Field, Section } from "@/components/packt/form-section";
import { Input } from "@/components/ui/input";
import { useLocationAutocomplete } from "./use-location-autocomplete";

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
  const [resolvedValue, setResolvedValue] = useState<string | null>(value || null);
  const {
    highlightedIndex,
    retrieveLoading,
    suggestions,
    suggestionsLoading,
    handleInputChange,
    handleKeyDown,
    handleSuggestionSelect,
    reset,
  } = useLocationAutocomplete({
    value,
    resolvedValue,
    mode: "destination",
    onValueChange: onInputChange,
    onResolved: (location: RetrievedLocation) => {
      setResolvedValue(location.placeName);
      onSelect({
        name: location.placeName,
        country: location.country ?? null,
        countryCode: location.countryCode ?? null,
        center: location.center,
      });
    },
    searchErrorMessage: "Could not search locations",
    retrieveErrorMessage: "Could not load location details",
  });

  function handleClear() {
    reset();
    setResolvedValue(null);
    onClear();
  }

  return (
    <Section title="Destination">
      <Field label="Location" htmlFor="trip-edit-destination">
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
              onChange={(event) => handleInputChange(event.target.value)}
              onKeyDown={(event) => {
                void handleKeyDown(event);
              }}
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
                  key={`${index}-${suggestion.mapboxId}`}
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
                  {suggestion.primaryText}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </Field>
    </Section>
  );
}
