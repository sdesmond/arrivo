import type { ReactNode } from "react";
import type { ActivityEventSummary } from "@/data/types";
import { formatInstant } from "@/lib/activity-dates";
import { EVENT_LABELS } from "@/lib/activity-labels";
import type { Metric } from "@/lib/overview-metric";

export interface RecentAdminActionsProps {
  metric: Metric<ActivityEventSummary[]>;
  controls?: ReactNode;
  stale?: boolean;
}

// Read-only Overview row in the MetricRow rhythm; entries show actor, action, affected account and time only.
export function RecentAdminActions({ metric, controls, stale }: RecentAdminActionsProps) {
  const checked = metric.checkedAt.slice(11, 19);
  return (
    <div
      className="flex min-h-11 flex-wrap items-start justify-between gap-x-4 gap-y-1 border-b py-2 last:border-b-0"
      style={{ borderColor: "var(--line)" }}
    >
      <dt className="text-sm text-fg">Recent admin actions</dt>
      <dd className="m-0 flex min-w-0 max-w-full flex-col items-end gap-1">
        {metric.status === "unavailable" ? (
          <span className="text-sm font-medium" style={{ color: "var(--fg-3)" }}>
            Unavailable
          </span>
        ) : metric.value.length === 0 ? (
          <span className="text-sm" style={{ color: "var(--fg-2)" }}>
            No admin actions recorded yet.
          </span>
        ) : (
          <ol className="m-0 flex max-w-full list-none flex-col gap-1 p-0 text-right wrap-anywhere">
            {metric.value.map((event) => (
              <li key={event.id} className="text-sm" style={{ color: "var(--fg)" }}>
                <span className="font-medium">{event.actorUsername ?? "Unknown"}</span>{" "}
                <span>{EVENT_LABELS[event.type].action}</span>
                {event.targetUsername ? <span className="font-medium"> {event.targetUsername}</span> : null}{" "}
                <time dateTime={event.occurredAt} className="text-xs" style={{ color: "var(--fg-3)" }}>
                  {formatInstant(event.occurredAt, "UTC")}
                </time>
              </li>
            ))}
          </ol>
        )}
        <time dateTime={metric.checkedAt} className="text-xs" style={{ color: "var(--fg-3)" }}>
          Checked {checked} UTC
        </time>
        {stale ? (
          <span className="text-sm" style={{ color: "var(--fg-2)" }}>
            Stale
          </span>
        ) : null}
        {controls}
      </dd>
    </div>
  );
}
