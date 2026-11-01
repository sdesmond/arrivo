import "server-only";
import { and, desc, eq, gte, inArray, isNotNull, lt, lte, or, sql, type SQL } from "drizzle-orm";
import type { db } from "@/db";
import { activityEvents } from "@/db/schema";
import {
  ActivityEventType,
  type ActivityActorOption,
  type ActivityEventSummary,
  type ActivityPageResult,
  type ActivityQuery,
} from "@/data/types";
import { BATCH_GAP_MS, BATCHED_TYPES } from "./activity-batches";
import { isAppAdmin } from "./app-roles";

/** Takes a database handle (not the singleton) so tests can bind it to an isolated schema. */
export type ActivityReadDatabase = Pick<typeof db, "select">;

export const ACTIVITY_PAGE_SIZE = 20;
export const ACTIVITY_ACTOR_LIMIT = 200;

const KNOWN_TYPES: readonly string[] = Object.values(ActivityEventType);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Cursor {
  endedAt: Date;
  id: string;
}

export function encodeActivityCursor(endedAt: Date, id: string): string {
  return Buffer.from(`${endedAt.toISOString()}|${id}`, "utf8").toString("base64url");
}

/** Anything that is not exactly what `encodeActivityCursor` produces reads as "no cursor". */
export function decodeActivityCursor(cursor: string | undefined): Cursor | undefined {
  if (!cursor) return undefined;
  const [instant, id, ...extra] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
  if (extra.length > 0 || !instant || !id || !UUID.test(id)) return undefined;
  const endedAt = new Date(instant);
  if (Number.isNaN(endedAt.getTime()) || endedAt.toISOString() !== instant) return undefined;
  return { endedAt, id };
}

const SUMMARY_COLUMNS = {
  id: activityEvents.id,
  type: activityEvents.type,
  actorUsername: activityEvents.actorUsername,
  targetId: activityEvents.targetId,
  targetUsername: activityEvents.targetUsername,
  startedAt: activityEvents.startedAt,
  endedAt: activityEvents.endedAt,
  tripId: activityEvents.tripId,
};

interface SummaryRow {
  id: string;
  type: string;
  actorUsername: string | null;
  targetId: string | null;
  targetUsername: string | null;
  startedAt: Date;
  endedAt: Date;
  tripId: string | null;
}

/** Row -> summary mapping shared by every Activity read: actor, action, target username, time and trip ID only. */
function toSummary(row: SummaryRow, now: Date): ActivityEventSummary {
  const batched = BATCHED_TYPES.has(row.type);
  return {
    id: row.id,
    type: row.type as ActivityEventType,
    actorUsername: row.actorUsername,
    // Only the username leaves the server; the ID just says whether it named a real account.
    ...(row.targetUsername ? { targetUsername: row.targetUsername, targetKnown: row.targetId !== null } : {}),
    occurredAt: row.endedAt.toISOString(),
    // "Ongoing" uses the real clock: the dev date picker must not change whether a burst is still open.
    ...(batched
      ? { startedAt: row.startedAt.toISOString(), ongoing: now.getTime() - row.endedAt.getTime() < BATCH_GAP_MS }
      : {}),
    ...(row.tripId ? { tripId: row.tripId } : {}),
  };
}

/**
 * The latest `limit` rows of the given types, newest first (`endedAt desc, id desc`). No admin recheck: callers sit
 * behind a page-level admin guard.
 */
export async function readRecentActivity(
  database: ActivityReadDatabase,
  types: readonly ActivityEventType[],
  limit: number,
  now: Date = new Date()
): Promise<ActivityEventSummary[]> {
  const rows = await database
    .select(SUMMARY_COLUMNS)
    .from(activityEvents)
    .where(inArray(activityEvents.type, [...types]))
    .orderBy(desc(activityEvents.endedAt), desc(activityEvents.id))
    .limit(limit);
  return rows.map((row) => toSummary(row, now));
}

/** How many rows of one type ended at or after `since` (inclusive). No admin recheck, as for `readRecentActivity`. */
export async function countActivitySince(
  database: ActivityReadDatabase,
  type: ActivityEventType,
  since: Date
): Promise<number> {
  const [row] = await database
    .select({ total: sql<number>`count(*)::int` })
    .from(activityEvents)
    .where(and(eq(activityEvents.type, type), gte(activityEvents.endedAt, since)));
  return row.total;
}

function parseInstant(value: string | undefined): Date | undefined | "invalid" {
  if (value === undefined || value === "") return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "invalid" : date;
}

/**
 * One keyset page, newest first (`endedAt desc, id desc`). Rechecks current database admin authority for the viewer on
 * every call; the caller decides how to present `forbidden`. Query fields are untrusted: an unknown type is no filter,
 * a malformed cursor is the first page, and an unknown or malformed actor, or an unreadable or inverted date range,
 * matches nothing.
 */
export async function readActivityPage(
  database: ActivityReadDatabase,
  viewerId: string,
  query: ActivityQuery,
  now: Date = new Date()
): Promise<ActivityPageResult> {
  if (!(await isAppAdmin(viewerId))) return { status: "forbidden" };

  const actors = await readActors(database);
  const loadedAt = now.toISOString();
  const empty = (invalidRange?: true) => ({
    status: "ok" as const,
    events: [],
    actors,
    loadedAt,
    ...(invalidRange ? { invalidRange } : {}),
  });

  const from = parseInstant(query.from);
  const to = parseInstant(query.to);
  if (from === "invalid" || to === "invalid" || (from && to && from > to)) return empty(true);
  if (query.actorId !== undefined && query.actorId !== "" && !UUID.test(query.actorId)) return empty();

  const cursor = decodeActivityCursor(query.cursor);
  const conditions: (SQL | undefined)[] = [inArray(activityEvents.type, KNOWN_TYPES)];
  if (query.actorId) conditions.push(eq(activityEvents.actorId, query.actorId));
  if (query.type && KNOWN_TYPES.includes(query.type)) conditions.push(eq(activityEvents.type, query.type));
  // A row matches when its [startedAt, endedAt] interval overlaps [from, to], inclusive at both ends.
  if (from) conditions.push(gte(activityEvents.endedAt, from));
  if (to) conditions.push(lte(activityEvents.startedAt, to));
  if (cursor) {
    conditions.push(
      or(
        lt(activityEvents.endedAt, cursor.endedAt),
        and(eq(activityEvents.endedAt, cursor.endedAt), lt(activityEvents.id, cursor.id))
      )
    );
  }

  const rows = await database
    .select(SUMMARY_COLUMNS)
    .from(activityEvents)
    .where(and(...conditions))
    .orderBy(desc(activityEvents.endedAt), desc(activityEvents.id))
    .limit(ACTIVITY_PAGE_SIZE + 1);

  const page = rows.slice(0, ACTIVITY_PAGE_SIZE);
  const last = page[page.length - 1];
  const events = page.map((row) => toSummary(row, now));

  return {
    status: "ok",
    events,
    ...(rows.length > ACTIVITY_PAGE_SIZE && last ? { nextCursor: encodeActivityCursor(last.endedAt, last.id) } : {}),
    actors,
    loadedAt,
  };
}

/** Distinct stable actor IDs labelled by their latest snapshot username, most recently active first. */
async function readActors(database: ActivityReadDatabase): Promise<ActivityActorOption[]> {
  const lastActive = sql`max(${activityEvents.endedAt})`;
  const rows = await database
    .select({
      id: sql<string>`${activityEvents.actorId}`,
      username: sql<string>`(array_agg(${activityEvents.actorUsername} order by ${activityEvents.endedAt} desc, ${activityEvents.id} desc))[1]`,
    })
    .from(activityEvents)
    .where(and(isNotNull(activityEvents.actorId), isNotNull(activityEvents.actorUsername)))
    .groupBy(activityEvents.actorId)
    .orderBy(desc(lastActive), desc(activityEvents.actorId))
    .limit(ACTIVITY_ACTOR_LIMIT);
  return rows.map((row) => ({ id: row.id, username: row.username }));
}
