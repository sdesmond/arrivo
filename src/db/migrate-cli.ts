// Container entrypoint step, bundled to /app/migrate.mjs: applies drizzle/ migrations, then encrypts any
// travel-document values left over from before field encryption, before the server starts.
import postgres from "postgres";
import { runMigrations } from "./migrate";
import { encryptLegacyPii } from "./encrypt-pii";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  await runMigrations({ databaseUrl, migrationsFolder: process.env.MIGRATIONS_FOLDER ?? "./drizzle" });

  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await encryptLegacyPii(sql);
  } finally {
    await sql.end();
  }
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error("Database migration failed:", error);
  process.exit(1);
});
