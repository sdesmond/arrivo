import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActivityEventType, type ActivityEventSummary } from "@/data/types";
import { formatInstant } from "@/lib/activity-dates";
import { EVENT_LABELS } from "@/lib/activity-labels";

export interface InstanceActivityProps {
  events: ActivityEventSummary[];
  /** IANA zone the times are shown in; UTC until the browser's zone is known. */
  timeZone?: string;
}

const COLUMNS = ["Username", "Type", "Action", "Affected account", "Time", "Trip ID"];

// A failed sign-in has no authenticated actor; a null actor elsewhere is a snapshot we never captured.
function actorLabel(event: ActivityEventSummary): string {
  if (event.actorUsername) return event.actorUsername;
  return event.type === ActivityEventType.SignInFailed || event.type === ActivityEventType.SignOut
    ? "Unavailable"
    : "Unknown";
}

function targetLabel(event: ActivityEventSummary): string {
  if (event.targetUsername)
    return event.targetKnown ? event.targetUsername : `${event.targetUsername} (Unknown account)`;
  return event.type === ActivityEventType.SignInFailed ? "Unavailable" : "—";
}

function TimeCell({ event, timeZone }: { event: ActivityEventSummary; timeZone: string }) {
  const range = event.startedAt !== undefined && event.startedAt !== event.occurredAt;
  return (
    <>
      {range && event.startedAt ? (
        <>
          <time dateTime={event.startedAt}>{formatInstant(event.startedAt, timeZone)}</time>
          <span> to </span>
        </>
      ) : null}
      <time dateTime={event.occurredAt}>{formatInstant(event.occurredAt, timeZone)}</time>
      {event.ongoing ? (
        <span className="ml-2 font-medium" style={{ color: "var(--accent-brand)" }}>
          Ongoing
        </span>
      ) : null}
    </>
  );
}

export function InstanceActivity({ events, timeZone = "UTC" }: InstanceActivityProps) {
  if (events.length === 0) {
    return (
      <p className="mt-4 text-sm" style={{ color: "var(--fg-3)" }}>
        No activity recorded yet.
      </p>
    );
  }
  return (
    <Table
      containerProps={{
        role: "region",
        "aria-label": "Activity table",
        tabIndex: 0,
        className: "mt-4 rounded-md",
      }}
    >
      <TableCaption className="sr-only">Recent instance activity</TableCaption>
      <TableHeader>
        <TableRow>
          {COLUMNS.map((column) => (
            <TableHead key={column} scope="col">
              {column}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.map((event) => (
          <TableRow key={event.id}>
            <TableCell className="font-medium" style={{ color: "var(--fg)" }}>
              {actorLabel(event)}
            </TableCell>
            <TableCell>{EVENT_LABELS[event.type].type}</TableCell>
            <TableCell>{EVENT_LABELS[event.type].action}</TableCell>
            <TableCell>{targetLabel(event)}</TableCell>
            <TableCell>
              <TimeCell event={event} timeZone={timeZone} />
            </TableCell>
            <TableCell>{event.tripId ?? "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
