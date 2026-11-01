"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ActivityActorOption, ActivityEventType, ActivityQuery } from "@/data/types";
import { dayToInstant, instantToDay } from "@/lib/activity-dates";
import { ACTIVITY_TYPE_OPTIONS } from "@/lib/activity-labels";

export interface ActivityFiltersProps {
  query: ActivityQuery;
  actors: ActivityActorOption[];
  timeZone: string;
  /** The chosen range is unreadable or inverted; shown as field error text. */
  rangeError?: boolean;
  onChange: (next: ActivityQuery) => void;
  onClear: () => void;
}

const ANY = "any";
const FIELD_LABEL_CLASS = "text-xs font-medium";
const TRIGGER_CLASS = "w-full data-[size=default]:h-11";

export function hasActivityFilters(query: ActivityQuery): boolean {
  return Boolean(query.actorId || query.type || query.from || query.to);
}

/** Filter changes always return to the newest page, so the cursor is dropped. */
function withFilters(query: ActivityQuery, changes: Partial<ActivityQuery>): ActivityQuery {
  const next = { ...query, ...changes };
  delete next.cursor;
  return next;
}

export function ActivityFilters({ query, actors, timeZone, rangeError, onChange, onClear }: ActivityFiltersProps) {
  const actorItems = [
    { value: ANY, label: "All usernames" },
    ...actors.map((actor) => ({ value: actor.id, label: actor.username })),
  ];
  // A filter from the URL can name an account that is not listed; keep it selected without ever showing its ID.
  if (query.actorId && !actors.some((actor) => actor.id === query.actorId)) {
    actorItems.push({ value: query.actorId, label: "Unknown account" });
  }
  const typeItems = [{ value: ANY, label: "All actions" }, ...ACTIVITY_TYPE_OPTIONS];
  const actorValue = query.actorId ?? ANY;

  return (
    <div role="group" aria-label="Activity filters" className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="flex flex-col gap-1">
        <span id="activity-filter-actor" className={FIELD_LABEL_CLASS} style={{ color: "var(--fg-2)" }}>
          Username
        </span>
        <Select
          value={actorValue}
          items={actorItems}
          onValueChange={(value) =>
            onChange(withFilters(query, { actorId: value === ANY ? undefined : (value as string) }))
          }
        >
          <SelectTrigger aria-labelledby="activity-filter-actor" className={TRIGGER_CLASS}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {actorItems.map((item) => (
              <SelectItem key={item.value} value={item.value} className="min-h-11">
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <span id="activity-filter-type" className={FIELD_LABEL_CLASS} style={{ color: "var(--fg-2)" }}>
          Action
        </span>
        <Select
          value={query.type ?? ANY}
          items={typeItems}
          onValueChange={(value) =>
            onChange(withFilters(query, { type: value === ANY ? undefined : (value as ActivityEventType) }))
          }
        >
          <SelectTrigger aria-labelledby="activity-filter-type" className={TRIGGER_CLASS}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {typeItems.map((item) => (
              <SelectItem key={item.value} value={item.value} className="min-h-11">
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div key={timeZone} className="flex flex-col gap-1">
        <label htmlFor="activity-filter-from" className={FIELD_LABEL_CLASS} style={{ color: "var(--fg-2)" }}>
          From
        </label>
        <Input
          id="activity-filter-from"
          type="date"
          className="h-11"
          value={instantToDay(query.from, timeZone)}
          aria-invalid={rangeError || undefined}
          onChange={(event) =>
            onChange(withFilters(query, { from: dayToInstant(event.target.value, timeZone, "start") }))
          }
        />
      </div>
      <div key={`${timeZone}-to`} className="flex flex-col gap-1">
        <label htmlFor="activity-filter-to" className={FIELD_LABEL_CLASS} style={{ color: "var(--fg-2)" }}>
          To
        </label>
        <Input
          id="activity-filter-to"
          type="date"
          className="h-11"
          value={instantToDay(query.to, timeZone)}
          aria-invalid={rangeError || undefined}
          aria-describedby={rangeError ? "activity-filter-range-error" : undefined}
          onChange={(event) => onChange(withFilters(query, { to: dayToInstant(event.target.value, timeZone, "end") }))}
        />
      </div>
      {rangeError ? (
        <p
          id="activity-filter-range-error"
          className="text-sm sm:col-span-2 lg:col-span-4"
          style={{ color: "var(--danger)" }}
        >
          Enter a start date that is on or before the end date.
        </p>
      ) : null}
      {hasActivityFilters(query) ? (
        <div className="sm:col-span-2 lg:col-span-4">
          <Button type="button" variant="outline" size="lg" onClick={onClear}>
            Clear filters
          </Button>
        </div>
      ) : null}
    </div>
  );
}
