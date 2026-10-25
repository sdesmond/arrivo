import "server-only";
import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@/db";
import { collaborators } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import type { CollaboratorRole } from "@/data/types";
import { isInstanceAdmin } from "@/lib/instance-roles";

export async function getCurrentUser() {
  const session = await auth();
  return session?.user ?? null;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (!(await isInstanceAdmin(user.id!))) notFound();
  return user;
}

// Every Server Action MUST call this before any write, even if the query layer
// also calls it. Defense-in-depth — actions can be invoked directly via the
// wire format and must not trust caller context.
export async function assertTripAccess(
  tripId: string,
  userId: string,
  minRole: CollaboratorRole = "viewer"
): Promise<CollaboratorRole> {
  const roleRank = { viewer: 0, editor: 1, manager: 2 };
  const [collab] = await db
    .select({ role: collaborators.role })
    .from(collaborators)
    .where(and(eq(collaborators.tripId, tripId), eq(collaborators.userId, userId)));
  const collaboratorRank = collab ? roleRank[collab.role as keyof typeof roleRank] : undefined;
  if (collaboratorRank === undefined || collaboratorRank < roleRank[minRole]) {
    notFound();
  }
  return collab!.role as CollaboratorRole;
}
