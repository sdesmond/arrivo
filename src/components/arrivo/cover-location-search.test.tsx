import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import type { LocationSuggestion } from "@/data/types";
import { CoverLocationSearch, type CoverLocationSearchProps } from "./cover-location-search";

const { searchLocations, retrieveLocation } = vi.hoisted(() => ({
  searchLocations: vi.fn(),
  retrieveLocation: vi.fn(),
}));

vi.mock("@/app/(app)/trips/actions", () => ({ searchLocations, retrieveLocation }));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

function suggestion(placeName: string, mapboxId: string): LocationSuggestion {
  return { placeName, country: "France", countryCode: "FR", mapboxId };
}

function Harness({
  initialValue = "",
  activeLocation = null,
  onLocationSelected,
}: {
  initialValue?: string;
  activeLocation?: CoverLocationSearchProps["activeLocation"];
  onLocationSelected: CoverLocationSearchProps["onLocationSelected"];
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <CoverLocationSearch
      value={value}
      activeLocation={activeLocation}
      onValueChange={setValue}
      onLocationSelected={onLocationSelected}
    />
  );
}

const combobox = () => screen.getByRole("combobox");

async function advance(milliseconds = 300): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}

async function typeAndWait(value: string): Promise<void> {
  fireEvent.change(combobox(), { target: { value } });
  await advance();
}

describe("CoverLocationSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    let tokenCounter = 0;
    vi.spyOn(globalThis.crypto, "randomUUID").mockImplementation(() => {
      tokenCounter += 1;
      return `token-${tokenCounter}` as ReturnType<Crypto["randomUUID"]>;
    });
    searchLocations.mockResolvedValue([
      suggestion("Paris, France", "paris-fr"),
      suggestion("Paris, Texas, United States", "paris-tx"),
    ]);
    retrieveLocation.mockResolvedValue({ center: [2.35, 48.86] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders a labelled, collapsed combobox", () => {
    render(<Harness onLocationSelected={vi.fn()} />);

    expect(screen.getByRole("combobox", { name: "Search location for photos" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("searches only after the debounce, with the trimmed query and session token", async () => {
    render(<Harness onLocationSelected={vi.fn()} />);

    fireEvent.change(combobox(), { target: { value: " Par " } });
    await advance(299);
    expect(searchLocations).not.toHaveBeenCalled();
    await advance(1);

    expect(searchLocations).toHaveBeenCalledExactlyOnceWith("Par", "token-1");
  });

  it("does not search short queries or the active location query", async () => {
    render(<Harness activeLocation={{ query: "Paris" }} onLocationSelected={vi.fn()} />);

    await typeAndWait("P");
    await typeAndWait("Paris");

    expect(searchLocations).not.toHaveBeenCalled();
  });

  it("lists simplified suggestion names, at most five", async () => {
    searchLocations.mockResolvedValue(
      Array.from({ length: 6 }, (_, index) => suggestion(`Place ${index}, Region, Country`, `id-${index}`))
    );
    render(<Harness onLocationSelected={vi.fn()} />);

    await typeAndWait("Place");

    expect(screen.getAllByRole("option")).toHaveLength(5);
    expect(screen.getByRole("option", { name: "Place 0, Region" })).toBeInTheDocument();
    expect(combobox()).toHaveAttribute("aria-expanded", "true");
  });

  it("retrieves a clicked suggestion, reports its center and rotates the session token", async () => {
    const onLocationSelected = vi.fn();
    render(<Harness onLocationSelected={onLocationSelected} />);
    await typeAndWait("Par");

    await act(async () => {
      fireEvent.mouseDown(screen.getByRole("option", { name: "Paris, Texas" }));
    });

    expect(retrieveLocation).toHaveBeenCalledWith("paris-tx", "token-1");
    expect(onLocationSelected).toHaveBeenCalledWith({ query: "Paris, Texas", center: [2.35, 48.86] });
    expect(combobox()).toHaveValue("Paris, Texas");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    await typeAndWait("Rome");
    expect(searchLocations).toHaveBeenLastCalledWith("Rome", expect.stringMatching(/^token-(?!1$)/));
  });

  it("moves the highlight with the arrow keys and selects with Enter", async () => {
    const onLocationSelected = vi.fn();
    render(<Harness onLocationSelected={onLocationSelected} />);
    await typeAndWait("Par");

    fireEvent.keyDown(combobox(), { key: "Enter" });
    expect(retrieveLocation).not.toHaveBeenCalled();

    fireEvent.keyDown(combobox(), { key: "ArrowDown" });
    fireEvent.keyDown(combobox(), { key: "ArrowDown" });
    fireEvent.keyDown(combobox(), { key: "ArrowDown" });
    expect(screen.getByRole("option", { name: "Paris, Texas" })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(combobox(), { key: "ArrowUp" });
    fireEvent.keyDown(combobox(), { key: "ArrowUp" });
    expect(combobox()).toHaveAttribute("aria-activedescendant", "cover-image-search-suggestion-0");

    await act(async () => {
      fireEvent.keyDown(combobox(), { key: "Enter" });
    });

    expect(onLocationSelected).toHaveBeenCalledWith({ query: "Paris, France", center: [2.35, 48.86] });
  });

  it("closes the suggestions on Escape without letting the key travel further", async () => {
    const onOuterKeyDown = vi.fn();
    render(
      <div onKeyDown={onOuterKeyDown}>
        <Harness onLocationSelected={vi.fn()} />
      </div>
    );
    await typeAndWait("Par");

    fireEvent.keyDown(combobox(), { key: "Escape" });

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onOuterKeyDown).not.toHaveBeenCalled();
  });

  it("shows a toast and no suggestions when the search fails", async () => {
    searchLocations.mockRejectedValue(new Error("down"));
    render(<Harness onLocationSelected={vi.fn()} />);

    await typeAndWait("Par");

    expect(toast.error).toHaveBeenCalledWith("Could not search locations");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("ignores a search result that arrives after the input changed", async () => {
    let finish!: (results: LocationSuggestion[]) => void;
    searchLocations.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    render(<Harness onLocationSelected={vi.fn()} />);
    await typeAndWait("Par");

    fireEvent.change(combobox(), { target: { value: "Rome" } });
    await act(async () => {
      finish([suggestion("Paris, France", "paris-fr")]);
    });

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("reports the query without a center when the retrieve fails", async () => {
    retrieveLocation.mockRejectedValue(new Error("down"));
    const onLocationSelected = vi.fn();
    render(<Harness onLocationSelected={onLocationSelected} />);
    await typeAndWait("Par");

    await act(async () => {
      fireEvent.mouseDown(screen.getByRole("option", { name: "Paris, France" }));
    });

    expect(onLocationSelected).toHaveBeenCalledWith({ query: "Paris, France" });
    expect(toast.error).not.toHaveBeenCalled();
  });
});
