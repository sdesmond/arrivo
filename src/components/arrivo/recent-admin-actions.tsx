import type { ReactNode } from "react";
import type { ActivityEventSummary } from "@/data/types";
import { formatInstant } from "@/lib/activity-dates";
import { useBrowserTimeZone } from "@/lib/browser-time-zone";
import { EVENT_LABELS } from "@/lib/activity-labels";
import type { Metric } from "@/lib/overview-metric";

export interface RecentAdminActionsProps {
  metric: Metric<ActivityEventSummary[]>;
  controls?: ReactNode;
  stale?: boolean;
}

// Read-only full-width Overview card; entries show actor, action, affected account and time only.
export function RecentAdminActions({ metric, controls, stale }: RecentAdminActionsProps) {
  const timeZone = useBrowserTimeZone();
  return (
    <div
      className="relative col-span-full flex min-w-0 flex-col rounded-lg border p-4"
      style={{ borderColor: "var(--line)", background: "var(--bg)" }}
    >
      <dt className="px-12 text-center text-lg font-bold break-words" style={{ color: "var(--fg)" }}>
        Recent admin actions
      </dt>
      <dd className="m-0 flex min-w-0 flex-col gap-2 pt-2">
        {metric.status === "unavailable" ? (
          <span className="text-sm font-medium" style={{ color: "var(--fg-3)" }}>
            Unavailable
          </span>
        ) : metric.value.length === 0 ? (
          <span className="text-sm" style={{ color: "var(--fg-2)" }}>
            No admin actions recorded yet.
          </span>
        ) : (
          <ol className="m-0 flex max-w-full list-none flex-col gap-1 p-0 wrap-anywhere">
            {metric.value.map((event) => (
              <li key={event.id} className="text-sm" style={{ color: "var(--fg)" }}>
                <span className="font-medium">{event.actorUsername ?? "Unknown"}</span>{" "}
                <span>{EVENT_LABELS[event.type].action}</span>
                {event.targetUsername ? <span className="font-medium"> {event.targetUsername}</span> : null}{" "}
                <time dateTime={event.occurredAt} className="text-xs" style={{ color: "var(--fg-3)" }}>
                  {formatInstant(event.occurredAt, timeZone)}
                </time>
              </li>
            ))}
          </ol>
        )}
        {stale ? (
          <span className="text-sm" style={{ color: "var(--fg-2)" }}>
            Stale
          </span>
        ) : null}
        <div className="absolute right-1 top-1">{controls}</div>
      </dd>
    </div>
  );
}
