import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReservationAnchorEditField } from "./reservation-anchor-edit-field";
import { formatAnchorDateTime } from "./reservation-type-badge";

vi.mock("@/components/ui/date-picker", () => ({
  DatePicker: ({
    value,
    onChange,
    "aria-label": ariaLabel,
  }: {
    value?: string;
    onChange: (value: string | undefined) => void;
    "aria-label"?: string;
  }) => (
    <input aria-label={ariaLabel} value={value ?? ""} onChange={(event) => onChange(event.target.value || undefined)} />
  ),
}));

vi.mock("@/components/ui/time-picker", () => ({
  TimePicker: ({
    value,
    onChange,
    "aria-label": ariaLabel,
  }: {
    value?: string;
    onChange: (value: string | undefined) => void;
    "aria-label"?: string;
  }) => (
    <input aria-label={ariaLabel} value={value ?? ""} onChange={(event) => onChange(event.target.value || undefined)} />
  ),
}));

const CHECK_IN_ISO = "2026-08-01T15:00:00.000Z";

describe("ReservationAnchorEditField", () => {
  it("renders the formatted value with a matching aria-label when set", () => {
    render(<ReservationAnchorEditField label="Check-in" value={CHECK_IN_ISO} onSave={vi.fn()} />);

    const formatted = formatAnchorDateTime(CHECK_IN_ISO);
    const button = screen.getByRole("button", { name: `Check-in: ${formatted}` });
    expect(button).toHaveTextContent(formatted);
  });

  it("renders a muted 'Add {label}' placeholder with a matching aria-label when unset", () => {
    render(<ReservationAnchorEditField label="Check-out" value={undefined} onSave={vi.fn()} />);

    const button = screen.getByRole("button", { name: "Add check-out" });
    expect(button).toHaveTextContent("Add check-out");
  });

  it("enters edit mode on click, showing date/time pickers and Save/Cancel buttons", async () => {
    const user = userEvent.setup();
    render(<ReservationAnchorEditField label="Check-in" value={CHECK_IN_ISO} onSave={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: `Check-in: ${formatAnchorDateTime(CHECK_IN_ISO)}` }));

    expect(screen.getByLabelText("Check-in date")).toBeInTheDocument();
    expect(screen.getByLabelText("Check-in time")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Check-in" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel editing Check-in" })).toBeInTheDocument();
  });

  it("saves the combined ISO string when clicking Save", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ReservationAnchorEditField label="Check-in" value={CHECK_IN_ISO} onSave={onSave} />);

    await user.click(screen.getByRole("button", { name: `Check-in: ${formatAnchorDateTime(CHECK_IN_ISO)}` }));
    const dateInput = screen.getByLabelText("Check-in date");
    const timeInput = screen.getByLabelText("Check-in time");
    await user.clear(dateInput);
    await user.type(dateInput, "2026-09-01");
    await user.clear(timeInput);
    await user.type(timeInput, "10:00");
    await user.click(screen.getByRole("button", { name: "Save Check-in" }));

    expect(onSave).toHaveBeenCalledWith("2026-09-01T10:00:00.000Z");
  });

  it("saves the combined ISO string on Enter in the time input", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ReservationAnchorEditField label="Check-in" value={CHECK_IN_ISO} onSave={onSave} />);

    await user.click(screen.getByRole("button", { name: `Check-in: ${formatAnchorDateTime(CHECK_IN_ISO)}` }));
    const timeInput = screen.getByLabelText("Check-in time");
    await user.click(timeInput);
    await user.keyboard("{Enter}");

    expect(onSave).toHaveBeenCalledWith(CHECK_IN_ISO);
  });

  it("discards changes and returns focus to the display button on Cancel click", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ReservationAnchorEditField label="Check-in" value={CHECK_IN_ISO} onSave={onSave} />);

    const displayButton = screen.getByRole("button", { name: `Check-in: ${formatAnchorDateTime(CHECK_IN_ISO)}` });
    await user.click(displayButton);
    await user.click(screen.getByRole("button", { name: "Cancel editing Check-in" }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: `Check-in: ${formatAnchorDateTime(CHECK_IN_ISO)}` })).toHaveFocus();
  });

  it("discards changes on Escape with no onSave call", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ReservationAnchorEditField label="Check-in" value={CHECK_IN_ISO} onSave={onSave} />);

    await user.click(screen.getByRole("button", { name: `Check-in: ${formatAnchorDateTime(CHECK_IN_ISO)}` }));
    await user.click(screen.getByLabelText("Check-in date"));
    await user.keyboard("{Escape}");

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: `Check-in: ${formatAnchorDateTime(CHECK_IN_ISO)}` })).toHaveFocus();
  });

  it("shows an inline error and keeps edit mode open when onSave rejects", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("The end date and time must be after the start date and time."));
    const user = userEvent.setup();
    render(<ReservationAnchorEditField label="Check-in" value={CHECK_IN_ISO} onSave={onSave} />);

    await user.click(screen.getByRole("button", { name: `Check-in: ${formatAnchorDateTime(CHECK_IN_ISO)}` }));
    await user.click(screen.getByRole("button", { name: "Save Check-in" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "The end date and time must be after the start date and time."
    );
    expect(screen.getByLabelText("Check-in date")).toBeInTheDocument();
  });

  it("shows a validation error when only a date or only a time is provided", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ReservationAnchorEditField label="Check-in" value={undefined} onSave={onSave} />);

    await user.click(screen.getByRole("button", { name: "Add check-in" }));
    const dateInput = screen.getByLabelText("Check-in date");
    await user.type(dateInput, "2026-09-01");
    await user.click(screen.getByRole("button", { name: "Save Check-in" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Enter both a date and a time.");
    expect(onSave).not.toHaveBeenCalled();
  });
});
