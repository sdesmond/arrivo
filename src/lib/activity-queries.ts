import "server-only";
import { desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { activityEvents } from "@/db/schema";
import { ActivityEventType, type ActivityEventSummary } from "@/data/types";
import { isInstanceAdmin } from "./instance-roles";

export const ACTIVITY_LIST_LIMIT = 100;

const KNOWN_TYPES: readonly string[] = Object.values(ActivityEventType);

/** Newest first. Rechecks current database admin authority for the viewer; anyone else gets notFound(). */
export async function listRecentActivity(viewerId: string): Promise<ActivityEventSummary[]> {
  if (!(await isInstanceAdmin(viewerId))) notFound();
  const rows = await db
    .select({
      id: activityEvents.id,
      type: activityEvents.type,
      actorUsername: activityEvents.actorUsername,
      targetId: activityEvents.targetId,
      targetUsername: activityEvents.targetUsername,
      endedAt: activityEvents.endedAt,
      tripId: activityEvents.tripId,
    })
    .from(activityEvents)
    .orderBy(desc(activityEvents.endedAt), desc(activityEvents.id))
    .limit(ACTIVITY_LIST_LIMIT);
  return rows
    .filter((row) => KNOWN_TYPES.includes(row.type))
    .map((row) => ({
      id: row.id,
      type: row.type as ActivityEventType,
      actorUsername: row.actorUsername,
      // Only the username leaves the server; the ID just says whether it named a real account.
      ...(row.targetUsername ? { targetUsername: row.targetUsername, targetKnown: row.targetId !== null } : {}),
      occurredAt: row.endedAt.toISOString(),
      ...(row.tripId ? { tripId: row.tripId } : {}),
    }));
}
