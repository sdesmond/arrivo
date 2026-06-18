import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReservationType } from "@/data/types";
import {
  ANCHOR_LABELS,
  RESERVATION_TYPE_META,
  SERVICE_NUMBER_LABELS,
  ReservationTypeBadge,
  formatReservationDateRange,
} from "./reservation-type-badge";

describe("RESERVATION_TYPE_META", () => {
  it.each([
    [ReservationType.Flight, "Flight"],
    [ReservationType.Train, "Train"],
    [ReservationType.Bus, "Bus"],
    [ReservationType.Ferry, "Ferry"],
    [ReservationType.RentalCar, "Rental Car"],
    [ReservationType.Lodging, "Lodging"],
    [ReservationType.Cruise, "Cruise"],
    [ReservationType.Other, "Other"],
  ])("has a label and icon for %s", (type, label) => {
    const meta = RESERVATION_TYPE_META[type];
    expect(meta.label).toBe(label);
    expect(meta.icon).toBeDefined();
  });

  it("uses a distinct icon for cruise from ferry", () => {
    expect(RESERVATION_TYPE_META.cruise.icon).not.toBe(RESERVATION_TYPE_META.ferry.icon);
  });
});

describe("ANCHOR_LABELS", () => {
  it.each([
    ReservationType.Flight,
    ReservationType.Train,
    ReservationType.Bus,
    ReservationType.Ferry,
    ReservationType.RentalCar,
    ReservationType.Lodging,
    ReservationType.Cruise,
    ReservationType.Other,
  ])("has non-empty start and end labels for %s", (type) => {
    const labels = ANCHOR_LABELS[type];
    expect(labels.start.length).toBeGreaterThan(0);
    expect(labels.end.length).toBeGreaterThan(0);
  });
});

describe("SERVICE_NUMBER_LABELS", () => {
  it.each([
    ReservationType.Flight,
    ReservationType.Train,
    ReservationType.Bus,
    ReservationType.Ferry,
    ReservationType.Cruise,
  ])("has a non-empty label for %s", (type) => {
    expect(SERVICE_NUMBER_LABELS[type]?.length).toBeGreaterThan(0);
  });

  it.each([ReservationType.RentalCar, ReservationType.Lodging, ReservationType.Other])(
    "has no label for %s",
    (type) => {
      expect(SERVICE_NUMBER_LABELS[type]).toBeUndefined();
    }
  );
});

describe("ReservationTypeBadge", () => {
  it("renders the label for the given type", () => {
    render(<ReservationTypeBadge type={ReservationType.Lodging} />);
    expect(screen.getByText("Lodging")).toBeInTheDocument();
  });
});

describe("formatReservationDateRange", () => {
  it("returns empty string when both are undefined", () => {
    expect(formatReservationDateRange(undefined, undefined)).toBe("");
  });

  it("returns start date+time only when endAt is absent", () => {
    const startAt = "2026-08-01T10:00:00.000Z";
    const expectedTime = new Date(startAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    const result = formatReservationDateRange(startAt, undefined);
    expect(result).toContain(expectedTime);
    expect(result).not.toContain("–");
  });

  it("returns end date+time only when startAt is absent", () => {
    const endAt = "2026-08-05T11:00:00.000Z";
    const expectedTime = new Date(endAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    const result = formatReservationDateRange(undefined, endAt);
    expect(result).toContain(expectedTime);
    expect(result).not.toContain("–");
  });

  it("omits the date on end time when start and end are the same day", () => {
    const startAt = "2026-08-01T10:00:00.000Z";
    const endAt = "2026-08-01T14:00:00.000Z";
    const startDate = new Date(startAt).toLocaleDateString("en-US", { month: "long", day: "numeric" });
    const result = formatReservationDateRange(startAt, endAt);
    // date appears once; the end portion contains only the time
    expect(result).toContain(startDate);
    expect(result).toContain("–");
    // date should not appear twice
    expect(result.indexOf(startDate)).toBe(result.lastIndexOf(startDate));
  });

  it("includes the date for both anchors when start and end are on different days", () => {
    const startAt = "2026-08-01T10:00:00.000Z";
    const endAt = "2026-08-05T11:00:00.000Z";
    const startDate = new Date(startAt).toLocaleDateString("en-US", { month: "long", day: "numeric" });
    const endDate = new Date(endAt).toLocaleDateString("en-US", { month: "long", day: "numeric" });
    const result = formatReservationDateRange(startAt, endAt);
    expect(result).toContain(startDate);
    expect(result).toContain(endDate);
    expect(result).toContain("–");
  });
});
