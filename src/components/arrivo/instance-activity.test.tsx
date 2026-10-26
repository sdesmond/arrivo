import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ActivityEventSummary } from "@/data/types";
import { InstanceActivity } from "./instance-activity";

const EVENT: ActivityEventSummary = {
  id: "event-1",
  type: "sign_in",
  actorUsername: "alice",
  occurredAt: "2026-10-25T14:03:07.000Z",
};

describe("InstanceActivity", () => {
  it("renders a captioned table with column headers and a UTC time", () => {
    render(<InstanceActivity events={[EVENT]} />);
    const table = screen.getByRole("table", { name: "Recent instance activity" });
    for (const name of ["Username", "Type", "Action", "Time", "Trip ID"]) {
      expect(within(table).getByRole("columnheader", { name })).toHaveAttribute("scope", "col");
    }
    const row = within(table).getAllByRole("row")[1];
    expect(within(row).getByText("alice")).toBeInTheDocument();
    expect(within(row).getByText("Authentication")).toBeInTheDocument();
    expect(within(row).getByText("Sign-in")).toBeInTheDocument();
    expect(within(row).getByText("2026-10-25 14:03:07 UTC")).toHaveAttribute("datetime", EVENT.occurredAt);
    expect(within(row).getByText("—")).toBeInTheDocument();
  });

  it("shows the trip id when present and a placeholder for an unknown username", () => {
    render(<InstanceActivity events={[{ ...EVENT, actorUsername: null, tripId: "trip-9" }]} />);
    expect(screen.getByText("trip-9")).toBeInTheDocument();
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });

  it("wraps the table in a labeled, keyboard-scrollable region", () => {
    render(<InstanceActivity events={[EVENT]} />);
    const region = screen.getByRole("region", { name: "Activity table" });
    expect(region).toHaveAttribute("tabindex", "0");
  });

  it("shows an empty state instead of a table", () => {
    render(<InstanceActivity events={[]} />);
    expect(screen.getByText("No activity recorded yet.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
