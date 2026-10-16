import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReservationAnchorFieldset } from "./reservation-anchor-fieldset";

describe("ReservationAnchorFieldset", () => {
  it("renders the legend with a required marker", () => {
    render(<ReservationAnchorFieldset legend="Check-in" required onDateChange={vi.fn()} onTimeChange={vi.fn()} />);
    expect(screen.getByText("Check-in")).toBeInTheDocument();
    expect(screen.getByText("*")).toBeInTheDocument();
  });

  it("renders an Optional marker when not required", () => {
    render(
      <ReservationAnchorFieldset legend="Departure" required={false} onDateChange={vi.fn()} onTimeChange={vi.fn()} />
    );
    expect(screen.getByText(/Optional/)).toBeInTheDocument();
  });

  it("renders date and time inputs labeled by the legend", () => {
    render(
      <ReservationAnchorFieldset legend="Departure" required={false} onDateChange={vi.fn()} onTimeChange={vi.fn()} />
    );
    expect(screen.getByLabelText("Departure date")).toBeInTheDocument();
    expect(screen.getByLabelText("Departure time")).toBeInTheDocument();
  });

  it("shows an inline error message when provided", () => {
    render(
      <ReservationAnchorFieldset
        legend="Check-out"
        required
        onDateChange={vi.fn()}
        onTimeChange={vi.fn()}
        error="Check-out is required for this reservation type."
      />
    );
    expect(screen.getByRole("status")).toHaveTextContent("Check-out is required for this reservation type.");
    expect(screen.getByLabelText("Check-out date")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Check-out time")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Check-out date")).toHaveAttribute("aria-describedby", "check-out-error");
    expect(screen.getByLabelText("Check-out time")).toHaveAttribute("aria-describedby", "check-out-error");
  });

  it("calls onDateChange and onTimeChange when values change", () => {
    const onDateChange = vi.fn();
    const onTimeChange = vi.fn();
    render(
      <ReservationAnchorFieldset
        legend="Departure"
        required={false}
        date="2026-08-01"
        time="10:00"
        onDateChange={onDateChange}
        onTimeChange={onTimeChange}
      />
    );
    expect(screen.getByLabelText("Departure date")).toBeInTheDocument();
    expect(screen.getByLabelText("Departure time")).toHaveValue("10:00");
  });

  it("does not set aria-describedby when there is no error", () => {
    render(
      <ReservationAnchorFieldset legend="Departure" required={false} onDateChange={vi.fn()} onTimeChange={vi.fn()} />
    );

    expect(screen.getByLabelText("Departure date")).not.toHaveAttribute("aria-describedby");
    expect(screen.getByLabelText("Departure time")).not.toHaveAttribute("aria-describedby");
  });
});
