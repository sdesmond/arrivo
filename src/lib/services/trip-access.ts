import "server-only";
import { db } from "@/db";
import { collaborators } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import type { CollaboratorRole } from "@/data/types";
import type { DbTransaction } from "@/lib/server-action-locks";
import { isUuid } from "@/lib/validation-limits";
export class TripNotFoundError extends Error {
  constructor() {
    super("Resource not found.");
    this.name = "TripNotFoundError";
  }
}
export class TripForbiddenError extends Error {
  constructor(readonly requiredRole: CollaboratorRole) {
    super("You do not have permission for this action.");
    this.name = "TripForbiddenError";
  }
}
export async function requireTripRole(
  tripId: string,
  userId: string,
  minRole: CollaboratorRole = "viewer",
  executor: Pick<DbTransaction, "select"> = db
): Promise<CollaboratorRole> {
  if (!isUuid(tripId)) throw new TripNotFoundError();
  const ranks = { viewer: 0, editor: 1, manager: 2 };
  const [collaborator] = await executor
    .select({ role: collaborators.role })
    .from(collaborators)
    .where(and(eq(collaborators.tripId, tripId), eq(collaborators.userId, userId)));
  if (!collaborator || !Object.hasOwn(ranks, collaborator.role)) throw new TripNotFoundError();
  const role = collaborator.role as CollaboratorRole;
  if (ranks[role] < ranks[minRole]) throw new TripForbiddenError(minRole);
  return role;
}
