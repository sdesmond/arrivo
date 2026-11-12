import { and, eq, or } from "drizzle-orm";
import { documents, events, reservations } from "../../src/db/schema";
import { withE2EDb } from "./e2e-db";

/** Legacy attached documents derive their trip from their event or reservation. */
export async function findScenarioDocument(tripId: string, name: string) {
  const [document] = await withE2EDb((database) =>
    database
      .select({ id: documents.id })
      .from(documents)
      .leftJoin(events, eq(documents.eventId, events.id))
      .leftJoin(reservations, eq(documents.reservationId, reservations.id))
      .where(
        and(
          eq(documents.name, name),
          or(eq(documents.tripId, tripId), eq(events.tripId, tripId), eq(reservations.tripId, tripId))
        )
      )
  );
  return document;
}
