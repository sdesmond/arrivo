import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RetrievedLocation } from "@/app/(app)/trips/actions";
import { LocationLookupInput } from "./location-lookup-input";
import type { UseLocationAutocompleteResult } from "./use-location-autocomplete";

const mockUseLocationAutocomplete = vi.fn();

vi.mock("@/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock("./use-location-autocomplete", () => ({
  useLocationAutocomplete: (...args: unknown[]) => mockUseLocationAutocomplete(...args),
}));

const defaultLocation: RetrievedLocation = {
  center: [139.7454, 35.6586],
  country: "Japan",
  countryCode: "JP",
  fullAddress: "4 Chome-2-8 Shibakoen, Minato City, Tokyo",
  name: "Tokyo Tower",
  placeName: "Tokyo Tower",
};

function buildAutocompleteResult(
  overrides: Partial<UseLocationAutocompleteResult> = {}
): UseLocationAutocompleteResult {
  return {
    handleInputChange: vi.fn(),
    handleKeyDown: vi.fn(() => false),
    handleSuggestionSelect: vi.fn(async () => undefined),
    highlightedIndex: -1,
    reset: vi.fn(),
    retrieveLoading: false,
    suggestions: [],
    suggestionsLoading: false,
    ...overrides,
  };
}

describe("LocationLookupInput", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseLocationAutocomplete.mockReturnValue(buildAutocompleteResult());
  });

  it("passes location-mode autocomplete options into the hook and renders a combobox", () => {
    const onValueChange = vi.fn();
    const onResolved = vi.fn();
    const onClearResolved = vi.fn();

    render(
      <LocationLookupInput
        id="event-location"
        value="Tokyo Tower"
        resolvedValue="Tokyo Tower"
        placeholder="Search places"
        className="lookup"
        inputStyle={{ fontFamily: "var(--font-body, ui-sans-serif)" }}
        autoFocus
        disabled
        onValueChange={onValueChange}
        onResolved={onResolved}
        onClearResolved={onClearResolved}
      />
    );

    expect(mockUseLocationAutocomplete).toHaveBeenCalledWith({
      mode: "location",
      onClearResolved,
      onResolved,
      onValueChange,
      resolvedValue: "Tokyo Tower",
      retrieveErrorMessage: "Could not load location details",
      searchErrorMessage: "Could not search locations",
      value: "Tokyo Tower",
    });

    const input = screen.getByRole("combobox");
    expect(input).toHaveAttribute("aria-autocomplete", "list");
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).toHaveAttribute("aria-busy", "false");
    expect(input).toHaveAttribute("aria-haspopup", "listbox");
    expect(input).toHaveAttribute("autocomplete", "off");
    expect(input).toHaveAttribute("placeholder", "Search places");
    expect(input).toHaveClass("lookup");
    expect(input).toBeDisabled();
    expect(input).toHaveStyle({ fontFamily: "var(--font-body, ui-sans-serif)" });
  });

  it("forwards input changes to the autocomplete hook", () => {
    const handleInputChange = vi.fn();
    mockUseLocationAutocomplete.mockReturnValue(
      buildAutocompleteResult({
        handleInputChange,
      })
    );

    render(<LocationLookupInput value="" onValueChange={vi.fn()} onResolved={vi.fn()} />);

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "To" } });

    expect(handleInputChange).toHaveBeenCalledWith("To");
  });

  it("submits when Enter is not handled by the autocomplete hook", () => {
    const onSubmit = vi.fn();
    const handleKeyDown = vi.fn(() => false);
    mockUseLocationAutocomplete.mockReturnValue(
      buildAutocompleteResult({
        handleKeyDown,
      })
    );

    render(
      <LocationLookupInput value="Tokyo Tower" onValueChange={vi.fn()} onResolved={vi.fn()} onSubmit={onSubmit} />
    );

    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });

    expect(handleKeyDown).toHaveBeenCalledOnce();
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("does not submit when Enter is already handled by the autocomplete hook", () => {
    const onSubmit = vi.fn();
    const handleKeyDown = vi.fn(() => true);
    mockUseLocationAutocomplete.mockReturnValue(
      buildAutocompleteResult({
        handleKeyDown,
      })
    );

    render(
      <LocationLookupInput value="Tokyo Tower" onValueChange={vi.fn()} onResolved={vi.fn()} onSubmit={onSubmit} />
    );

    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });

    expect(handleKeyDown).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("renders a loading panel while searching with no suggestions", () => {
    mockUseLocationAutocomplete.mockReturnValue(
      buildAutocompleteResult({
        suggestionsLoading: true,
      })
    );

    render(<LocationLookupInput value="To" onValueChange={vi.fn()} onResolved={vi.fn()} />);

    expect(screen.getByText("Searching...")).toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("renders suggestion options, secondary text, and active descendant state", () => {
    mockUseLocationAutocomplete.mockReturnValue(
      buildAutocompleteResult({
        highlightedIndex: 0,
        suggestions: [
          {
            inputValue: defaultLocation.fullAddress,
            mapboxId: "poi-1",
            primaryText: defaultLocation.name,
            secondaryText: defaultLocation.fullAddress,
          },
          {
            inputValue: "1 World Way, Los Angeles, CA",
            mapboxId: "poi-2",
            primaryText: "LAX Airport",
            secondaryText: "1 World Way, Los Angeles, CA",
          },
        ],
      })
    );

    render(<LocationLookupInput id="reservation-start" value="To" onValueChange={vi.fn()} onResolved={vi.fn()} />);

    expect(screen.getByRole("combobox")).toHaveAttribute(
      "aria-activedescendant",
      "reservation-start-suggestions-option-0"
    );
    expect(screen.getByRole("combobox")).toHaveAttribute("aria-controls", "reservation-start-suggestions");
    expect(screen.getByRole("combobox")).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("option", { name: "Tokyo Tower 4 Chome-2-8 Shibakoen, Minato City, Tokyo" })
    ).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("LAX Airport")).toBeInTheDocument();
    expect(screen.getByText("1 World Way, Los Angeles, CA")).toBeInTheDocument();
  });

  it("selects a suggestion on mouse down without blurring the input", () => {
    const handleSuggestionSelect = vi.fn(async () => undefined);
    mockUseLocationAutocomplete.mockReturnValue(
      buildAutocompleteResult({
        suggestions: [
          {
            inputValue: defaultLocation.fullAddress,
            mapboxId: "poi-1",
            primaryText: defaultLocation.name,
            secondaryText: defaultLocation.fullAddress,
          },
        ],
        handleSuggestionSelect,
      })
    );

    render(<LocationLookupInput value="To" onValueChange={vi.fn()} onResolved={vi.fn()} />);

    const option = screen.getByRole("option", {
      name: "Tokyo Tower 4 Chome-2-8 Shibakoen, Minato City, Tokyo",
    });
    const mouseDownEvent = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    const preventedBeforeDispatch = mouseDownEvent.defaultPrevented;

    option.dispatchEvent(mouseDownEvent);

    expect(preventedBeforeDispatch).toBe(false);
    expect(mouseDownEvent.defaultPrevented).toBe(true);
    expect(handleSuggestionSelect).toHaveBeenCalledWith({
      inputValue: defaultLocation.fullAddress,
      mapboxId: "poi-1",
      primaryText: defaultLocation.name,
      secondaryText: defaultLocation.fullAddress,
    });
  });

  it("marks the combobox busy while retrieving a selection", () => {
    mockUseLocationAutocomplete.mockReturnValue(
      buildAutocompleteResult({
        retrieveLoading: true,
      })
    );

    render(<LocationLookupInput value="Tokyo Tower" onValueChange={vi.fn()} onResolved={vi.fn()} />);

    expect(screen.getByRole("combobox")).toHaveAttribute("aria-busy", "true");
  });
});
