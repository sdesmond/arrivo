// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { mockSearchLocations, mockRetrieveLocation } = vi.hoisted(() => ({
  mockSearchLocations: vi.fn(),
  mockRetrieveLocation: vi.fn(),
}));

vi.mock("@/app/(app)/trips/actions", () => ({
  searchLocations: mockSearchLocations,
  retrieveLocation: mockRetrieveLocation,
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({
    children,
    open,
    onOpenChange,
  }: {
    children: React.ReactNode;
    open: boolean;
    onOpenChange?: (o: boolean) => void;
  }) =>
    open ? (
      <div
        role="dialog"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape") onOpenChange?.(false);
        }}
      >
        {children}
      </div>
    ) : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/ui/date-range-picker", () => ({
  DateRangePicker: ({
    start,
    end,
    onChange,
  }: {
    start?: string;
    end?: string;
    onChange: (start: string | undefined, end: string | undefined) => void;
  }) => (
    <div>
      <button type="button" onClick={() => onChange("2026-06-01", "2026-06-10")}>
        Optional date range
      </button>
      <span data-testid="date-value">
        {start ?? "none"}-{end ?? "none"}
      </span>
    </div>
  ),
}));

import { toast } from "sonner";
import { NewTripDialog } from "./new-trip-dialog";

describe("NewTripDialog", () => {
  it("focuses the title field when opened", async () => {
    render(<NewTripDialog open onOpenChange={vi.fn()} />);
    const title = screen.getByLabelText(/title/i);
    await waitFor(() => expect(title).toHaveFocus());
  });

  it("renders title, date range, and budget fields", () => {
    render(<NewTripDialog open onOpenChange={vi.fn()} />);
    expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /optional date range/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/budget/i)).toBeInTheDocument();
  });

  it("keeps Create disabled until the title has non-whitespace content", async () => {
    const user = userEvent.setup();
    render(<NewTripDialog open onOpenChange={vi.fn()} />);
    const create = screen.getByRole("button", { name: /create/i });
    expect(create).toBeDisabled();
    await user.type(screen.getByLabelText(/title/i), "   ");
    expect(create).toBeDisabled();
    await user.type(screen.getByLabelText(/title/i), "A");
    expect(create).toBeEnabled();
  });

  it("disables Create button when isPending=true", async () => {
    const user = userEvent.setup();
    render(<NewTripDialog open onOpenChange={vi.fn()} isPending />);
    await user.type(screen.getByLabelText(/title/i), "Paris");
    expect(screen.getByRole("button", { name: /creating/i })).toBeDisabled();
  });

  it("shows Creating text on Create button when isPending=true", async () => {
    const user = userEvent.setup();
    render(<NewTripDialog open onOpenChange={vi.fn()} isPending />);
    await user.type(screen.getByLabelText(/title/i), "Paris");
    expect(screen.getByRole("button", { name: /creating/i })).toBeInTheDocument();
  });

  it("shows inline validation when form is submitted with a whitespace-only title", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(<NewTripDialog open onOpenChange={vi.fn()} onCreate={onCreate} />);
    await user.type(screen.getByLabelText(/title/i), "   ");
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
    expect(screen.getByRole("status")).toHaveTextContent("Enter a trip title.");
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("filters budget input to numeric currency characters", async () => {
    const user = userEvent.setup();
    render(<NewTripDialog open onOpenChange={vi.fn()} />);
    const budget = screen.getByLabelText(/budget/i);
    await user.type(budget, "a12.345x");
    expect(budget).toHaveValue("12.34");
  });

  it("coerces lone decimal point budget to undefined on submit", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(<NewTripDialog open onOpenChange={vi.fn()} onCreate={onCreate} />);
    await user.type(screen.getByLabelText(/title/i), "Paris");
    await user.type(screen.getByLabelText(/budget/i), ".");
    await user.click(screen.getByRole("button", { name: /create/i }));
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ budgetAmount: undefined }));
  });

  it("coerces trailing decimal point budget to integer on submit", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(<NewTripDialog open onOpenChange={vi.fn()} onCreate={onCreate} />);
    await user.type(screen.getByLabelText(/title/i), "Paris");
    await user.type(screen.getByLabelText(/budget/i), "100.");
    await user.click(screen.getByRole("button", { name: /create/i }));
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ budgetAmount: "100" }));
  });

  it("submits a trimmed draft through onCreate", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(<NewTripDialog open onOpenChange={vi.fn()} onCreate={onCreate} />);
    await user.type(screen.getByLabelText(/title/i), "  Paris  ");
    await user.click(screen.getByRole("button", { name: /optional date range/i }));
    await user.type(screen.getByLabelText(/budget/i), "1500");
    await user.click(screen.getByRole("button", { name: /create/i }));
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Paris",
        startDate: "2026-06-01",
        endDate: "2026-06-10",
        budgetAmount: "1500",
        destinationName: undefined,
        destinationCountry: undefined,
        destinationCountryCode: undefined,
        destinationCenter: undefined,
      })
    );
  });

  it("renders nothing when closed (open=false)", () => {
    render(<NewTripDialog open={false} onOpenChange={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes without submitting when onCreate is not provided", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<NewTripDialog open onOpenChange={onOpenChange} />);
    await user.type(screen.getByLabelText(/title/i), "Paris");
    await user.click(screen.getByRole("button", { name: /create/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes without submit on Cancel", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onCreate = vi.fn();
    render(<NewTripDialog open onOpenChange={onOpenChange} onCreate={onCreate} />);
    await user.type(screen.getByLabelText(/title/i), "Paris");
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("closes without submit on Escape", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onCreate = vi.fn();
    render(<NewTripDialog open onOpenChange={onOpenChange} onCreate={onCreate} />);
    screen.getByRole("dialog").focus();
    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onCreate).not.toHaveBeenCalled();
  });

  describe("destination autocomplete", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      mockSearchLocations.mockResolvedValue([
        {
          placeName: "Paris, France",
          country: "France",
          countryCode: "FR",
          mapboxId: "paris-france-id",
        },
        {
          placeName: "Paris, Texas",
          country: "United States",
          countryCode: "US",
          mapboxId: "paris-texas-id",
        },
      ]);
      mockRetrieveLocation.mockResolvedValue({
        placeName: "Paris, France",
        country: "France",
        countryCode: "FR",
        center: [2.35, 48.85],
      });
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.clearAllMocks();
    });

    it("renders the destination field", () => {
      render(<NewTripDialog open onOpenChange={vi.fn()} />);
      expect(screen.getByLabelText(/destination/i)).toBeInTheDocument();
    });

    it("fires the destination search after the 300ms debounce", async () => {
      render(<NewTripDialog open onOpenChange={vi.fn()} />);
      const destination = screen.getByLabelText(/destination/i);

      act(() => {
        fireEvent.change(destination, { target: { value: "Par" } });
      });
      expect(mockSearchLocations).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });

      expect(mockSearchLocations).toHaveBeenCalledWith("Par", expect.any(String));
    });

    it("selects a suggestion and includes destination data in the submitted draft", async () => {
      const onCreate = vi.fn();
      render(<NewTripDialog open onOpenChange={vi.fn()} onCreate={onCreate} />);

      act(() => {
        fireEvent.change(screen.getByLabelText(/title/i), { target: { value: "Europe Trip" } });
        fireEvent.change(screen.getByLabelText(/destination/i), { target: { value: "Par" } });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });

      expect(screen.getByRole("option", { name: "Paris, France" })).toBeInTheDocument();
      await act(async () => {
        fireEvent.mouseDown(screen.getByRole("option", { name: "Paris, France" }));
      });

      expect(screen.getByLabelText(/destination/i)).toHaveValue("Paris, France");

      act(() => {
        fireEvent.click(screen.getByRole("button", { name: /create/i }));
      });

      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          destinationName: "Paris, France",
          destinationCountry: "France",
          destinationCountryCode: "FR",
          destinationCenter: [2.35, 48.85],
        })
      );
    });

    it("clears destination data when typing after a selection", async () => {
      const onCreate = vi.fn();
      render(<NewTripDialog open onOpenChange={vi.fn()} onCreate={onCreate} />);

      act(() => {
        fireEvent.change(screen.getByLabelText(/title/i), { target: { value: "Anywhere" } });
        fireEvent.change(screen.getByLabelText(/destination/i), { target: { value: "Par" } });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
      expect(screen.getByRole("option", { name: "Paris, France" })).toBeInTheDocument();
      // mouseDown starts the async retrieve; immediately typing cancels it via cancelRetrieveRef
      act(() => {
        fireEvent.mouseDown(screen.getByRole("option", { name: "Paris, France" }));
      });
      act(() => {
        fireEvent.change(screen.getByLabelText(/destination/i), { target: { value: "Paris, Francex" } });
        fireEvent.click(screen.getByRole("button", { name: /create/i }));
      });

      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          destinationName: undefined,
          destinationCountry: undefined,
          destinationCountryCode: undefined,
          destinationCenter: undefined,
        })
      );
    });

    it("discards search results that arrive after a newer search started", async () => {
      // Simulate a slow first search followed immediately by input change
      let resolveFirstSearch!: (v: unknown) => void;
      mockSearchLocations.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirstSearch = resolve;
        })
      );

      render(<NewTripDialog open onOpenChange={vi.fn()} />);

      // Start the first search
      act(() => {
        fireEvent.change(screen.getByLabelText(/destination/i), { target: { value: "Par" } });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });

      // Change input before first search resolves — sets active = false for first effect
      act(() => {
        fireEvent.change(screen.getByLabelText(/destination/i), { target: { value: "Par2" } });
      });

      // Resolve the stale first search — should be discarded (!active branch)
      await act(async () => {
        resolveFirstSearch([{ placeName: "Paris, France", country: "France", countryCode: "FR", mapboxId: "x" }]);
      });

      // "Par2" debounce timer hasn't fired yet, so no new suggestions either
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });

    it("shows a toast when location search fails", async () => {
      mockSearchLocations.mockRejectedValueOnce(new Error("Mapbox down"));
      render(<NewTripDialog open onOpenChange={vi.fn()} />);

      act(() => {
        fireEvent.change(screen.getByLabelText(/destination/i), { target: { value: "Par" } });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });

      expect(toast.error).toHaveBeenCalledWith("Could not search locations");
    });

    it("supports keyboard selection with ArrowDown and Enter", async () => {
      const onCreate = vi.fn();
      render(<NewTripDialog open onOpenChange={vi.fn()} onCreate={onCreate} />);
      const destination = screen.getByLabelText(/destination/i);

      act(() => {
        fireEvent.change(screen.getByLabelText(/title/i), { target: { value: "Keyboard Trip" } });
        fireEvent.change(destination, { target: { value: "Par" } });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
      expect(screen.getByRole("option", { name: "Paris, France" })).toBeInTheDocument();

      act(() => {
        fireEvent.keyDown(destination, { key: "ArrowDown" });
      });
      await act(async () => {
        fireEvent.keyDown(destination, { key: "Enter" });
      });
      expect(screen.getByLabelText(/destination/i)).toHaveValue("Paris, France");

      act(() => {
        fireEvent.click(screen.getByRole("button", { name: /create/i }));
      });
      expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ destinationName: "Paris, France" }));
    });

    it("closes the dropdown on Escape without selecting a destination", async () => {
      render(<NewTripDialog open onOpenChange={vi.fn()} />);
      const destination = screen.getByLabelText(/destination/i);

      act(() => {
        fireEvent.change(destination, { target: { value: "Par" } });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
      expect(screen.getByRole("listbox")).toBeInTheDocument();

      act(() => {
        fireEvent.keyDown(destination, { key: "Escape" });
      });

      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      expect(screen.getByLabelText(/destination/i)).toHaveValue("Par");
    });

    it("shows a toast when retrieveLocation fails", async () => {
      mockRetrieveLocation.mockRejectedValueOnce(new Error("Retrieve failed"));
      render(<NewTripDialog open onOpenChange={vi.fn()} />);

      act(() => {
        fireEvent.change(screen.getByLabelText(/destination/i), { target: { value: "Par" } });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
      expect(screen.getByRole("option", { name: "Paris, France" })).toBeInTheDocument();

      await act(async () => {
        fireEvent.mouseDown(screen.getByRole("option", { name: "Paris, France" }));
      });

      expect(toast.error).toHaveBeenCalledWith("Could not load location details");
    });

    it("discards a retrieve result when the user types before it resolves", async () => {
      const onCreate = vi.fn();
      // Delay retrieve so we can type before it resolves
      let resolveRetrieve!: (v: unknown) => void;
      mockRetrieveLocation.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveRetrieve = resolve;
        })
      );

      render(<NewTripDialog open onOpenChange={vi.fn()} onCreate={onCreate} />);
      act(() => {
        fireEvent.change(screen.getByLabelText(/title/i), { target: { value: "Cancel Trip" } });
        fireEvent.change(screen.getByLabelText(/destination/i), { target: { value: "Par" } });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });

      // Click suggestion — retrieve is now in-flight
      act(() => {
        fireEvent.mouseDown(screen.getByRole("option", { name: "Paris, France" }));
      });

      // Type before retrieve resolves — cancels the retrieve result
      act(() => {
        fireEvent.change(screen.getByLabelText(/destination/i), { target: { value: "Par" } });
      });

      // Now resolve the retrieve — should be discarded
      await act(async () => {
        resolveRetrieve({
          placeName: "Paris, France",
          country: "France",
          countryCode: "FR",
          center: [2.35, 48.85],
        });
      });

      // Submit — destinationData should be null (cancelled)
      act(() => {
        fireEvent.click(screen.getByRole("button", { name: /create/i }));
      });
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({ destinationName: undefined, destinationCenter: undefined })
      );
    });
  });
});
