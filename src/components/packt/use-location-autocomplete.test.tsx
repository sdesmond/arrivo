import { act, renderHook, waitFor } from "@testing-library/react";
import { useState, type KeyboardEvent } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import {
  retrieveLocation,
  searchAddressLocations,
  searchLocations,
  type LocationLookupSuggestion,
  type LocationSuggestion,
  type RetrievedLocation,
} from "@/app/(app)/trips/actions";
import {
  useLocationAutocomplete,
  type AutocompleteSuggestionOption,
  type UseLocationAutocompleteOptions,
} from "./use-location-autocomplete";

vi.mock("@/app/(app)/trips/actions", () => ({
  searchLocations: vi.fn(),
  searchAddressLocations: vi.fn(),
  retrieveLocation: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

interface RenderAutocompleteOptions {
  initialValue?: string;
  initialResolvedValue?: string | null;
  mode?: UseLocationAutocompleteOptions["mode"];
}

const retrievedLocation: RetrievedLocation = {
  center: [139.7454, 35.6586],
  country: "Japan",
  countryCode: "JP",
  fullAddress: "4 Chome-2-8 Shibakoen, Minato City, Tokyo",
  name: "Tokyo Tower",
  placeName: "Tokyo Tower",
};

function buildSuggestion(overrides: Partial<AutocompleteSuggestionOption> = {}): AutocompleteSuggestionOption {
  return {
    inputValue: "4 Chome-2-8 Shibakoen, Minato City, Tokyo",
    mapboxId: "mapbox-1",
    primaryText: "Tokyo Tower",
    secondaryText: "4 Chome-2-8 Shibakoen, Minato City, Tokyo",
    ...overrides,
  };
}

function buildDestinationSuggestion(overrides: Partial<LocationSuggestion> = {}): LocationSuggestion {
  return {
    country: "Japan",
    countryCode: "JP",
    mapboxId: "place-1",
    placeName: "Tokyo, Japan",
    ...overrides,
  };
}

function buildLocationSuggestion(overrides: Partial<LocationLookupSuggestion> = {}): LocationLookupSuggestion {
  return {
    fullAddress: "4 Chome-2-8 Shibakoen, Minato City, Tokyo",
    mapboxId: "poi-1",
    name: "Tokyo Tower",
    ...overrides,
  };
}

function createKeyEvent(key: string): KeyboardEvent<HTMLInputElement> {
  return {
    key,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as KeyboardEvent<HTMLInputElement>;
}

function useAutocompleteTestHarness(
  options: RenderAutocompleteOptions,
  onClearResolved: () => void,
  onResolved: (location: RetrievedLocation) => void
) {
  const { initialValue = "", initialResolvedValue = null, mode = "location" } = options;
  const [value, setValue] = useState(initialValue);
  const [resolvedValue, setResolvedValue] = useState<string | null | undefined>(initialResolvedValue);

  const hookResult = useLocationAutocomplete({
    mode,
    onClearResolved: () => {
      onClearResolved();
      setResolvedValue(null);
    },
    onResolved: (location) => {
      onResolved(location);
      setResolvedValue(mode === "destination" ? location.placeName : location.fullAddress);
    },
    onValueChange: setValue,
    resolvedValue,
    retrieveErrorMessage: "Could not load location details",
    searchErrorMessage: "Could not search locations",
    value,
  });

  return {
    ...hookResult,
    resolvedValue,
    value,
  };
}

function renderAutocomplete(options: RenderAutocompleteOptions = {}) {
  const onResolved = vi.fn();
  const onClearResolved = vi.fn();

  const { result } = renderHook(() => useAutocompleteTestHarness(options, onClearResolved, onResolved));

  return { onClearResolved, onResolved, result };
}

describe("useLocationAutocomplete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();

    let tokenCounter = 0;
    vi.spyOn(globalThis.crypto, "randomUUID").mockImplementation(() => {
      tokenCounter += 1;
      return `token-${tokenCounter}`;
    });

    vi.mocked(searchLocations).mockResolvedValue([]);
    vi.mocked(searchAddressLocations).mockResolvedValue([]);
    vi.mocked(retrieveLocation).mockResolvedValue(retrievedLocation);
  });

  it("does not search when the trimmed query is shorter than two characters", async () => {
    vi.useFakeTimers();

    renderAutocomplete({ initialValue: "T" });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    expect(searchAddressLocations).not.toHaveBeenCalled();
  });

  it("does not search when the resolved value already matches the input", async () => {
    vi.useFakeTimers();

    renderAutocomplete({
      initialResolvedValue: "Tokyo Tower",
      initialValue: "Tokyo Tower",
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    expect(searchAddressLocations).not.toHaveBeenCalled();
  });

  it("searches destination suggestions and maps place names into options", async () => {
    vi.mocked(searchLocations).mockResolvedValue([
      buildDestinationSuggestion(),
      buildDestinationSuggestion({
        country: "Canada",
        countryCode: "CA",
        mapboxId: "place-2",
        placeName: "Toronto, Canada",
      }),
    ]);
    vi.useFakeTimers();

    const { result } = renderAutocomplete({ initialValue: "To", mode: "destination" });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    expect(result.current.suggestions).toEqual([
      {
        inputValue: "Tokyo, Japan",
        mapboxId: "place-1",
        primaryText: "Tokyo, Japan",
      },
      {
        inputValue: "Toronto, Canada",
        mapboxId: "place-2",
        primaryText: "Toronto, Canada",
      },
    ]);
    expect(searchLocations).toHaveBeenCalledWith("To", "token-1");
  });

  it("searches location suggestions and includes POI secondary text when available", async () => {
    vi.mocked(searchAddressLocations).mockResolvedValue([
      buildLocationSuggestion(),
      buildLocationSuggestion({
        fullAddress: "1 World Way, Los Angeles, CA",
        mapboxId: "poi-2",
        name: "1 World Way, Los Angeles, CA",
      }),
    ]);
    vi.useFakeTimers();

    const { result } = renderAutocomplete({ initialValue: "To" });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    expect(result.current.suggestions).toEqual([
      {
        inputValue: "4 Chome-2-8 Shibakoen, Minato City, Tokyo",
        mapboxId: "poi-1",
        primaryText: "Tokyo Tower",
        secondaryText: "4 Chome-2-8 Shibakoen, Minato City, Tokyo",
      },
      {
        inputValue: "1 World Way, Los Angeles, CA",
        mapboxId: "poi-2",
        primaryText: "1 World Way, Los Angeles, CA",
        secondaryText: undefined,
      },
    ]);
    expect(searchAddressLocations).toHaveBeenCalledWith("To", "token-1");
  });

  it("shows a toast and clears suggestions when search fails", async () => {
    vi.mocked(searchAddressLocations).mockRejectedValue(new Error("network"));
    vi.useFakeTimers();

    const { result } = renderAutocomplete({ initialValue: "To" });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    expect(toast.error).toHaveBeenCalledWith("Could not search locations");
    expect(result.current.suggestions).toEqual([]);
    expect(result.current.suggestionsLoading).toBe(false);
  });

  it("clears resolved state when input changes", () => {
    const { onClearResolved, result } = renderAutocomplete({
      initialResolvedValue: "Tokyo Tower",
      initialValue: "Tokyo Tower",
    });

    act(() => {
      result.current.handleInputChange("Pa");
    });

    expect(onClearResolved).toHaveBeenCalledOnce();
    expect(result.current.retrieveLoading).toBe(false);
    expect(result.current.suggestions).toEqual([]);
    expect(result.current.suggestionsLoading).toBe(true);
    expect(result.current.value).toBe("Pa");
  });

  it("resolves a selected location suggestion and stores the full address", async () => {
    vi.useFakeTimers();
    const { onResolved, result } = renderAutocomplete();

    await act(async () => {
      await result.current.handleSuggestionSelect(buildSuggestion());
    });

    expect(retrieveLocation).toHaveBeenCalledWith("mapbox-1", "token-1");
    expect(result.current.value).toBe("4 Chome-2-8 Shibakoen, Minato City, Tokyo");
    expect(onResolved).toHaveBeenCalledWith(retrievedLocation);
    expect(result.current.retrieveLoading).toBe(false);
    expect(result.current.suggestions).toEqual([]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    expect(searchAddressLocations).not.toHaveBeenCalled();
  });

  it("resolves a selected destination suggestion and stores the place name", async () => {
    vi.useFakeTimers();
    const { onResolved, result } = renderAutocomplete({ mode: "destination" });

    await act(async () => {
      await result.current.handleSuggestionSelect(
        buildSuggestion({
          inputValue: "Tokyo, Japan",
          primaryText: "Tokyo, Japan",
          secondaryText: undefined,
        })
      );
    });

    expect(result.current.value).toBe("Tokyo Tower");
    expect(onResolved).toHaveBeenCalledWith(retrievedLocation);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    expect(searchLocations).not.toHaveBeenCalled();
  });

  it("does not re-search after selecting a suggestion, even when retrieval is slower than the debounce window", async () => {
    let resolveRetrieve: (location: RetrievedLocation) => void = () => undefined;
    vi.mocked(retrieveLocation).mockReturnValue(
      new Promise<RetrievedLocation>((resolve) => {
        resolveRetrieve = resolve;
      })
    );
    vi.useFakeTimers();

    const { onResolved, result } = renderAutocomplete();

    const selectPromise = result.current.handleSuggestionSelect(buildSuggestion());

    // Advance past the 300ms debounce window while retrieval is still in flight.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    expect(searchAddressLocations).not.toHaveBeenCalled();

    await act(async () => {
      resolveRetrieve(retrievedLocation);
      await selectPromise;
    });

    expect(onResolved).toHaveBeenCalledWith(retrievedLocation);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    expect(searchAddressLocations).not.toHaveBeenCalled();
  });

  it("ignores a retrieve result that was cancelled by later typing and rotates the session token", async () => {
    let resolveRetrieve: (location: RetrievedLocation) => void = () => undefined;
    vi.mocked(retrieveLocation).mockReturnValue(
      new Promise<RetrievedLocation>((resolve) => {
        resolveRetrieve = resolve;
      })
    );
    vi.useFakeTimers();

    const { onResolved, result } = renderAutocomplete();

    const selectPromise = result.current.handleSuggestionSelect(buildSuggestion());

    act(() => {
      result.current.handleInputChange("P");
    });

    await act(async () => {
      resolveRetrieve(retrievedLocation);
      await selectPromise;
    });

    act(() => {
      result.current.handleInputChange("Par");
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    expect(onResolved).not.toHaveBeenCalled();
    expect(result.current.value).toBe("Par");
    expect(searchAddressLocations).toHaveBeenLastCalledWith("Par", "token-2");
  });

  it("shows a toast when retrieving location details fails", async () => {
    vi.mocked(retrieveLocation).mockRejectedValue(new Error("boom"));

    const { onResolved, result } = renderAutocomplete();

    await act(async () => {
      await result.current.handleSuggestionSelect(buildSuggestion());
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Could not load location details");
    });
    expect(onResolved).not.toHaveBeenCalled();
    expect(result.current.retrieveLoading).toBe(false);
  });

  it("rotates the session token after a failed retrieve", async () => {
    vi.mocked(retrieveLocation).mockRejectedValueOnce(new Error("boom"));
    vi.useFakeTimers();

    const { result } = renderAutocomplete();

    await act(async () => {
      await result.current.handleSuggestionSelect(buildSuggestion());
    });

    act(() => {
      result.current.handleInputChange("Par");
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    expect(searchAddressLocations).toHaveBeenLastCalledWith("Par", "token-2");
  });

  it("handles Escape even when there are no suggestions", () => {
    const { result } = renderAutocomplete();
    const event = createKeyEvent("Escape");

    const wasHandled = result.current.handleKeyDown(event);

    expect(wasHandled).toBe(true);
    expect(event.stopPropagation).toHaveBeenCalledOnce();
  });

  it("returns false for unhandled key presses when there are no suggestions", () => {
    const { result } = renderAutocomplete();

    const wasHandled = result.current.handleKeyDown(createKeyEvent("Enter"));

    expect(wasHandled).toBe(false);
  });

  it("moves the highlighted suggestion with arrow keys and selects it on Enter", async () => {
    vi.mocked(searchAddressLocations).mockResolvedValue([
      buildLocationSuggestion(),
      buildLocationSuggestion({
        fullAddress: "1 World Way, Los Angeles, CA",
        mapboxId: "poi-2",
        name: "LAX Airport",
      }),
    ]);
    vi.useFakeTimers();

    const { onResolved, result } = renderAutocomplete({ initialValue: "To" });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    const arrowDownEvent = createKeyEvent("ArrowDown");
    const secondArrowDownEvent = createKeyEvent("ArrowDown");
    const arrowUpEvent = createKeyEvent("ArrowUp");

    act(() => {
      result.current.handleKeyDown(arrowDownEvent);
      result.current.handleKeyDown(secondArrowDownEvent);
      result.current.handleKeyDown(arrowUpEvent);
    });

    expect(result.current.highlightedIndex).toBe(0);
    expect(arrowDownEvent.preventDefault).toHaveBeenCalledOnce();
    expect(secondArrowDownEvent.preventDefault).toHaveBeenCalledOnce();
    expect(arrowUpEvent.preventDefault).toHaveBeenCalledOnce();

    const enterEvent = createKeyEvent("Enter");

    await act(async () => {
      result.current.handleKeyDown(enterEvent);
      await Promise.resolve();
    });

    expect(onResolved).toHaveBeenCalledWith(retrievedLocation);
    expect(enterEvent.preventDefault).toHaveBeenCalledOnce();
  });

  it("resets the input and rotates the session token", async () => {
    vi.useFakeTimers();

    const { onClearResolved, result } = renderAutocomplete({
      initialResolvedValue: "Tokyo Tower",
      initialValue: "Tokyo Tower",
    });

    act(() => {
      result.current.reset();
    });

    expect(onClearResolved).toHaveBeenCalledOnce();
    expect(result.current.value).toBe("");
    expect(result.current.suggestionsLoading).toBe(false);

    act(() => {
      result.current.handleInputChange("Pa");
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    expect(searchAddressLocations).toHaveBeenCalledWith("Pa", "token-2");
  });
});
