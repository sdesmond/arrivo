"use client";

import type { ReactElement } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ScheduleConflictBadgeProps {
  count: number;
  conflictingEventNames?: string[];
  onClick: () => void;
}

export function ScheduleConflictBadge({
  count,
  conflictingEventNames = [],
  onClick,
}: ScheduleConflictBadgeProps): ReactElement {
  const announcement =
    conflictingEventNames.length === 1
      ? `Schedule conflict at ${conflictingEventNames[0]}`
      : conflictingEventNames.length > 1
        ? `Schedule conflicts at ${conflictingEventNames.join(", ")}`
        : "";

  return (
    <div aria-live="polite" data-testid="schedule-conflict-badge">
      {count > 0 && (
        <Button
          variant="ghost"
          size="lg"
          onClick={onClick}
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
        </Button>
      )}
    </div>
  );
}
