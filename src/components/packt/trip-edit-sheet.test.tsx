// @vitest-environment jsdom
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
        onChange={(e) => onChange(e.target.value || undefined, end)}
      />
      <input
        data-testid="date-range-end"
        value={end ?? ""}
        onChange={(e) => onChange(start, e.target.value || undefined)}
      />
    </>
  ),
}));

vi.mock("./trip-edit-collaborators", () => ({
  TripEditCollaborators: ({
    onRemove,
    onUpdateRole,
    onAdd,
  }: {
    collaborators: unknown[];
    onRemove: (i: number) => void;
    onUpdateRole: (i: number, role: string) => void;
    onAdd: (name: string, email: string, role: string) => void;
  }) => (
    <div>
      <button onClick={() => onRemove(0)}>remove-collaborator</button>
      <button onClick={() => onUpdateRole(0, "viewer")}>update-role</button>
      <button onClick={() => onAdd("Test User", "test@test.com", "editor")}>add-collaborator</button>
    </div>
  ),
}));

vi.mock("./trip-edit-cover", () => ({
  TripEditCover: ({
    coverImageUrl,
    onCoverImageUrlChange,
    disabled,
  }: {
    tripId: string;
    tripName: string;
    coverImageUrl?: string;
    onCoverImageUrlChange: (url: string | null) => void;
    disabled?: boolean;
  }) => (
    <div>
      <span data-testid="cover-url">{coverImageUrl ?? ""}</span>
      <button disabled={disabled} onClick={() => onCoverImageUrlChange("https://example.com/new.jpg")}>
        set-cover
      </button>
      <button disabled={disabled} onClick={() => onCoverImageUrlChange(null)}>
        remove-cover
      </button>
    </div>
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
    onSelect: (data: { name: string; country: string | null; countryCode: string | null }) => void;
    onClear: () => void;
  }) => (
    <div>
      <input data-testid="destination-input" value={value} onChange={(e) => onInputChange(e.target.value)} />
      <button onClick={() => onSelect({ name: "Tokyo", country: "Japan", countryCode: "JP" })}>
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
import { TripDateConflictResolution, type Trip, type UpdateTripPatch } from "@/data/types";

const baseTrip: Trip = {
  id: "trip-1",
  name: "Tokyo Adventure",
  status: "upcoming",
  startDate: "2026-06-01",
  endDate: "2026-06-10",
  budget: {
    currency: "USD",
    total: 3000,
    perPerson: 1500,
  },
};

describe("TripEditSheet", () => {
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  });

  it("renders pre-filled trip name", () => {
    render(<TripEditSheet trip={baseTrip} open onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByDisplayValue("Tokyo Adventure")).toBeInTheDocument();
  });

  it("renders pre-filled start and end dates", () => {
    render(<TripEditSheet trip={baseTrip} open onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByTestId("date-range-start")).toHaveValue("2026-06-01");
    expect(screen.getByTestId("date-range-end")).toHaveValue("2026-06-10");
  });

  it("renders budget total and per-person inputs with pre-filled values", () => {
    render(<TripEditSheet trip={baseTrip} open onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByDisplayValue("3000")).toBeInTheDocument();
    expect(screen.getByDisplayValue("1500")).toBeInTheDocument();
  });

  it("budget section label text is visible", () => {
    render(<TripEditSheet trip={baseTrip} open onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByText("Per person")).toBeInTheDocument();
  });

  it("Cancel button calls onClose", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<TripEditSheet trip={baseTrip} open onClose={onClose} onSave={vi.fn()} />);
    await user.click(screen.getAllByRole("button", { name: /cancel/i })[0]);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("Save button calls onSave with current draft values", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<TripEditSheet trip={baseTrip} open onClose={vi.fn()} onSave={onSave} />);
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(onSave).toHaveBeenCalledOnce();
    const patch: UpdateTripPatch = onSave.mock.calls[0][0];
    expect(patch.name).toBe("Tokyo Adventure");
    expect(patch.startDate).toBe("2026-06-01");
    expect(patch.endDate).toBe("2026-06-10");
    expect(patch.budgetTotal).toBe(3000);
    expect(patch.budgetPerPerson).toBe(1500);
  });

  it("onSave includes modified name after editing", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<TripEditSheet trip={baseTrip} open onClose={vi.fn()} onSave={onSave} />);
    const nameInput = screen.getByDisplayValue("Tokyo Adventure");
    await user.clear(nameInput);
    await user.type(nameInput, "Kyoto Journey");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: "Kyoto Journey" }));
  });

  it("resets the trip dates after closing and reopening without saving", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<TripEditSheet trip={baseTrip} open onClose={vi.fn()} onSave={vi.fn()} />);

    await user.clear(screen.getByTestId("date-range-start"));
    await user.type(screen.getByTestId("date-range-start"), "2026-07-01");
    await user.clear(screen.getByTestId("date-range-end"));
    await user.type(screen.getByTestId("date-range-end"), "2026-07-10");

    rerender(<TripEditSheet trip={baseTrip} open={false} onClose={vi.fn()} onSave={vi.fn()} />);
    rerender(<TripEditSheet trip={baseTrip} open onClose={vi.fn()} onSave={vi.fn()} />);

    expect(screen.getByTestId("date-range-start")).toHaveValue("2026-06-01");
    expect(screen.getByTestId("date-range-end")).toHaveValue("2026-06-10");
  });

  it("resets the trip name after closing and reopening without saving", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<TripEditSheet trip={baseTrip} open onClose={vi.fn()} onSave={vi.fn()} />);

    const nameInput = screen.getByDisplayValue("Tokyo Adventure");
    await user.clear(nameInput);
    await user.type(nameInput, "Kyoto Journey");

    rerender(<TripEditSheet trip={baseTrip} open={false} onClose={vi.fn()} onSave={vi.fn()} />);
    rerender(<TripEditSheet trip={baseTrip} open onClose={vi.fn()} onSave={vi.fn()} />);

    expect(screen.getByDisplayValue("Tokyo Adventure")).toBeInTheDocument();
  });

  it("renders nothing when trip is null", () => {
    const { container } = render(<TripEditSheet trip={null} open onClose={vi.fn()} onSave={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("onSave includes updated start date", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<TripEditSheet trip={baseTrip} open onClose={vi.fn()} onSave={onSave} />);
    const startInput = screen.getByTestId("date-range-start");
    await user.clear(startInput);
    await user.type(startInput, "2026-07-01");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ startDate: "2026-07-01" }));
  });

  it("does not render a status select", () => {
    render(<TripEditSheet trip={baseTrip} open onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("updates budget currency input", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<TripEditSheet trip={baseTrip} open onClose={vi.fn()} onSave={onSave} />);
    const currencyInput = screen.getByDisplayValue("USD");
    await user.clear(currencyInput);
    await user.type(currencyInput, "EUR");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ budgetCurrency: "EUR" }));
  });

  it("sets budgetTotal to undefined when input is cleared", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<TripEditSheet trip={baseTrip} open onClose={vi.fn()} onSave={onSave} />);
    await user.clear(screen.getByDisplayValue("3000"));
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ budgetTotal: undefined }));
  });

  it("sets budgetPerPerson to undefined when input is cleared", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<TripEditSheet trip={baseTrip} open onClose={vi.fn()} onSave={onSave} />);
    await user.clear(screen.getByDisplayValue("1500"));
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ budgetPerPerson: undefined }));
  });

  it("onSave includes updated coverImageUrl after TripEditCover callback fires", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<TripEditSheet trip={baseTrip} open onClose={vi.fn()} onSave={onSave} />);
    await user.click(screen.getByRole("button", { name: "set-cover" }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ coverImageUrl: "https://example.com/new.jpg" }));
  });

  it("onSave includes coverImageUrl: null after TripEditCover remove fires", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const trip = { ...baseTrip, coverImageUrl: "https://example.com/img.jpg" };
    render(<TripEditSheet trip={trip} open onClose={vi.fn()} onSave={onSave} />);
    await user.click(screen.getByRole("button", { name: "remove-cover" }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ coverImageUrl: null }));
  });

  it("addCollaborator via TripEditCollaborators callback does not crash", async () => {
    const user = userEvent.setup();
    render(<TripEditSheet trip={baseTrip} open onClose={vi.fn()} onSave={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /add-collaborator/i }));
    expect(screen.getByRole("button", { name: /save changes/i })).toBeInTheDocument();
  });

  it("removeCollaborator via TripEditCollaborators callback does not crash", async () => {
    const user = userEvent.setup();
    const trip = {
      ...baseTrip,
      collaborators: [{ name: "Alice", email: "a@a.com", initials: "A", role: "editor" as const }],
    };
    render(<TripEditSheet trip={trip} open onClose={vi.fn()} onSave={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /remove-collaborator/i }));
    expect(screen.getByRole("button", { name: /save changes/i })).toBeInTheDocument();
  });

  it("updateCollaboratorRole with collaborators does not crash", async () => {
    const user = userEvent.setup();
    const trip = {
      ...baseTrip,
      collaborators: [{ name: "Alice", email: "a@a.com", initials: "A", role: "editor" as const }],
    };
    render(<TripEditSheet trip={trip} open onClose={vi.fn()} onSave={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /update-role/i }));
    expect(screen.getByRole("button", { name: /save changes/i })).toBeInTheDocument();
  });

  it("updateCollaboratorRole with no collaborators returns early without crash", async () => {
    const user = userEvent.setup();
    render(<TripEditSheet trip={baseTrip} open onClose={vi.fn()} onSave={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /update-role/i }));
    expect(screen.getByRole("button", { name: /save changes/i })).toBeInTheDocument();
  });

  it("onSave includes updated end date after editing", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<TripEditSheet trip={baseTrip} open onClose={vi.fn()} onSave={onSave} />);
    const endInput = screen.getByTestId("date-range-end");
    await user.clear(endInput);
    await user.type(endInput, "2026-07-10");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ endDate: "2026-07-10" }));
  });

  it("normalizes a one-day selection by saving the same start and end date", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<TripEditSheet trip={baseTrip} open onClose={vi.fn()} onSave={onSave} />);

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

  it("Drawer onOpenChange(false) calls onClose", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<TripEditSheet trip={baseTrip} open onClose={onClose} onSave={vi.fn()} />);
    await user.click(screen.getByTestId("sheet-close-trigger"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("Drawer onOpenChange(true) does not call onClose", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<TripEditSheet trip={baseTrip} open onClose={onClose} onSave={vi.fn()} />);
    await user.click(screen.getByTestId("sheet-open-trigger"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("disables save controls and shows Saving... while the trip save is pending", () => {
    render(<TripEditSheet trip={baseTrip} open onClose={vi.fn()} onSave={vi.fn()} saving />);

    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Cancel" })[0]).toBeDisabled();
  });

  it("renders a delete button when onDelete is provided", () => {
    render(<TripEditSheet trip={baseTrip} open onClose={vi.fn()} onSave={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Delete trip" })).toBeInTheDocument();
  });

  it("opens the delete confirmation dialog and calls onDelete", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();

    render(<TripEditSheet trip={baseTrip} open onClose={vi.fn()} onSave={vi.fn()} onDelete={onDelete} />);

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
    render(<TripEditSheet trip={baseTrip} open onClose={vi.fn()} onSave={onSave} />);
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    const patch: UpdateTripPatch = onSave.mock.calls[0][0];
    expect(patch.destinationName).toBeUndefined();
    expect(patch.destinationCountry).toBeUndefined();
    expect(patch.destinationCountryCode).toBeUndefined();
  });

  it("onSave patch includes new destination after selecting via onSelect callback", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<TripEditSheet trip={baseTrip} open onClose={vi.fn()} onSave={onSave} />);
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
    render(<TripEditSheet trip={baseTrip} open onClose={vi.fn()} onSave={onSave} />);
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
    const { rerender } = render(<TripEditSheet trip={trip} open onClose={vi.fn()} onSave={vi.fn()} />);

    expect(screen.getByTestId("destination-input")).toHaveValue("Paris");

    await user.click(screen.getByRole("button", { name: "clear-destination" }));
    expect(screen.getByTestId("destination-input")).toHaveValue("");

    rerender(<TripEditSheet trip={trip} open={false} onClose={vi.fn()} onSave={vi.fn()} />);
    rerender(<TripEditSheet trip={trip} open onClose={vi.fn()} onSave={vi.fn()} />);

    expect(screen.getByTestId("destination-input")).toHaveValue("Paris");
  });
});
