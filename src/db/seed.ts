import "dotenv/config";
import { db } from "./index";
import { users, trips, days, events, collaborators, documents } from "./schema";
import bcrypt from "bcryptjs";
import { ALL_TRIPS } from "./seed-data/trips";
import { TOKYO_DAYS } from "./seed-data/tokyo";
import { LISBON_DAYS } from "./seed-data/lisbon";
import type { SeedDayItinerary as DayItinerary } from "./seed-data/seed-types";

const DEMO_EMAIL = "demo@packt.local";
const DEMO_PASSWORD = "demo1234";

function toStartAt(dateStr: string | undefined, timeStr: string | undefined): string | null {
  if (!dateStr || !timeStr) return null;
  return `${dateStr}T${timeStr}:00.000Z`;
}

const TRIP_DAYS: Record<string, DayItinerary[]> = {
  "tokyo-2026": TOKYO_DAYS,
  "lisbon-2026": LISBON_DAYS,
};

async function main() {
  console.log("Seeding...");

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const [user] = await db
    .insert(users)
    .values({ email: DEMO_EMAIL, name: "Demo User", passwordHash })
    .onConflictDoNothing({ target: users.email })
    .returning();

  if (!user) {
    console.log("Demo user already exists, skipping seed.");
    process.exit(0);
  }

  for (const trip of ALL_TRIPS) {
    const [dbTrip] = await db
      .insert(trips)
      .values({
        ownerId: user.id,
        name: trip.name,
        startDate: trip.startDate,
        endDate: trip.endDate,
      })
      .onConflictDoNothing()
      .returning();

    if (!dbTrip) continue;

    await db
      .insert(collaborators)
      .values({
        tripId: dbTrip.id,
        userId: user.id,
        email: DEMO_EMAIL,
        name: "Demo User",
        initials: "DU",
        role: "owner",
      })
      .onConflictDoNothing();

    const tripDays = TRIP_DAYS[trip.id];
    if (!tripDays) continue;

    for (const day of tripDays) {
      const [dbDay] = await db
        .insert(days)
        .values({
          tripId: dbTrip.id,
          dayNumber: day.dayNumber,
          date: day.date,
          label: day.label,
          subtitle: day.subtitle,
          weather: day.weather,
          travelSummary: day.travelSummary,
        })
        .onConflictDoNothing()
        .returning();

      if (!dbDay) continue;

      for (let pos = 0; pos < day.events.length; pos++) {
        const ev = day.events[pos];
        const [dbEvent] = await db
          .insert(events)
          .values({
            dayId: dbDay.id,
            tripId: dbTrip.id,
            name: ev.name,
            note: ev.note,
            startAt: toStartAt(day.date, ev.time) ? new Date(toStartAt(day.date, ev.time)!) : null,
            endAt: toStartAt(day.date, ev.endTime) ? new Date(toStartAt(day.date, ev.endTime)!) : null,
            locationName: ev.location?.name,
            locationAddress: ev.location?.address,
            locationLat: ev.location?.geo?.lat,
            locationLng: ev.location?.geo?.lng,
            confirmationNumber: ev.confirmationNumber,
            position: pos,
          })
          .onConflictDoNothing()
          .returning();

        if (!dbEvent || !ev.docs) continue;

        for (const doc of ev.docs) {
          await db
            .insert(documents)
            .values({
              tripId: dbTrip.id,
              eventId: dbEvent.id,
              name: doc.name,
              kind: doc.kind,
              size: doc.size,
              url: doc.url,
              previewLines: doc.previewLines ?? null,
            })
            .onConflictDoNothing();
        }
      }
    }
  }

  console.log("Done. Demo user: demo@packt.local / demo1234");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
