import "dotenv/config";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { users } from "../../src/db/schema";
import { BASELINE_E2E_USER } from "./e2e-seed-data";

export default async function globalSetup() {
  const client = postgres(process.env.E2E_DATABASE_URL!);
  const db = drizzle(client);

  await db.execute(sql`
    TRUNCATE users, accounts, sessions, verification_tokens,
             trips, days, events, documents, collaborators, packing_items, packing_templates, packing_template_items,
             itinerary_checklists, checklist_items, itinerary_notes, user_loyalty_numbers, user_companions
    CASCADE
  `);

  const passwordHash = await bcrypt.hash(process.env.E2E_PASSWORD!, 10);
  await db.insert(users).values({
    email: BASELINE_E2E_USER.email,
    name: BASELINE_E2E_USER.name,
    passwordHash,
    dateFormat: "MM/DD/YYYY",
  });

  await client.end();
}
