import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { patchReservation } = vi.hoisted(() => ({ patchReservation: vi.fn() }));
vi.mock("./use-reservation-patch", () => ({ useReservationPatch: () => patchReservation }));
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

import { ReservationDateEditor } from "./reservation-date-editor";
import { ReservationType } from "@/data/types";

const props = {
  reservationId: "res-1",
  type: ReservationType.Other,
  startAt: "2026-08-01T10:00:00.000Z",
  endAt: "2026-08-02T12:00:00.000Z",
};

beforeEach(() => {
  vi.resetAllMocks();
  patchReservation.mockResolvedValue(undefined);
});

it.each([
  ["Start", "End"],
  ["End", "Start"],
])("retains an incomplete %s draft without saving a changed %s time", async (incomplete, changed) => {
  const onSaved = vi.fn();
  const user = userEvent.setup();
  render(<ReservationDateEditor {...props} onSaved={onSaved} />);
  await user.click(screen.getByRole("button", { name: /Aug/ }));
  expect(screen.getByLabelText("Start date").parentElement?.parentElement).toHaveFocus();
  const incompleteTime = screen.getByLabelText(`${incomplete} time`);
  const changedTime = screen.getByLabelText(`${changed} time`);
  await user.clear(incompleteTime);
  await user.clear(changedTime);
  await user.type(changedTime, "13:00");
  await user.click(document.body);

  expect(screen.getByRole("status")).toHaveTextContent("Enter both a date and a time.");
  expect(incompleteTime).toHaveValue("");
  expect(changedTime).toHaveValue("13:00");
  expect(patchReservation).not.toHaveBeenCalled();
  expect(onSaved).not.toHaveBeenCalled();
});

it("saves a complete date pair on keyboard exit", async () => {
  const onSaved = vi.fn();
  const user = userEvent.setup();
  render(<ReservationDateEditor {...props} onSaved={onSaved} />);
  await user.click(screen.getByRole("button", { name: /Aug/ }));
  await user.clear(screen.getByLabelText("End time"));
  await user.type(screen.getByLabelText("End time"), "13:00");
  await user.tab();

  const endAt = "2026-08-02T13:00:00.000Z";
  expect(patchReservation).toHaveBeenCalledWith("res-1", { endAt });
  expect(onSaved).toHaveBeenCalledWith({ startAt: props.startAt, endAt });
  expect(screen.queryByLabelText("End time")).not.toBeInTheDocument();
});

it("sends a cleared time as null and reports the resolved dates", async () => {
  const onSaved = vi.fn();
  const user = userEvent.setup();
  render(<ReservationDateEditor {...props} onSaved={onSaved} />);
  await user.click(screen.getByRole("button", { name: /Aug/ }));
  await user.clear(screen.getByLabelText("End date"));
  await user.clear(screen.getByLabelText("End time"));
  await user.tab();
  await waitFor(() => expect(patchReservation).toHaveBeenCalledWith("res-1", { endAt: null }));
  expect(onSaved).toHaveBeenCalledWith({ startAt: props.startAt, endAt: undefined });
});

it("shows the API error and keeps the editor open when the save fails", async () => {
  patchReservation.mockRejectedValue(new Error("Trip cannot exceed 45 days."));
  const onSaved = vi.fn();
  const user = userEvent.setup();
  render(<ReservationDateEditor {...props} onSaved={onSaved} />);
  await user.click(screen.getByRole("button", { name: /Aug/ }));
  await user.clear(screen.getByLabelText("End time"));
  await user.type(screen.getByLabelText("End time"), "13:00");
  await user.tab();
  expect(await screen.findByText("Trip cannot exceed 45 days.")).toBeInTheDocument();
  expect(onSaved).not.toHaveBeenCalled();
  expect(screen.getByLabelText("End date")).toBeInTheDocument();
});

it("falls back to a generic message for a non-Error failure and closes on Escape", async () => {
  patchReservation.mockRejectedValue("oops");
  const user = userEvent.setup();
  render(<ReservationDateEditor {...props} onSaved={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: /Aug/ }));
  await user.clear(screen.getByLabelText("End time"));
  await user.type(screen.getByLabelText("End time"), "13:00");
  await user.tab();
  expect(await screen.findByText("Failed to save dates.")).toBeInTheDocument();
  await user.click(screen.getByLabelText("End date"));
  await user.keyboard("{Escape}");
  expect(screen.queryByLabelText("End date")).not.toBeInTheDocument();
});
