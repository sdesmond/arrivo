import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReservationType } from "@/data/types";
import { FIELD_LIMITS } from "@/lib/validation-limits";
import { ReservationDetailsFields } from "./reservation-details-fields";
import type { ReservationDraft } from "./use-reservation-draft";

vi.mock("@/components/arrivo/reservation-anchor-fieldset", () => ({
  ReservationAnchorFieldset: ({
    legend,
    required,
    error,
    onDateChange,
    onTimeChange,
  }: {
    legend: string;
    required: boolean;
    error?: string;
    onDateChange: (value: string) => void;
    onTimeChange: (value: string) => void;
  }) => (
    <fieldset>
      <legend>
        {legend}
        {required ? " *" : " (Optional)"}
      </legend>
      <button type="button" onClick={() => onDateChange("2026-08-01")}>
        {legend} pick date
      </button>
      <button type="button" onClick={() => onTimeChange("10:00")}>
        {legend} pick time
      </button>
      {error && <p>{error}</p>}
    </fieldset>
  ),
}));

vi.mock("@/components/arrivo/location-lookup-input", () => ({
  LocationLookupInput: ({
    id,
    value,
    resolvedValue,
    disabled,
    onValueChange,
    onResolved,
    onClearResolved,
  }: {
    id: string;
    value: string;
    resolvedValue: string | null;
    disabled?: boolean;
    onValueChange: (value: string) => void;
    onResolved: (location: {
      name: string;
      fullAddress: string;
      placeName: string;
      country: string;
      countryCode: string;
      center: [number, number];
    }) => void;
    onClearResolved: () => void;
  }) => (
    <div>
      <input
        id={id}
        value={value}
        data-resolved={resolvedValue ?? ""}
        disabled={disabled}
        onChange={(event) => onValueChange(event.target.value)}
      />
      {["POI", "Same name"].map((kind) => (
        <button
          key={kind}
          type="button"
          onClick={() =>
            onResolved({
              name: "JFK Airport",
              fullAddress: "Queens, NY 11430",
              placeName: kind === "POI" ? "JFK Airport" : "Queens, NY 11430",
              country: "United States",
              countryCode: "US",
              center: [-73.7781, 40.6413],
            })
          }
        >
          {id} resolve {kind}
        </button>
      ))}
      <button type="button" onClick={onClearResolved}>
        {id} clear
      </button>
    </div>
  ),
}));

function buildDraft(overrides: Partial<ReservationDraft> = {}): ReservationDraft {
  return {
    provider: "",
    startDate: undefined,
    startTime: undefined,
    endDate: undefined,
    endTime: undefined,
    startAddress: "",
    startResolvedLocation: undefined,
    endAddress: "",
    endResolvedLocation: undefined,
    confirmationCode: "",
    serviceNumber: "",
    notes: "",
    providerError: undefined,
    startAtError: undefined,
    endAtError: undefined,
    saving: false,
    providerInputRef: { current: null },
    startAnchorRef: { current: null },
    endAnchorRef: { current: null },
    setProvider: vi.fn(),
    setStartDate: vi.fn(),
    setStartTime: vi.fn(),
    setEndDate: vi.fn(),
    setEndTime: vi.fn(),
    setStartAddress: vi.fn(),
    setStartResolvedLocation: vi.fn(),
    setEndAddress: vi.fn(),
    setEndResolvedLocation: vi.fn(),
    setConfirmationCode: vi.fn(),
    setServiceNumber: vi.fn(),
    setNotes: vi.fn(),
    handleSave: vi.fn(),
    ...overrides,
  };
}

describe("ReservationDetailsFields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    [ReservationType.Flight, "Departure", "Arrival"],
    [ReservationType.RentalCar, "Pickup", "Return"],
    [ReservationType.Lodging, "Check-in", "Check-out"],
    [ReservationType.Cruise, "Departure", "Return"],
    [ReservationType.Other, "Start", "End"],
  ])("renders the %s anchor and address labels", (type, startLabel, endLabel) => {
    render(<ReservationDetailsFields type={type} draft={buildDraft()} />);

    expect(screen.getByRole("group", { name: new RegExp(startLabel) })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: new RegExp(endLabel) })).toBeInTheDocument();
    expect(screen.getByLabelText(`${startLabel} address (Optional)`)).toBeInTheDocument();
    expect(screen.getByLabelText(`${endLabel} address (Optional)`)).toBeInTheDocument();
  });

  it("marks the end anchor as required only for types that need it", () => {
    const { rerender } = render(<ReservationDetailsFields type={ReservationType.Lodging} draft={buildDraft()} />);
    expect(screen.getByRole("group", { name: "Check-out *" })).toBeInTheDocument();

    rerender(<ReservationDetailsFields type={ReservationType.Flight} draft={buildDraft()} />);
    expect(screen.getByRole("group", { name: "Arrival (Optional)" })).toBeInTheDocument();
  });

  it("renders the service number field only for types that have one", () => {
    const draft = buildDraft();
    const { rerender } = render(<ReservationDetailsFields type={ReservationType.Flight} draft={draft} />);
    const serviceNumber = screen.getByLabelText("Flight number (Optional)");
    expect(serviceNumber).toHaveAttribute("maxLength", String(FIELD_LIMITS.serviceNumber));
    fireEvent.change(serviceNumber, { target: { value: "AA123" } });
    expect(draft.setServiceNumber).toHaveBeenCalledWith("AA123");

    rerender(<ReservationDetailsFields type={ReservationType.Lodging} draft={draft} />);
    expect(screen.queryByLabelText(/number \(Optional\)/)).not.toBeInTheDocument();
  });

  it("reports edits through the draft setters", () => {
    const draft = buildDraft();
    render(<ReservationDetailsFields type={ReservationType.Other} draft={draft} />);

    fireEvent.change(screen.getByLabelText("Provider *"), { target: { value: "Misc" } });
    fireEvent.change(screen.getByLabelText("Confirmation code (Optional)"), { target: { value: "ABC" } });
    fireEvent.change(screen.getByLabelText("Notes (Optional)"), { target: { value: "Bring ID" } });
    fireEvent.change(screen.getByLabelText("Start address (Optional)"), { target: { value: "A" } });
    fireEvent.change(screen.getByLabelText("End address (Optional)"), { target: { value: "B" } });
    fireEvent.click(screen.getByRole("button", { name: "Start pick date" }));
    fireEvent.click(screen.getByRole("button", { name: "Start pick time" }));
    fireEvent.click(screen.getByRole("button", { name: "End pick date" }));
    fireEvent.click(screen.getByRole("button", { name: "End pick time" }));

    expect(draft.setProvider).toHaveBeenCalledWith("Misc");
    expect(draft.setConfirmationCode).toHaveBeenCalledWith("ABC");
    expect(draft.setNotes).toHaveBeenCalledWith("Bring ID");
    expect(draft.setStartAddress).toHaveBeenCalledWith("A");
    expect(draft.setEndAddress).toHaveBeenCalledWith("B");
    expect(draft.setStartDate).toHaveBeenCalledWith("2026-08-01");
    expect(draft.setStartTime).toHaveBeenCalledWith("10:00");
    expect(draft.setEndDate).toHaveBeenCalledWith("2026-08-01");
    expect(draft.setEndTime).toHaveBeenCalledWith("10:00");
  });

  it("shows the draft errors and marks the provider invalid", () => {
    render(
      <ReservationDetailsFields
        type={ReservationType.Other}
        draft={buildDraft({ providerError: "Provider error", startAtError: "Start error", endAtError: "End error" })}
      />
    );

    expect(screen.getByText("Provider error")).toBeInTheDocument();
    expect(screen.getByText("Start error")).toBeInTheDocument();
    expect(screen.getByText("End error")).toBeInTheDocument();
    expect(screen.getByLabelText("Provider *")).toHaveAttribute("aria-invalid", "true");
  });

  it("disables the inputs while saving", () => {
    render(<ReservationDetailsFields type={ReservationType.Flight} draft={buildDraft({ saving: true })} />);

    for (const label of [
      "Provider *",
      "Departure address (Optional)",
      "Arrival address (Optional)",
      "Confirmation code (Optional)",
      "Flight number (Optional)",
      "Notes (Optional)",
    ]) {
      expect(screen.getByLabelText(label)).toBeDisabled();
    }
  });

  it("hands the provider input to the draft ref", () => {
    const draft = buildDraft();
    render(<ReservationDetailsFields type={ReservationType.Other} draft={draft} />);

    expect(draft.providerInputRef.current).toBe(screen.getByLabelText("Provider *"));
    expect(draft.startAnchorRef.current).toContainElement(screen.getByRole("group", { name: /Start/ }));
    expect(draft.endAnchorRef.current).toContainElement(screen.getByRole("group", { name: /End/ }));
  });

  it("passes the resolved address through to each lookup", () => {
    render(
      <ReservationDetailsFields
        type={ReservationType.Other}
        draft={buildDraft({ startResolvedLocation: { address: "Queens" } })}
      />
    );

    expect(screen.getByLabelText("Start address (Optional)")).toHaveAttribute("data-resolved", "Queens");
    expect(screen.getByLabelText("End address (Optional)")).toHaveAttribute("data-resolved", "");
  });

  it.each([
    ["start", "setStartResolvedLocation"],
    ["end", "setEndResolvedLocation"],
  ] as const)("stores and clears the resolved %s address", (anchor, setter) => {
    const draft = buildDraft();
    render(<ReservationDetailsFields type={ReservationType.Flight} draft={draft} />);
    const id = `reservation-${anchor}-address`;

    fireEvent.click(screen.getByRole("button", { name: `${id} resolve POI` }));
    expect(draft[setter]).toHaveBeenLastCalledWith({
      name: "JFK Airport",
      address: "Queens, NY 11430",
      lat: 40.6413,
      lng: -73.7781,
    });

    fireEvent.click(screen.getByRole("button", { name: `${id} resolve Same name` }));
    expect(draft[setter]).toHaveBeenLastCalledWith({
      name: undefined,
      address: "Queens, NY 11430",
      lat: 40.6413,
      lng: -73.7781,
    });

    fireEvent.click(screen.getByRole("button", { name: `${id} clear` }));
    expect(draft[setter]).toHaveBeenLastCalledWith(undefined);
  });
});
