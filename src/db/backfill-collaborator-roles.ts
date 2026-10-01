import "dotenv/config";
import { pathToFileURL } from "node:url";
import { eq } from "drizzle-orm";
import { db } from "./index";
import { collaborators, trips } from "./schema";

export interface BackfillResult {
  migratedTripCount: number;
}

interface TripOwnerCount {
  tripId: string;
  ownerCount: number;
}

// Migrates every collaborator row with the legacy `role="owner"` value to
// `role="manager", isCreator=true`. Refuses to write anything if any trip
// does not have exactly one `owner` row — that invariant must hold before
// this one-off script may run. See:
// _bmad-output/implementation-artifacts/spec-1-1-migrate-collaborator-roles-to-viewer-editor-manager.md
export async function backfillCollaboratorRoles(): Promise<BackfillResult> {
  return db.transaction(async (transaction) => {
    const tripRows = await transaction.select({ tripId: trips.id }).from(trips);
    const collaboratorRows = await transaction
      .select({ tripId: collaborators.tripId, role: collaborators.role })
      .from(collaborators);

    const ownerCountByTripId = new Map<string, number>();
    for (const row of collaboratorRows) {
      if (row.role === "owner") {
        ownerCountByTripId.set(row.tripId, (ownerCountByTripId.get(row.tripId) ?? 0) + 1);
      }
    }

    const violations: TripOwnerCount[] = tripRows
      .map(({ tripId }) => ({ tripId, ownerCount: ownerCountByTripId.get(tripId) ?? 0 }))
      .filter((entry) => entry.ownerCount !== 1);

    if (violations.length > 0) {
      const details = violations
        .map((entry) => `trip ${entry.tripId}: ${entry.ownerCount} owner row${entry.ownerCount === 1 ? "" : "s"}`)
        .join("; ");
      throw new Error(
        `Aborting collaborator role backfill — every trip must have exactly one "owner" row before migrating. Violations: ${details}`
      );
    }

    await transaction
      .update(collaborators)
      .set({ role: "manager", isCreator: true })
      .where(eq(collaborators.role, "owner"));

    return { migratedTripCount: tripRows.length };
  });
}

async function main() {
  const result = await backfillCollaboratorRoles();
  console.log(
    `Backfill complete: migrated ${result.migratedTripCount} trip(s) from role="owner" to role="manager", isCreator=true.`
  );
}

const isDirectRun = process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isDirectRun) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
