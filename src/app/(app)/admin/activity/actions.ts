"use server";

import { db } from "@/db";
import type { ActivityLoadResult, ActivityQuery } from "@/data/types";
import { readActivityPage } from "@/lib/activity-queries";
import { requireUser } from "@/lib/auth-helpers";
import { revalidatePath } from "next/cache";
import { ActivityEventType, type ActivityRetentionReadResult, type ActivityRetentionSaveResult } from "@/data/types";
import { readActivityRetention, saveActivityRetention } from "@/lib/activity-retention";
import { recordActivity } from "@/lib/activity";
import { scheduleActivityMaintenance } from "@/lib/activity-maintenance";

export async function saveActivityRetentionPolicy(
  days: unknown,
  expectedDays: unknown
): Promise<ActivityRetentionSaveResult> {
  const user = await requireUser();
  let result;
  try {
    result = await saveActivityRetention(db, user.id!, days, expectedDays);
  } catch {
    return { status: "unavailable" };
  }
  if (result.status !== "ok") return result;
  if (result.changed) recordActivity({ type: ActivityEventType.RetentionChanged, actor: result.actor });
  scheduleActivityMaintenance();
  // Revalidation failure cannot turn a committed save into a claimed failure.
  try {
    revalidatePath("/admin/activity");
  } catch {
    /* Next request reads committed policy. */
  }
  return { status: "ok", days: result.days };
}

export async function refreshActivityRetention(): Promise<ActivityRetentionReadResult> {
  const user = await requireUser();
  try {
    return await readActivityRetention(db, user.id!);
  } catch {
    return { status: "unavailable" };
  }
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

/**
 * Reads one Activity page for the viewer, rechecking current admin authority. Failures come back as a status, never as
 * a message: the client shows fixed text and no error detail (or private trip content) crosses the wire.
 */
export async function loadActivityPage(query: ActivityQuery): Promise<ActivityLoadResult> {
  const user = await requireUser();
  try {
    // Server actions take arbitrary wire input, so rebuild the query from strings only.
    const safeQuery = (query ?? {}) as Record<string, unknown>;
    return await readActivityPage(db, user.id!, {
      actorId: text(safeQuery.actorId),
      type: text(safeQuery.type) as ActivityQuery["type"],
      from: text(safeQuery.from),
      to: text(safeQuery.to),
      cursor: text(safeQuery.cursor),
    });
  } catch {
    return { status: "unavailable" };
  }
}
