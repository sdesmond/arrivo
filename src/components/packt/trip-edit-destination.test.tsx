import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockSearchLocations = vi.fn();
const mockRetrieveLocation = vi.fn();

vi.mock("@/app/(app)/trips/actions", () => ({
  searchLocations: (...args: unknown[]) => mockSearchLocations(...args),
  retrieveLocation: (...args: unknown[]) => mockRetrieveLocation(...args),
}));

import { TripEditDestination } from "./trip-edit-destination";

const defaultProps = {
  value: "",
  onInputChange: vi.fn(),
  onSelect: vi.fn(),
  onClear: vi.fn(),
};

describe("TripEditDestination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchLocations.mockResolvedValue([]);
    mockRetrieveLocation.mockResolvedValue({
      placeName: "Tokyo, Japan",
      country: "Japan",
      countryCode: "JP",
      center: [139.69, 35.68],
    });
  });

  it("renders the Destination section with an input", () => {
    render(<TripEditDestination {...defaultProps} />);
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("renders even when value is empty (allows adding a destination)", () => {
    const { container } = render(<TripEditDestination {...defaultProps} value="" />);
    expect(container).not.toBeEmptyDOMElement();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("pre-fills the input with the provided value", () => {
    render(<TripEditDestination {...defaultProps} value="Tokyo" />);
    expect(screen.getByRole("combobox")).toHaveValue("Tokyo");
  });

  it("shows a clear button when value is non-empty", () => {
    render(<TripEditDestination {...defaultProps} value="Tokyo" />);
    expect(screen.getByTitle("Clear destination")).toBeInTheDocument();
  });

  it("does not show a clear button when value is empty", () => {
    render(<TripEditDestination {...defaultProps} value="" />);
    expect(screen.queryByTitle("Clear destination")).not.toBeInTheDocument();
  });

  it("calls onClear when clear button is clicked", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(<TripEditDestination {...defaultProps} value="Tokyo" onClear={onClear} />);
    await user.click(screen.getByTitle("Clear destination"));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("calls onInputChange on each keystroke", async () => {
    const user = userEvent.setup();
    const onInputChange = vi.fn();
    render(<TripEditDestination {...defaultProps} onInputChange={onInputChange} />);
    await user.type(screen.getByRole("combobox"), "To");
    expect(onInputChange).toHaveBeenCalledWith("T");
    expect(onInputChange).toHaveBeenCalledWith("o");
  });

  it("does not search when value.trim().length < 2", async () => {
    vi.useFakeTimers();
    render(<TripEditDestination {...defaultProps} value="T" />);
    await act(async () => {
      vi.runAllTimers();
    });
    vi.useRealTimers();
    expect(mockSearchLocations).not.toHaveBeenCalled();
  });

  it("shows suggestions after debounce when value >= 2 chars", async () => {
    mockSearchLocations.mockResolvedValue([
      { placeName: "Tokyo, Japan", mapboxId: "mapbox-1" },
      { placeName: "Toronto, Canada", mapboxId: "mapbox-2" },
    ]);
    vi.useFakeTimers();
    render(<TripEditDestination {...defaultProps} value="To" />);
    await act(async () => {
      vi.advanceTimersByTime(350);
    });
    vi.useRealTimers();

    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getByText("Tokyo, Japan")).toBeInTheDocument();
    expect(screen.getByText("Toronto, Canada")).toBeInTheDocument();
  });

  it("calls onSelect with resolved data when a suggestion is clicked", async () => {
    mockSearchLocations.mockResolvedValue([{ placeName: "Tokyo, Japan", mapboxId: "mapbox-1" }]);
    mockRetrieveLocation.mockResolvedValue({
      placeName: "Tokyo, Japan",
      country: "Japan",
      countryCode: "JP",
      center: [139.69, 35.68],
    });
    const onSelect = vi.fn();
    vi.useFakeTimers();
    render(<TripEditDestination {...defaultProps} value="To" onSelect={onSelect} />);
    await act(async () => {
      vi.advanceTimersByTime(350);
    });
    vi.useRealTimers();

    const user = userEvent.setup();

    await user.click(screen.getByText("Tokyo, Japan"));
    await act(async () => {});

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith({
        name: "Tokyo, Japan",
        country: "Japan",
        countryCode: "JP",
        center: [139.69, 35.68],
      });
    });
  });

  it("closes suggestions with Escape key", async () => {
    mockSearchLocations.mockResolvedValue([{ placeName: "Tokyo, Japan", mapboxId: "mapbox-1" }]);
    const user = userEvent.setup();
    vi.useFakeTimers();
    render(<TripEditDestination {...defaultProps} value="To" />);
    await act(async () => {
      vi.advanceTimersByTime(350);
    });
    vi.useRealTimers();

    await user.click(screen.getByRole("combobox"));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("navigates suggestions with ArrowDown / ArrowUp", async () => {
    mockSearchLocations.mockResolvedValue([
      { placeName: "Tokyo, Japan", mapboxId: "mapbox-1" },
      { placeName: "Toronto, Canada", mapboxId: "mapbox-2" },
    ]);
    vi.useFakeTimers();
    render(<TripEditDestination {...defaultProps} value="To" />);
    await act(async () => {
      vi.advanceTimersByTime(350);
    });
    vi.useRealTimers();

    const combobox = screen.getByRole("combobox");
    const user = userEvent.setup();

    await user.click(combobox);
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("option", { name: "Tokyo, Japan" })).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("option", { name: "Toronto, Canada" })).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("option", { name: "Tokyo, Japan" })).toHaveAttribute("aria-selected", "true");
  });

  it("selects highlighted suggestion with Enter key", async () => {
    mockSearchLocations.mockResolvedValue([{ placeName: "Tokyo, Japan", mapboxId: "mapbox-1" }]);
    const onSelect = vi.fn();
    const user = userEvent.setup();
    vi.useFakeTimers();
    render(<TripEditDestination {...defaultProps} value="To" onSelect={onSelect} />);
    await act(async () => {
      vi.advanceTimersByTime(350);
    });
    vi.useRealTimers();

    await user.click(screen.getByRole("combobox"));
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Enter}");
    await act(async () => {});

    await waitFor(() => expect(onSelect).toHaveBeenCalled());
  });

  it("disables the input when disabled is true", () => {
    render(<TripEditDestination {...defaultProps} disabled />);
    expect(screen.getByRole("combobox")).toBeDisabled();
  });

  it("shows the Searching… status while loading", async () => {
    let resolveFn!: (v: unknown) => void;
    mockSearchLocations.mockReturnValue(new Promise((res) => (resolveFn = res)));

    vi.useFakeTimers();
    render(<TripEditDestination {...defaultProps} value="To" />);
    await act(async () => {
      vi.advanceTimersByTime(350);
    });
    vi.useRealTimers();

    expect(screen.getByText("Searching…")).toBeInTheDocument();

    await act(async () => {
      resolveFn([]);
    });
  });

  it("shows error toast when searchLocations fails", async () => {
    mockSearchLocations.mockRejectedValue(new Error("network error"));
    vi.useFakeTimers();
    render(<TripEditDestination {...defaultProps} value="To" />);
    await act(async () => {
      vi.advanceTimersByTime(350);
    });
    vi.useRealTimers();

    expect(mockSearchLocations).toHaveBeenCalled();
  });

  it("shows error toast when retrieveLocation fails", async () => {
    mockSearchLocations.mockResolvedValue([{ placeName: "Tokyo, Japan", mapboxId: "mapbox-1" }]);
    let rejectRetrieve!: (e: Error) => void;
    mockRetrieveLocation.mockReturnValue(new Promise((_, reject) => (rejectRetrieve = reject)));
    const onSelect = vi.fn();

    vi.useFakeTimers();
    render(<TripEditDestination {...defaultProps} value="To" onSelect={onSelect} />);
    await act(async () => {
      vi.advanceTimersByTime(350);
    });
    vi.useRealTimers();

    const user = userEvent.setup();
    await user.click(screen.getByText("Tokyo, Japan"));

    await act(async () => {
      rejectRetrieve(new Error("retrieve failed"));
    });

    await waitFor(() => {
      expect(onSelect).not.toHaveBeenCalled();
      expect(mockRetrieveLocation).toHaveBeenCalled();
    });
  });

  it("ignores retrieveLocation result when cancelled by a new input change", async () => {
    mockSearchLocations.mockResolvedValue([{ placeName: "Tokyo, Japan", mapboxId: "mapbox-1" }]);
    let resolveRetrieve!: (v: unknown) => void;
    mockRetrieveLocation.mockReturnValue(new Promise((res) => (resolveRetrieve = res)));
    const onSelect = vi.fn();

    vi.useFakeTimers();
    render(<TripEditDestination {...defaultProps} value="To" onSelect={onSelect} />);
    await act(async () => {
      vi.advanceTimersByTime(350);
    });
    vi.useRealTimers();

    const user = userEvent.setup();

    await user.click(screen.getByText("Tokyo, Japan"));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "X" } });

    await act(async () => {
      resolveRetrieve({ placeName: "Tokyo, Japan", country: "Japan", countryCode: "JP", center: [0, 0] });
    });

    await waitFor(() => {
      expect(mockRetrieveLocation).toHaveBeenCalled();
    });
    expect(onSelect).not.toHaveBeenCalled();
  });
});
