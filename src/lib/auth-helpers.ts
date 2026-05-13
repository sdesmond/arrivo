import "server-only";
import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@/db";
import { collaborators } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export async function getCurrentUser() {
  const session = await auth();
  return session?.user ?? null;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}

// Every Server Action MUST call this before any write, even if the query layer
// also calls it. Defense-in-depth — actions can be invoked directly via the
// wire format and must not trust caller context.
export async function assertTripAccess(
  tripId: string,
  userId: string,
  minRole: "viewer" | "editor" | "owner" = "viewer"
) {
  const roleRank = { viewer: 0, editor: 1, owner: 2 };
  const [collab] = await db
    .select({ role: collaborators.role })
    .from(collaborators)
    .where(and(eq(collaborators.tripId, tripId), eq(collaborators.userId, userId)));
  if (!collab || roleRank[collab.role as keyof typeof roleRank] < roleRank[minRole]) {
    notFound();
  }
}
