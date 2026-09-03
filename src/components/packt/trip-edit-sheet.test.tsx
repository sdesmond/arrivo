import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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
    <>
      <input
        data-testid="date-range-start"
        value={start ?? ""}
        onChange={(event) => onChange(event.target.value || undefined, end)}
      />
      <input
        data-testid="date-range-end"
        value={end ?? ""}
        onChange={(event) => onChange(start, event.target.value || undefined)}
      />
    </>
  ),
}));

vi.mock("./trip-edit-destination", () => ({
  TripEditDestination: ({
    value,
    onInputChange,
    onSelect,
    onClear,
  }: {
    value: string;
    onInputChange: (text: string) => void;
    onSelect: (data: {
      name: string;
      country: string | null;
      countryCode: string | null;
      center: [number, number];
    }) => void;
    onClear: () => void;
  }) => (
    <div>
      <input data-testid="destination-input" value={value} onChange={(event) => onInputChange(event.target.value)} />
      <button onClick={() => onSelect({ name: "Tokyo", country: "Japan", countryCode: "JP", center: [139.69, 35.68] })}>
        select-destination
      </button>
      <button onClick={() => onClear()}>clear-destination</button>
    </div>
  ),
}));

vi.mock("@/components/ui/drawer", () => ({
  Drawer: (props: { children: React.ReactNode; open: boolean; onOpenChange?: (o: boolean) => void }) =>
    props.open ? (
      <>
        {props.children}
        <button data-testid="sheet-close-trigger" onClick={() => props.onOpenChange?.(false)} />
        <button data-testid="sheet-open-trigger" onClick={() => props.onOpenChange?.(true)} />
      </>
    ) : null,
  DrawerContent: (props: { children: React.ReactNode }) => <>{props.children}</>,
  DrawerHeader: (props: { children: React.ReactNode }) => <>{props.children}</>,
  DrawerFooter: (props: { children: React.ReactNode }) => <>{props.children}</>,
  DrawerTitle: (props: { children: React.ReactNode }) => <>{props.children}</>,
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({
    children,
    open,
    onOpenChange,
  }: {
    children: React.ReactNode;
    open: boolean;
    onOpenChange?: (open: boolean) => void;
  }) =>
    open ? (
      <>
        {children}
        <button data-testid="currency-dialog-dismiss" onClick={() => onOpenChange?.(false)} />
      </>
    ) : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children, open }: { children: React.ReactNode; open: boolean }) => (open ? <>{children}</> : null),
  AlertDialogContent: (props: { children: React.ReactNode }) => <>{props.children}</>,
  AlertDialogHeader: (props: { children: React.ReactNode }) => <>{props.children}</>,
  AlertDialogTitle: (props: { children: React.ReactNode }) => <>{props.children}</>,
  AlertDialogDescription: (props: { children: React.ReactNode }) => <>{props.children}</>,
  AlertDialogFooter: (props: { children: React.ReactNode }) => <>{props.children}</>,
  AlertDialogCancel: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
  AlertDialogAction: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
}));

import { TripEditSheet } from "./trip-edit-sheet";
import {
  TransitMode,
  TripCurrencyChangeMode,
  TripDateConflictResolution,
  type Expense,
  type Trip,
  type UpdateTripPatch,
} from "@/data/types";
import { listSupportedCurrencies } from "@/lib/currencies";

const currencyOptions = listSupportedCurrencies();

function getCurrencyOption(code: string) {
  const option = currencyOptions.find((currencyOption) => currencyOption.code === code);

  if (!option) {
    throw new Error(`Missing currency option for ${code}`);
  }

  return screen.getByRole("option", { name: `${option.name} ${option.code}` });
}

const baseTrip: Trip = {
  id: "trip-1",
  name: "Tokyo Adventure",
  status: "upcoming",
  startDate: "2026-06-01",
  endDate: "2026-06-10",
  budget: {
    currency: "USD",
    total: 3000,
  },
  transitMode: TransitMode.Drive,
};

describe("TripEditSheet", () => {
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  });

  it("renders pre-filled trip name", () => {
    render(<TripEditSheet currencyOptions={currencyOptions} trip={baseTrip} open onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByDisplayValue("Tokyo Adventure")).toBeInTheDocument();
  });

  it("renders pre-filled start and end dates", () => {
    render(<TripEditSheet currencyOptions={currencyOptions} trip={baseTrip} open onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByTestId("date-range-start")).toHaveValue("2026-06-01");
    expect(screen.getByTestId("date-range-end")).toHaveValue("2026-06-10");
  });

  it("applies the highlight pulse ring to the dates field when highlightDates is true", () => {
    render(
      <TripEditSheet
        currencyOptions={currencyOptions}
        trip={baseTrip}
        open
        onClose={vi.fn()}
        onSave={vi.fn()}
        highlightDates
      />
    );
    const datesField = screen.getByTestId("trip-edit-dates-field");
    expect(datesField).toHaveClass("highlight-pulse-ring");
  });

  it("does not highlight the dates field by default", () => {
    render(<TripEditSheet currencyOptions={currencyOptions} trip={baseTrip} open onClose={vi.fn()} onSave={vi.fn()} />);
    const datesField = screen.getByTestId("trip-edit-dates-field");
    expect(datesField).not.toHaveClass("highlight-pulse-ring");
  });

  it("renders the budget total input with the current currency", () => {
    render(<TripEditSheet currencyOptions={currencyOptions} trip={baseTrip} open onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByDisplayValue("3000")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Currency: United States Dollar USD/i })).toBeInTheDocument();
  });

  it("budget section label text is visible", () => {
    render(<TripEditSheet currencyOptions={currencyOptions} trip={baseTrip} open onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Currency: United States Dollar USD/i })).toBeInTheDocument();
  });

  it.each([undefined, true])("shows the Budget section when canEditBudget is %s", (canEditBudget) => {
    render(
      <TripEditSheet
        currencyOptions={currencyOptions}
        trip={baseTrip}
        open
        onClose={vi.fn()}
        onSave={vi.fn()}
        canEditBudget={canEditBudget}
      />
    );

    expect(screen.getByText("Budget")).toBeInTheDocument();
  });

  it("hides the Budget section when canEditBudget is false", () => {
    render(
      <TripEditSheet
        currencyOptions={currencyOptions}
        trip={baseTrip}
        open
        onClose={vi.fn()}
        onSave={vi.fn()}
        canEditBudget={false}
      />
    );

    expect(screen.queryByText("Budget")).not.toBeInTheDocument();
  });

  it("Cancel button calls onClose", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<TripEditSheet currencyOptions={currencyOptions} trip={baseTrip} open onClose={onClose} onSave={vi.fn()} />);
    await user.click(screen.getAllByRole("button", { name: /cancel/i })[0]);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("Save button calls onSave with current draft values", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<TripEditSheet currencyOptions={currencyOptions} trip={baseTrip} open onClose={vi.fn()} onSave={onSave} />);
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(onSave).toHaveBeenCalledOnce();
    const patch: UpdateTripPatch = onSave.mock.calls[0][0];
    expect(patch.name).toBe("Tokyo Adventure");
    expect(patch.startDate).toBe("2026-06-01");
    expect(patch.endDate).toBe("2026-06-10");
    expect(patch.budgetTotal).toBe(3000);
    expect(patch).not.toHaveProperty("coverImageUrl");
  });

  it("Save button omits coverImageUrl when trip has a cover", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const tripWithCover: Trip = { ...baseTrip, coverImageUrl: "https://example.com/cover.jpg" };
    render(
      <TripEditSheet currencyOptions={currencyOptions} trip={tripWithCover} open onClose={vi.fn()} onSave={onSave} />
    );
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    const patch: UpdateTripPatch = onSave.mock.calls[0][0];
    expect(patch).not.toHaveProperty("coverImageUrl");
  });

  it("onSave includes modified name after editing", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<TripEditSheet currencyOptions={currencyOptions} trip={baseTrip} open onClose={vi.fn()} onSave={onSave} />);
    const nameInput = screen.getByDisplayValue("Tokyo Adventure");
    await user.clear(nameInput);
    await user.type(nameInput, "Kyoto Journey");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: "Kyoto Journey" }));
  });

  it("resets the trip dates after closing and reopening without saving", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <TripEditSheet currencyOptions={currencyOptions} trip={baseTrip} open onClose={vi.fn()} onSave={vi.fn()} />
    );

    await user.clear(screen.getByTestId("date-range-start"));
    await user.type(screen.getByTestId("date-range-start"), "2026-07-01");
    await user.clear(screen.getByTestId("date-range-end"));
    await user.type(screen.getByTestId("date-range-end"), "2026-07-10");

    rerender(
      <TripEditSheet
        currencyOptions={currencyOptions}
        trip={baseTrip}
        open={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
    rerender(
      <TripEditSheet currencyOptions={currencyOptions} trip={baseTrip} open onClose={vi.fn()} onSave={vi.fn()} />
    );

    expect(screen.getByTestId("date-range-start")).toHaveValue("2026-06-01");
    expect(screen.getByTestId("date-range-end")).toHaveValue("2026-06-10");
  });

  it("resets the trip name after closing and reopening without saving", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <TripEditSheet currencyOptions={currencyOptions} trip={baseTrip} open onClose={vi.fn()} onSave={vi.fn()} />
    );

    const nameInput = screen.getByDisplayValue("Tokyo Adventure");
    await user.clear(nameInput);
    await user.type(nameInput, "Kyoto Journey");

    rerender(
      <TripEditSheet
        currencyOptions={currencyOptions}
        trip={baseTrip}
        open={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
    rerender(
      <TripEditSheet currencyOptions={currencyOptions} trip={baseTrip} open onClose={vi.fn()} onSave={vi.fn()} />
    );

    expect(screen.getByDisplayValue("Tokyo Adventure")).toBeInTheDocument();
  });

  it("renders nothing when trip is null", () => {
    const { container } = render(
      <TripEditSheet currencyOptions={currencyOptions} trip={null} open onClose={vi.fn()} onSave={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("onSave includes updated start date", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<TripEditSheet currencyOptions={currencyOptions} trip={baseTrip} open onClose={vi.fn()} onSave={onSave} />);
    const startInput = screen.getByTestId("date-range-start");
    await user.clear(startInput);
    await user.type(startInput, "2026-07-01");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ startDate: "2026-07-01" }));
  });

  it("does not render a status select", () => {
    render(<TripEditSheet currencyOptions={currencyOptions} trip={baseTrip} open onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("updates budget currency input", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<TripEditSheet currencyOptions={currencyOptions} trip={baseTrip} open onClose={vi.fn()} onSave={onSave} />);
    await user.click(screen.getByRole("button", { name: /Currency: United States Dollar USD/i }));
    await user.click(getCurrencyOption("EUR"));
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ budgetCurrency: "EUR" }));
  });

  it("sets budgetTotal to undefined when input is cleared", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<TripEditSheet currencyOptions={currencyOptions} trip={baseTrip} open onClose={vi.fn()} onSave={onSave} />);
    await user.clear(screen.getByDisplayValue("3000"));
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ budgetTotal: undefined }));
  });

  it("renders the Getting Around section pre-selected to the trip's transit mode", () => {
    render(<TripEditSheet currencyOptions={currencyOptions} trip={baseTrip} open onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByText("Getting Around")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Drive" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Walk" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Transit" })).toHaveAttribute("aria-pressed", "false");
  });

  it("defaults the Getting Around selection to Drive when the trip has no transit mode", () => {
    const tripWithoutTransitMode: Trip = { ...baseTrip, transitMode: undefined };
    render(
      <TripEditSheet
        currencyOptions={currencyOptions}
        trip={tripWithoutTransitMode}
        open
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Drive" })).toHaveAttribute("aria-pressed", "true");
  });

  it("selecting a transit mode updates the draft and persists it on save", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<TripEditSheet currencyOptions={currencyOptions} trip={baseTrip} open onClose={vi.fn()} onSave={onSave} />);
    await user.click(screen.getByRole("button", { name: "Walk" }));
    expect(screen.getByRole("button", { name: "Walk" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ transitMode: TransitMode.Walk }));
  });

  it("onSave includes updated end date after editing", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<TripEditSheet currencyOptions={currencyOptions} trip={baseTrip} open onClose={vi.fn()} onSave={onSave} />);
    const endInput = screen.getByTestId("date-range-end");
    await user.clear(endInput);
    await user.type(endInput, "2026-07-10");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ endDate: "2026-07-10" }));
  });

  it("normalizes a one-day selection by saving the same start and end date", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<TripEditSheet currencyOptions={currencyOptions} trip={baseTrip} open onClose={vi.fn()} onSave={onSave} />);

    const endInput = screen.getByTestId("date-range-end");
    await user.clear(endInput);
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        startDate: "2026-06-01",
        endDate: "2026-06-01",
      })
    );
  });

  it("sends null startDate when clearing both dates on a scheduled trip (AC13)", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<TripEditSheet currencyOptions={currencyOptions} trip={baseTrip} open onClose={vi.fn()} onSave={onSave} />);

    await user.clear(screen.getByTestId("date-range-start"));
    await user.clear(screen.getByTestId("date-range-end"));
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ startDate: null, endDate: null }));
  });

  it("Drawer onOpenChange(false) calls onClose", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<TripEditSheet currencyOptions={currencyOptions} trip={baseTrip} open onClose={onClose} onSave={vi.fn()} />);
    await user.click(screen.getByTestId("sheet-close-trigger"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("Drawer onOpenChange(true) does not call onClose", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<TripEditSheet currencyOptions={currencyOptions} trip={baseTrip} open onClose={onClose} onSave={vi.fn()} />);
    await user.click(screen.getByTestId("sheet-open-trigger"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("disables save controls and shows Saving... while the trip save is pending", () => {
    render(
      <TripEditSheet currencyOptions={currencyOptions} trip={baseTrip} open onClose={vi.fn()} onSave={vi.fn()} saving />
    );

    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Cancel" })[0]).toBeDisabled();
  });

  it("renders an icon-only delete button, left-aligned with the Cancel/Save group, when onDelete is provided", () => {
    render(
      <TripEditSheet
        currencyOptions={currencyOptions}
        trip={baseTrip}
        open
        onClose={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    const deleteButton = screen.getByRole("button", { name: "Delete trip" });
    expect(deleteButton).toBeInTheDocument();
    expect(deleteButton).not.toHaveTextContent("Delete trip");

    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    const saveButton = screen.getByRole("button", { name: "Save changes" });
    const row = deleteButton.parentElement;
    expect(row).toBe(cancelButton.parentElement?.parentElement);
    expect(row).toBe(saveButton.parentElement?.parentElement);
    expect(deleteButton.compareDocumentPosition(cancelButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("opens the delete confirmation dialog and calls onDelete", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();

    render(
      <TripEditSheet
        currencyOptions={currencyOptions}
        trip={baseTrip}
        open
        onClose={vi.fn()}
        onSave={vi.fn()}
        onDelete={onDelete}
      />
    );

    await user.click(screen.getByRole("button", { name: "Delete trip" }));
    expect(screen.getByText(/Delete\s+Tokyo Adventure\?/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it("renders the date-change confirmation dialog and resolves the keep-unscheduled path", async () => {
    const user = userEvent.setup();
    const onResolveDateChange = vi.fn();
    render(
      <TripEditSheet
        currencyOptions={currencyOptions}
        trip={baseTrip}
        open
        onClose={vi.fn()}
        onSave={vi.fn()}
        onResolveDateChange={onResolveDateChange}
        dateChangeConfirmation={{
          removedDates: ["2026-06-09", "2026-06-10"],
          events: [{ id: "event-1", name: "Tea ceremony", displacedDate: "2026-06-09", docCount: 1 }],
          noteCount: 1,
          checklistCount: 1,
          eventDocumentCount: 1,
        }}
      />
    );

    expect(
      screen.getByText(
        /Your new trip dates will remove events \(along with their notes and documents\) you had planned for/i
      )
    ).toBeInTheDocument();
    expect(screen.getByText("Jun 9, 2026 - Jun 10, 2026", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep Events" })).toBeInTheDocument();
    expect(screen.queryByText(/tea ceremony/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/attached event document/i)).not.toBeInTheDocument();
    expect(
      screen
        .getAllByRole("button")
        .slice(-3)
        .map((button) => button.textContent)
    ).toEqual(["Remove Events", "Cancel", "Keep Events"]);

    await user.click(screen.getByRole("button", { name: "Keep Events" }));
    expect(onResolveDateChange).toHaveBeenCalledWith(TripDateConflictResolution.KeepAsUnscheduled);
  });

  it("calls onCancelDateChange when the confirmation dialog is canceled", async () => {
    const user = userEvent.setup();
    const onCancelDateChange = vi.fn();
    globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    };
    render(
      <TripEditSheet
        currencyOptions={currencyOptions}
        trip={baseTrip}
        open
        onClose={vi.fn()}
        onSave={vi.fn()}
        onCancelDateChange={onCancelDateChange}
        dateChangeConfirmation={{
          removedDates: ["2026-06-09"],
          events: [],
          noteCount: 0,
          checklistCount: 0,
          eventDocumentCount: 0,
        }}
      />
    );

    const cancelButtons = screen.getAllByRole("button", { name: "Cancel" });
    await user.click(cancelButtons[cancelButtons.length - 1]);
    expect(onCancelDateChange).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.getByRole("button", { name: "Save changes" })).toHaveFocus());
  });

  it("keeps the keep-events action visible when the dialog only warns about removed content", () => {
    render(
      <TripEditSheet
        currencyOptions={currencyOptions}
        trip={baseTrip}
        open
        onClose={vi.fn()}
        onSave={vi.fn()}
        dateChangeConfirmation={{
          removedDates: ["2026-06-09"],
          events: [],
          noteCount: 1,
          checklistCount: 0,
          eventDocumentCount: 0,
        }}
      />
    );

    expect(screen.getByRole("button", { name: "Keep Events" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Events" })).toBeInTheDocument();
  });

  it("resolves the delete-events confirmation path", async () => {
    const user = userEvent.setup();
    const onResolveDateChange = vi.fn();
    render(
      <TripEditSheet
        currencyOptions={currencyOptions}
        trip={baseTrip}
        open
        onClose={vi.fn()}
        onSave={vi.fn()}
        onResolveDateChange={onResolveDateChange}
        dateChangeConfirmation={{
          removedDates: ["2026-06-09"],
          events: [{ id: "event-1", name: "Tea ceremony", displacedDate: "2026-06-09", docCount: 1 }],
          noteCount: 1,
          checklistCount: 1,
          eventDocumentCount: 1,
        }}
      />
    );

    await user.click(screen.getByRole("button", { name: "Remove Events" }));
    expect(onResolveDateChange).toHaveBeenCalledWith(TripDateConflictResolution.DeleteEvents);
  });

  it("onSave patch does not include destination fields when destination was not changed", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<TripEditSheet currencyOptions={currencyOptions} trip={baseTrip} open onClose={vi.fn()} onSave={onSave} />);
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    const patch: UpdateTripPatch = onSave.mock.calls[0][0];
    expect(patch.destinationName).toBeUndefined();
    expect(patch.destinationCountry).toBeUndefined();
    expect(patch.destinationCountryCode).toBeUndefined();
  });

  it("onSave patch includes new destination after selecting via onSelect callback", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<TripEditSheet currencyOptions={currencyOptions} trip={baseTrip} open onClose={vi.fn()} onSave={onSave} />);
    await user.click(screen.getByRole("button", { name: "select-destination" }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    const patch: UpdateTripPatch = onSave.mock.calls[0][0];
    expect(patch.destinationName).toBe("Tokyo");
    expect(patch.destinationCountry).toBe("Japan");
    expect(patch.destinationCountryCode).toBe("JP");
  });

  it("onSave patch includes null destination fields after clearing via onClear callback", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<TripEditSheet currencyOptions={currencyOptions} trip={baseTrip} open onClose={vi.fn()} onSave={onSave} />);
    await user.click(screen.getByRole("button", { name: "clear-destination" }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    const patch: UpdateTripPatch = onSave.mock.calls[0][0];
    expect(patch.destinationName).toBeNull();
    expect(patch.destinationCountry).toBeNull();
    expect(patch.destinationCountryCode).toBeNull();
  });

  it("resets destination input after closing and reopening without saving", async () => {
    const user = userEvent.setup();
    const trip = { ...baseTrip, destinationName: "Paris" };
    const { rerender } = render(
      <TripEditSheet currencyOptions={currencyOptions} trip={trip} open onClose={vi.fn()} onSave={vi.fn()} />
    );

    expect(screen.getByTestId("destination-input")).toHaveValue("Paris");

    await user.click(screen.getByRole("button", { name: "clear-destination" }));
    expect(screen.getByTestId("destination-input")).toHaveValue("");

    rerender(
      <TripEditSheet currencyOptions={currencyOptions} trip={trip} open={false} onClose={vi.fn()} onSave={vi.fn()} />
    );
    rerender(<TripEditSheet currencyOptions={currencyOptions} trip={trip} open onClose={vi.fn()} onSave={vi.fn()} />);

    expect(screen.getByTestId("destination-input")).toHaveValue("Paris");
  });

  describe("currency change confirmation", () => {
    const today = new Date().toISOString().slice(0, 10);
    const mismatchedExpense: Expense = {
      id: "expense-1",
      tripId: "trip-1",
      category: "food",
      amount: 50,
      currency: "GBP",
      date: today,
      createdAt: `${today}T11:55:00.000Z`,
      updatedAt: `${today}T11:55:00.000Z`,
    };

    async function changeCurrencyToEur(user: ReturnType<typeof userEvent.setup>) {
      await user.click(screen.getByRole("button", { name: /Currency: United States Dollar USD/i }));
      await user.click(getCurrencyOption("EUR"));
      await user.click(screen.getByRole("button", { name: /save changes/i }));
    }

    it("commits immediately when the currency is unchanged", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      render(
        <TripEditSheet
          currencyOptions={currencyOptions}
          trip={baseTrip}
          expenses={[mismatchedExpense]}
          open
          onClose={vi.fn()}
          onSave={onSave}
        />
      );

      await user.click(screen.getByRole("button", { name: /save changes/i }));

      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ budgetTotal: 3000 }));
      expect(screen.queryByRole("button", { name: "Convert" })).not.toBeInTheDocument();
    });

    it("commits immediately when changing currency creates no mismatch", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      render(
        <TripEditSheet currencyOptions={currencyOptions} trip={baseTrip} open onClose={vi.fn()} onSave={onSave} />
      );

      await changeCurrencyToEur(user);

      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ budgetCurrency: "EUR" }));
      expect(screen.queryByRole("button", { name: "Convert" })).not.toBeInTheDocument();
    });

    it("opens the currency change dialog when changing currency creates a mismatch", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      render(
        <TripEditSheet
          currencyOptions={currencyOptions}
          trip={baseTrip}
          expenses={[mismatchedExpense]}
          open
          onClose={vi.fn()}
          onSave={onSave}
        />
      );

      await changeCurrencyToEur(user);

      expect(screen.getByRole("button", { name: "Convert" })).toBeInTheDocument();
      expect(onSave).not.toHaveBeenCalled();
    });

    it("Cancel from the currency dialog makes no mutation, closes the dialog, and returns focus to Save", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => {
        callback(0);
        return 0;
      };
      render(
        <TripEditSheet
          currencyOptions={currencyOptions}
          trip={baseTrip}
          expenses={[mismatchedExpense]}
          open
          onClose={vi.fn()}
          onSave={onSave}
        />
      );

      await changeCurrencyToEur(user);
      const cancelButtons = screen.getAllByRole("button", { name: "Cancel" });
      await user.click(cancelButtons[cancelButtons.length - 1]);

      expect(onSave).not.toHaveBeenCalled();
      expect(screen.queryByRole("button", { name: "Convert" })).not.toBeInTheDocument();
      await waitFor(() => expect(screen.getByRole("button", { name: /save changes/i })).toHaveFocus());
    });

    it("Convert from the currency dialog calls onSave with convert mode", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      render(
        <TripEditSheet
          currencyOptions={currencyOptions}
          trip={baseTrip}
          expenses={[mismatchedExpense]}
          open
          onClose={vi.fn()}
          onSave={onSave}
        />
      );

      await changeCurrencyToEur(user);
      await user.click(screen.getByRole("button", { name: "Convert" }));

      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ budgetCurrency: "EUR" }),
        TripCurrencyChangeMode.Convert
      );
    });

    it("Leave As Is from the currency dialog calls onSave with leave-as-is mode", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      render(
        <TripEditSheet
          currencyOptions={currencyOptions}
          trip={baseTrip}
          expenses={[mismatchedExpense]}
          open
          onClose={vi.fn()}
          onSave={onSave}
        />
      );

      await changeCurrencyToEur(user);
      await user.click(screen.getByRole("button", { name: "Leave As Is" }));

      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ budgetCurrency: "EUR" }),
        TripCurrencyChangeMode.LeaveAsIs
      );
    });

    it("dismissing the currency dialog via Esc/outside click behaves as Cancel", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      render(
        <TripEditSheet
          currencyOptions={currencyOptions}
          trip={baseTrip}
          expenses={[mismatchedExpense]}
          open
          onClose={vi.fn()}
          onSave={onSave}
        />
      );

      await changeCurrencyToEur(user);
      await user.click(screen.getByTestId("currency-dialog-dismiss"));

      expect(onSave).not.toHaveBeenCalled();
      expect(screen.queryByRole("button", { name: "Convert" })).not.toBeInTheDocument();
    });
  });
});
