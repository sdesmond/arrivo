import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActivityEventType, type ActivityEventSummary } from "@/data/types";

export interface InstanceActivityProps {
  events: ActivityEventSummary[];
}

const EVENT_LABELS: Record<ActivityEventType, { type: string; action: string }> = {
  [ActivityEventType.SignIn]: { type: "Authentication", action: "Sign-in" },
  [ActivityEventType.SignInFailed]: { type: "Authentication", action: "Failed sign-in" },
  [ActivityEventType.SignOut]: { type: "Authentication", action: "Sign-out" },
  [ActivityEventType.AccountCreated]: { type: "Accounts", action: "Created first admin account" },
  [ActivityEventType.RoleChanged]: { type: "Accounts", action: "Changed role" },
  [ActivityEventType.UsernameChanged]: { type: "Accounts", action: "Changed username" },
  [ActivityEventType.PasswordChanged]: { type: "Accounts", action: "Changed password" },
  [ActivityEventType.AccountDeleted]: { type: "Accounts", action: "Deleted own account" },
  [ActivityEventType.TripCreated]: { type: "Trips", action: "Created trip" },
  [ActivityEventType.TripUpdated]: { type: "Trips", action: "Updated trip" },
};

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
              {actorLabel(event)}
            </TableCell>
            <TableCell>{EVENT_LABELS[event.type].type}</TableCell>
            <TableCell>{EVENT_LABELS[event.type].action}</TableCell>
            <TableCell>{targetLabel(event)}</TableCell>
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
