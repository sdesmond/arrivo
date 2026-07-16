"use client";

import type { ReactElement } from "react";
import { TriangleAlert } from "lucide-react";

export interface ScheduleConflictBadgeProps {
  count: number;
  conflictingEventNames?: string[];
}

export function ScheduleConflictBadge({ count, conflictingEventNames = [] }: ScheduleConflictBadgeProps): ReactElement {
  const announcement =
    conflictingEventNames.length === 1
      ? `Schedule conflict at ${conflictingEventNames[0]}`
      : conflictingEventNames.length > 1
        ? `Schedule conflicts at ${conflictingEventNames.join(", ")}`
        : "";

  return (
    <div aria-live="polite" data-testid="schedule-conflict-badge">
      {count > 0 && (
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5"
          style={{
            background: "var(--warning-soft)",
            color: "var(--warning-ink)",
            fontSize: "calc(12px * var(--font-scale))",
            fontWeight: 600,
          }}
        >
          <TriangleAlert size={12} strokeWidth={1.5} aria-hidden="true" />
          {count === 1 ? "1 tight connection today" : `${count} tight connections today`}
          {announcement && <span className="sr-only">{announcement}</span>}
        </span>
      )}
    </div>
  );
}
