// Container entrypoint step, bundled to /app/migrate.mjs: applies drizzle/ migrations before the server starts.
import { runMigrations } from "./migrate";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  await runMigrations({ databaseUrl, migrationsFolder: process.env.MIGRATIONS_FOLDER ?? "./drizzle" });
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error("Database migration failed:", error);
  process.exit(1);
});
