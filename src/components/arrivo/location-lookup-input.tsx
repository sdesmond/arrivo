"use client";

import { type CSSProperties, type KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import type { RetrievedLocation } from "@/app/(app)/trips/actions";
import { useLocationAutocomplete } from "./use-location-autocomplete";

export interface LocationLookupInputProps {
  id?: string;
  value: string;
  resolvedValue?: string | null;
  placeholder?: string;
  className?: string;
  inputStyle?: CSSProperties;
  autoFocus?: boolean;
  disabled?: boolean;
  onValueChange: (value: string) => void;
  onResolved: (location: RetrievedLocation) => void;
  onClearResolved?: () => void;
  onSubmit?: () => void;
}

export function LocationLookupInput({
  id,
  value,
  resolvedValue = null,
  placeholder,
  className,
  inputStyle,
  autoFocus = false,
  disabled = false,
  onValueChange,
  onResolved,
  onClearResolved,
  onSubmit,
}: LocationLookupInputProps) {
  const listboxId = id ? `${id}-suggestions` : undefined;
  const {
    highlightedIndex,
    retrieveLoading,
    suggestions,
    suggestionsLoading,
    handleInputChange,
    handleKeyDown,
    handleSuggestionSelect,
  } = useLocationAutocomplete({
    value,
    resolvedValue,
    mode: "location",
    onValueChange,
    onResolved,
    onClearResolved,
    searchErrorMessage: "Could not search locations",
    retrieveErrorMessage: "Could not load location details",
  });

  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    const wasHandled = handleKeyDown(event);
    if (!wasHandled && event.key === "Enter") {
      onSubmit?.();
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <Input
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-busy={suggestionsLoading || retrieveLoading}
        aria-controls={suggestions.length > 0 ? listboxId : undefined}
        aria-expanded={suggestions.length > 0}
        aria-haspopup="listbox"
        aria-activedescendant={
          highlightedIndex >= 0 && suggestions.length > 0 && listboxId
            ? `${listboxId}-option-${highlightedIndex}`
            : undefined
        }
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        className={className}
        style={inputStyle}
        autoFocus={autoFocus}
        disabled={disabled}
        onChange={(event) => handleInputChange(event.target.value)}
        onKeyDown={onInputKeyDown}
      />

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
          Searching...
        </div>
      ) : suggestions.length > 0 ? (
        <ul
          id={listboxId}
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
              key={`${suggestion.mapboxId}-${index}`}
              id={listboxId ? `${listboxId}-option-${index}` : undefined}
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
              <div>{suggestion.primaryText}</div>
              {suggestion.secondaryText ? (
                <div style={{ color: "var(--fg-3)", fontSize: "calc(12px * var(--font-scale))" }}>
                  {suggestion.secondaryText}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
