"use client";

import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  retrieveLocation,
  searchAddressLocations,
  searchLocations,
  type RetrievedLocation,
} from "@/app/(app)/trips/actions";

export interface AutocompleteSuggestionOption {
  mapboxId: string;
  primaryText: string;
  secondaryText?: string;
  inputValue: string;
  resolvedLocation?: RetrievedLocation;
}

export interface UseLocationAutocompleteOptions {
  value: string;
  resolvedValue?: string | null;
  mode: "destination" | "location";
  onValueChange: (value: string) => void;
  onResolved: (location: RetrievedLocation) => void;
  onClearResolved?: () => void;
  searchErrorMessage: string;
  retrieveErrorMessage: string;
}

export interface UseLocationAutocompleteResult {
  highlightedIndex: number;
  retrieveLoading: boolean;
  suggestions: AutocompleteSuggestionOption[];
  suggestionsLoading: boolean;
  handleInputChange: (value: string) => void;
  handleKeyDown: (event: KeyboardEvent<HTMLInputElement>) => boolean;
  handleSuggestionSelect: (suggestion: AutocompleteSuggestionOption) => Promise<void>;
  reset: () => void;
}

export function useLocationAutocomplete({
  value,
  resolvedValue = null,
  mode,
  onValueChange,
  onResolved,
  onClearResolved,
  searchErrorMessage,
  retrieveErrorMessage,
}: UseLocationAutocompleteOptions): UseLocationAutocompleteResult {
  const sessionTokenRef = useRef("");
  const cancelRetrieveRef = useRef(false);
  const suppressSearchRef = useRef(false);
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestionOption[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [retrieveLoading, setRetrieveLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  useEffect(() => {
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = crypto.randomUUID();
    }
  }, []);

  useEffect(() => {
    if (suppressSearchRef.current) {
      suppressSearchRef.current = false;
      return;
    }

    const searchQuery = resolvedValue === value ? "" : value.trim();
    if (searchQuery.length < 2) {
      return;
    }

    let active = true;
    const sessionToken = sessionTokenRef.current;

    const timerId = window.setTimeout(async () => {
      setSuggestionsLoading(true);
      try {
        if (mode === "destination") {
          const results = await searchLocations(searchQuery, sessionToken);
          if (!active) return;
          setSuggestions(
            results.slice(0, 5).map((result) => ({
              mapboxId: result.mapboxId,
              primaryText: result.placeName,
              inputValue: result.placeName,
            }))
          );
        } else {
          const results = await searchAddressLocations(searchQuery, sessionToken);
          if (!active) return;
          setSuggestions(
            results.slice(0, 5).map((result) => ({
              mapboxId: result.mapboxId,
              primaryText: result.name,
              secondaryText: result.fullAddress !== result.name ? result.fullAddress : undefined,
              inputValue: result.fullAddress,
              resolvedLocation: result.resolvedLocation,
            }))
          );
        }
        setHighlightedIndex(-1);
      } catch {
        if (!active) return;
        setSuggestions([]);
        toast.error(searchErrorMessage);
      } finally {
        if (active) {
          setSuggestionsLoading(false);
        }
      }
    }, 300);

    return () => {
      active = false;
      window.clearTimeout(timerId);
    };
  }, [mode, resolvedValue, searchErrorMessage, value]);

  function clearResolvedState(nextValue: string): void {
    cancelRetrieveRef.current = true;
    setRetrieveLoading(false);
    setSuggestions([]);
    setHighlightedIndex(-1);
    setSuggestionsLoading(nextValue.trim().length >= 2);
    onClearResolved?.();
    onValueChange(nextValue);
  }

  async function handleSuggestionSelect(suggestion: AutocompleteSuggestionOption): Promise<void> {
    cancelRetrieveRef.current = true;
    suppressSearchRef.current = true;
    onValueChange(suggestion.inputValue);
    setSuggestions([]);
    setHighlightedIndex(-1);
    setSuggestionsLoading(false);
    setRetrieveLoading(true);
    cancelRetrieveRef.current = false;

    try {
      const location =
        suggestion.resolvedLocation ?? (await retrieveLocation(suggestion.mapboxId, sessionTokenRef.current));
      if (cancelRetrieveRef.current) {
        return;
      }
      suppressSearchRef.current = true;
      onValueChange(mode === "destination" ? location.placeName : location.fullAddress);
      onResolved(location);
    } catch (error) {
      if (!cancelRetrieveRef.current) {
        console.error("Location retrieve failed:", error);
        toast.error(retrieveErrorMessage);
      }
    } finally {
      sessionTokenRef.current = crypto.randomUUID();
      if (!cancelRetrieveRef.current) {
        setRetrieveLoading(false);
      }
    }
  }

  function handleInputChange(nextValue: string): void {
    clearResolvedState(nextValue);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): boolean {
    if (event.key === "Escape") {
      event.stopPropagation();
      setSuggestions([]);
      setHighlightedIndex(-1);
      return true;
    }

    if (suggestions.length === 0) return false;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((previousIndex) => Math.min(previousIndex + 1, suggestions.length - 1));
      return true;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((previousIndex) => Math.max(previousIndex - 1, 0));
      return true;
    }

    if (event.key === "Enter" && highlightedIndex >= 0) {
      event.preventDefault();
      void handleSuggestionSelect(suggestions[highlightedIndex]);
      return true;
    }

    return false;
  }

  function reset(): void {
    clearResolvedState("");
    setSuggestionsLoading(false);
    sessionTokenRef.current = crypto.randomUUID();
  }

  return {
    highlightedIndex,
    retrieveLoading,
    suggestions,
    suggestionsLoading,
    handleInputChange,
    handleKeyDown,
    handleSuggestionSelect,
    reset,
  };
}
