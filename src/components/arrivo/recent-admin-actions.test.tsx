import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ActivityEventType, type ActivityEventSummary } from "@/data/types";
import { RecentAdminActions } from "./recent-admin-actions";

const checkedAt = "2026-10-30T12:00:00.000Z";

const events: ActivityEventSummary[] = [
  {
    id: "event-1",
    type: ActivityEventType.AccountDeletedByAdmin,
    actorUsername: "alice",
    targetUsername: "deleted-bob",
    targetKnown: true,
    occurredAt: "2026-10-30T11:30:05.000Z",
    tripId: "trip-secret-id",
  },
  {
    id: "event-2",
    type: ActivityEventType.RetentionChanged,
    actorUsername: null,
    occurredAt: "2026-10-30T10:00:00.000Z",
  },
];

function renderInList(metric: Parameters<typeof RecentAdminActions>[0]["metric"]) {
  return render(
    <dl>
      <RecentAdminActions metric={metric} />
    </dl>
  );
}

describe("RecentAdminActions", () => {
  it("keeps stale redacted list and checked time with optional controls", () => {
    const { container } = render(
      <RecentAdminActions
        metric={{ status: "ok", value: events, checkedAt }}
        stale
        controls={<button>Retry Recent admin actions</button>}
      />
    );
    expect(screen.getByText("Stale")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText(/^Checked/)).toHaveAttribute("datetime", checkedAt);
    expect(screen.getByRole("button")).toHaveTextContent("Retry Recent admin actions");
    expect(container.innerHTML).not.toContain("trip-secret-id");
    expect(container.innerHTML).not.toContain("event-1");
  });
  it("lists entries in order with actor, action, affected account and time", () => {
    renderInList({ status: "ok", value: events, checkedAt });
    expect(screen.getByText("Recent admin actions").tagName).toBe("DT");
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("alice");
    expect(items[0]).toHaveTextContent("Deleted account");
    expect(items[0]).toHaveTextContent("deleted-bob");
    const time = within(items[0]).getByText("2026-10-30 11:30:05 UTC");
    expect(time.tagName).toBe("TIME");
    expect(time).toHaveAttribute("datetime", "2026-10-30T11:30:05.000Z");
    expect(items[1]).toHaveTextContent("Unknown");
    expect(items[1]).toHaveTextContent("Changed activity retention");
    expect(items[1]).toHaveTextContent("2026-10-30 10:00:00 UTC");
  });

  it("shows no IDs, trip IDs or links", () => {
    const { container } = renderInList({ status: "ok", value: events, checkedAt });
    expect(container.innerHTML).not.toContain("trip-secret-id");
    expect(container.innerHTML).not.toContain("event-1");
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("shows the empty text when no admin actions are recorded", () => {
    renderInList({ status: "ok", value: [], checkedAt });
    expect(screen.getByText("No admin actions recorded yet.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("shows Unavailable and never an empty list when the read failed", () => {
    renderInList({ status: "unavailable", checkedAt });
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(screen.queryByText("No admin actions recorded yet.")).not.toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it.each(["ok", "unavailable"] as const)("keeps its own checked time when %s", (status) => {
    renderInList(status === "ok" ? { status, value: events, checkedAt } : { status, checkedAt });
    const time = screen.getByText(/^Checked /);
    expect(time.tagName).toBe("TIME");
    expect(time).toHaveAttribute("datetime", checkedAt);
    expect(time).toHaveTextContent("Checked 12:00:00 UTC");
  });
});
