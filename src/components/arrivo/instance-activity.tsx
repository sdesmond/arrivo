import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActivityEventType, type ActivityEventSummary } from "@/data/types";

export interface InstanceActivityProps {
  events: ActivityEventSummary[];
}

const EVENT_LABELS: Record<ActivityEventType, { type: string; action: string }> = {
  [ActivityEventType.SignIn]: { type: "Authentication", action: "Sign-in" },
};

const COLUMNS = ["Username", "Type", "Action", "Time", "Trip ID"];

// "2026-10-25T14:03:07.000Z" -> "2026-10-25 14:03:07 UTC"; local-timezone display is a later story.
function formatUtc(occurredAt: string): string {
  return `${occurredAt.slice(0, 10)} ${occurredAt.slice(11, 19)} UTC`;
}

export function InstanceActivity({ events }: InstanceActivityProps) {
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
              {event.actorUsername ?? "Unknown"}
            </TableCell>
            <TableCell>{EVENT_LABELS[event.type].type}</TableCell>
            <TableCell>{EVENT_LABELS[event.type].action}</TableCell>
            <TableCell>
              <time dateTime={event.occurredAt}>{formatUtc(event.occurredAt)}</time>
            </TableCell>
            <TableCell>{event.tripId ?? "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
