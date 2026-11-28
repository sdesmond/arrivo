"use client";

import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createRandomId } from "@/lib/utils";
import { api, ApiClientError } from "@/lib/api/client";
import { MAX_LOCATION_SEARCH_QUERY_LENGTH, retrieveLocation, searchLocations } from "@/lib/api/contract/locations";
import type { RetrievedLocation } from "@/data/types";

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

/** Where a lost session sends the user, as in `useApiMutation`; undefined for every other failure. */
function authRedirectPath(error: unknown): string | undefined {
  if (!(error instanceof ApiClientError)) return undefined;
  if (error.code === "unauthenticated") return "/sign-in";
  if (error.code === "mfa_enrollment_required") return "/mfa-enrollment";
  return undefined;
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
  // Retrieves run in parallel, so only the latest request may apply its result or end the loading state.
  const retrieveRequestRef = useRef(0);
  const suppressSearchRef = useRef(false);
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestionOption[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [retrieveLoading, setRetrieveLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  // Held in a ref so a new router object never restarts the search debounce.
  const router = useRouter();
  const routerRef = useRef(router);

  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  useEffect(() => {
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = createRandomId();
    }
  }, []);

  useEffect(() => {
    if (suppressSearchRef.current) {
      suppressSearchRef.current = false;
      return;
    }

    const searchQuery = resolvedValue === value ? "" : value.trim().slice(0, MAX_LOCATION_SEARCH_QUERY_LENGTH);
    if (searchQuery.length < 2) {
      return;
    }

    let active = true;
    const sessionToken = sessionTokenRef.current;

    const timerId = window.setTimeout(async () => {
      setSuggestionsLoading(true);
      try {
        const { suggestions: results } = await api(searchLocations, {
          params: {},
          body: { query: searchQuery, mode: mode === "destination" ? "destination" : "address", sessionToken },
        });
        if (!active) return;
        setSuggestions(
          results.slice(0, 5).map((result) =>
            "placeName" in result
              ? { mapboxId: result.mapboxId, primaryText: result.placeName, inputValue: result.placeName }
              : {
                  mapboxId: result.mapboxId,
                  primaryText: result.name,
                  secondaryText: result.fullAddress !== result.name ? result.fullAddress : undefined,
                  inputValue: result.fullAddress,
                  resolvedLocation: result.resolvedLocation,
                }
          )
        );
        setHighlightedIndex(-1);
      } catch (error) {
        if (!active) return;
        setSuggestions([]);
        const redirectPath = authRedirectPath(error);
        if (redirectPath) routerRef.current.push(redirectPath);
        else toast.error(searchErrorMessage);
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
    retrieveRequestRef.current += 1;
    setRetrieveLoading(false);
    setSuggestions([]);
    setHighlightedIndex(-1);
    setSuggestionsLoading(nextValue.trim().length >= 2);
    onClearResolved?.();
    onValueChange(nextValue);
  }

  async function handleSuggestionSelect(suggestion: AutocompleteSuggestionOption): Promise<void> {
    const requestId = ++retrieveRequestRef.current;
    // This pick closes its search session: the next search starts a new one while the retrieve is still pending.
    const sessionToken = sessionTokenRef.current;
    sessionTokenRef.current = createRandomId();
    suppressSearchRef.current = true;
    onValueChange(suggestion.inputValue);
    setSuggestions([]);
    setHighlightedIndex(-1);
    setSuggestionsLoading(false);
    setRetrieveLoading(true);

    try {
      const location =
        suggestion.resolvedLocation ??
        (
          await api(retrieveLocation, {
            params: {},
            body: { mapboxId: suggestion.mapboxId, sessionToken },
          })
        ).location;
      if (requestId !== retrieveRequestRef.current) {
        return;
      }
      suppressSearchRef.current = true;
      onValueChange(mode === "destination" ? location.placeName : location.fullAddress);
      onResolved(location);
    } catch (error) {
      if (requestId === retrieveRequestRef.current) {
        const redirectPath = authRedirectPath(error);
        if (redirectPath) {
          routerRef.current.push(redirectPath);
        } else {
          console.error("Location retrieve failed:", error);
          toast.error(retrieveErrorMessage);
        }
      }
    } finally {
      if (requestId === retrieveRequestRef.current) {
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
    sessionTokenRef.current = createRandomId();
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
