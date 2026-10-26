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
    for (const name of ["Username", "Type", "Action", "Affected account", "Time", "Trip ID"]) {
      expect(within(table).getByRole("columnheader", { name })).toHaveAttribute("scope", "col");
    }
    const row = within(table).getAllByRole("row")[1];
    expect(within(row).getByText("alice")).toBeInTheDocument();
    expect(within(row).getByText("Authentication")).toBeInTheDocument();
    expect(within(row).getByText("Sign-in")).toBeInTheDocument();
    expect(within(row).getByText("2026-10-25 14:03:07 UTC")).toHaveAttribute("datetime", EVENT.occurredAt);
    expect(within(row).getAllByText("—")).toHaveLength(2);
  });

  it("shows times in the given timezone", () => {
    render(<InstanceActivity events={[EVENT]} timeZone="America/Denver" />);
    expect(screen.getByText("2026-10-25 08:03:07 MDT")).toHaveAttribute("datetime", EVENT.occurredAt);
  });

  it("shows a batched row as a start-to-end range with Ongoing text", () => {
    render(
      <InstanceActivity
        events={[
          {
            ...EVENT,
            type: "trip_updated",
            startedAt: "2026-10-25T13:50:00.000Z",
            occurredAt: "2026-10-25T14:05:00.000Z",
            ongoing: true,
          },
        ]}
      />
    );
    const cell = within(screen.getAllByRole("row")[1]).getAllByRole("cell")[4];
    expect(cell).toHaveTextContent("2026-10-25 13:50:00 UTC to 2026-10-25 14:05:00 UTC");
    expect(cell).toHaveTextContent("Ongoing");
  });

  it("shows a single time for a batched row that has not been extended and no Ongoing text when finished", () => {
    render(
      <InstanceActivity events={[{ ...EVENT, type: "trip_updated", startedAt: EVENT.occurredAt, ongoing: false }]} />
    );
    const cell = within(screen.getAllByRole("row")[1]).getAllByRole("cell")[4];
    expect(cell).not.toHaveTextContent(" to ");
    expect(cell).not.toHaveTextContent("Ongoing");
  });

  it("labels a batched trip update as a summary with no edit details", () => {
    render(<InstanceActivity events={[{ ...EVENT, type: "trip_updated", tripId: "trip-9" }]} />);
    const row = screen.getAllByRole("row")[1];
    expect(within(row).getByText("Trips")).toBeInTheDocument();
    expect(within(row).getByText("Updated trip")).toBeInTheDocument();
  });

  it("shows the trip id when present and a placeholder for an unknown username", () => {
    render(<InstanceActivity events={[{ ...EVENT, actorUsername: null, tripId: "trip-9" }]} />);
    expect(screen.getByText("trip-9")).toBeInTheDocument();
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });

  it("shows a failed sign-in's known target with an unavailable actor", () => {
    render(
      <InstanceActivity
        events={[{ ...EVENT, type: "sign_in_failed", actorUsername: null, targetUsername: "alice", targetKnown: true }]}
      />
    );
    const row = screen.getAllByRole("row")[1];
    const cells = within(row).getAllByRole("cell");
    expect(cells[0]).toHaveTextContent("Unavailable");
    expect(within(row).getByText("Failed sign-in")).toBeInTheDocument();
    expect(cells[3]).toHaveTextContent("alice");
    expect(cells[3]).not.toHaveTextContent("Unknown account");
  });

  it("marks a supplied name that matched no account as an unknown account", () => {
    render(
      <InstanceActivity
        events={[
          { ...EVENT, type: "sign_in_failed", actorUsername: null, targetUsername: "ghost", targetKnown: false },
        ]}
      />
    );
    expect(screen.getByText("ghost (Unknown account)")).toBeInTheDocument();
  });

  it("says Unavailable when a failed sign-in has no safe identity", () => {
    render(<InstanceActivity events={[{ ...EVENT, type: "sign_in_failed", actorUsername: null }]} />);
    expect(screen.getAllByText("Unavailable")).toHaveLength(2);
  });

  it("renders text-like usernames as plain text", () => {
    render(
      <InstanceActivity
        events={[
          { ...EVENT, type: "sign_in_failed", actorUsername: null, targetUsername: "<b>x</b>", targetKnown: false },
        ]}
      />
    );
    expect(screen.getByText("<b>x</b> (Unknown account)")).toBeInTheDocument();
  });

  it("separates the acting admin from the affected account for a role change", () => {
    render(
      <InstanceActivity
        events={[{ ...EVENT, type: "role_changed", actorUsername: "admin", targetUsername: "bob", targetKnown: true }]}
      />
    );
    const cells = within(screen.getAllByRole("row")[1]).getAllByRole("cell");
    expect(cells[0]).toHaveTextContent("admin");
    expect(cells[1]).toHaveTextContent("Accounts");
    expect(cells[2]).toHaveTextContent("Changed role");
    expect(cells[3]).toHaveTextContent("bob");
  });

  it.each([
    ["trip_created", "Trips", "Created trip"],
    ["invitation_created", "Trips", "Created invitation"],
    ["invitation_accepted", "Trips", "Accepted invitation"],
    ["invitation_rescinded", "Trips", "Rescinded invitation"],
    ["sign_out", "Authentication", "Sign-out"],
    ["account_created", "Accounts", "Created first admin account"],
    ["username_changed", "Accounts", "Changed username"],
    ["password_changed", "Accounts", "Changed password"],
    ["account_deleted", "Accounts", "Deleted own account"],
  ] as const)("labels %s", (type, group, action) => {
    render(<InstanceActivity events={[{ ...EVENT, type }]} />);
    const cells = within(screen.getAllByRole("row")[1]).getAllByRole("cell");
    expect(cells[0]).toHaveTextContent("alice");
    expect(cells[1]).toHaveTextContent(group);
    expect(cells[2]).toHaveTextContent(action);
  });

  it("shows Unavailable for a sign-out whose identity was not captured", () => {
    render(<InstanceActivity events={[{ ...EVENT, type: "sign_out", actorUsername: null }]} />);
    expect(screen.getAllByRole("cell")[0]).toHaveTextContent("Unavailable");
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
