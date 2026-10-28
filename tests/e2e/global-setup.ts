import "dotenv/config";
import { deriveBootstrapConnectionString } from "../../scripts/e2e-bootstrap.mjs";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { instanceState, users } from "../../src/db/schema";
import { UserRole } from "../../src/data/types";
import { BASELINE_E2E_USER } from "./e2e-seed-data";
import { resetE2EStorage } from "../../scripts/e2e-storage.mjs";

export default async function globalSetup() {
  resetE2EStorage(process.cwd());
  resetE2EStorage(process.cwd(), true);

  const source = process.env.E2E_DATABASE_URL!;
  for (const connectionString of [source, deriveBootstrapConnectionString(source)]) {
    const client = postgres(connectionString);
    try {
      const db = drizzle(client);

      await db.execute(sql`
    TRUNCATE users, accounts, sessions, verification_tokens,
             trips, days, events, documents, collaborators, packing_items, packing_templates, packing_template_items,
             itinerary_checklists, checklist_items, itinerary_notes, user_loyalty_numbers, user_companions,
             auth_throttle, mfa_recovery_codes, trusted_devices, instance_state
    CASCADE
  `);

      const passwordHash = await bcrypt.hash(process.env.E2E_PASSWORD!, 10);
      await db.insert(users).values({
        username: BASELINE_E2E_USER.username,
        name: BASELINE_E2E_USER.name,
        passwordHash,
        dateFormat: "MM/DD/YYYY",
        currency: "USD",
        role: UserRole.Admin,
      });
      await db.insert(instanceState).values({ id: true, initializedAt: new Date() });
    } finally {
      await client.end();
    }
  }
}
