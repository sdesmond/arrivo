"use server";

import { db } from "@/db";
import type { ActivityLoadResult, ActivityQuery } from "@/data/types";
import { readActivityPage } from "@/lib/activity-queries";
import { requireUser } from "@/lib/auth-helpers";

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
