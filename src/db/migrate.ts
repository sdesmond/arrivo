import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

// Arbitrary app-wide key for pg_advisory_lock. Drizzle's migrator takes no lock of its own, so two app
// containers starting at once would otherwise both try to apply the same migration.
export const MIGRATION_LOCK_KEY = 7_302_026;

const RETRY_DELAY_MS = 2_000;

export interface RunMigrationsOptions {
  databaseUrl: string;
  migrationsFolder: string;
  // ~60s at RETRY_DELAY_MS: the database may still be starting when the container boots.
  maxAttempts?: number;
  connect?: (databaseUrl: string) => postgres.Sql;
  applyMigrations?: (sql: postgres.Sql, migrationsFolder: string) => Promise<void>;
  sleep?: (milliseconds: number) => Promise<void>;
  log?: (message: string) => void;
}

// One connection, so the advisory lock and the migrations share a session.
const connectOnce = (databaseUrl: string) => postgres(databaseUrl, { max: 1, onnotice: () => {} });

// Same journal table as `drizzle-kit migrate` (drizzle.__drizzle_migrations), so either can follow the other.
const applyDrizzleMigrations = (sql: postgres.Sql, migrationsFolder: string) =>
  migrate(drizzle(sql), { migrationsFolder });

const wait = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export async function runMigrations({
  databaseUrl,
  migrationsFolder,
  maxAttempts = 30,
  connect = connectOnce,
  applyMigrations = applyDrizzleMigrations,
  sleep = wait,
  log = console.log,
}: RunMigrationsOptions): Promise<void> {
  const sql = connect(databaseUrl);
  try {
    for (let attempt = 1; ; attempt++) {
      try {
        await sql`select 1`;
        break;
      } catch (error) {
        if (attempt >= maxAttempts) throw error;
        log(`Waiting for the database (attempt ${attempt} of ${maxAttempts})...`);
        await sleep(RETRY_DELAY_MS);
      }
    }

    await sql`select pg_advisory_lock(${MIGRATION_LOCK_KEY})`;
    try {
      await applyMigrations(sql, migrationsFolder);
      log("Database migrations are up to date.");
    } finally {
      await sql`select pg_advisory_unlock(${MIGRATION_LOCK_KEY})`;
    }
  } finally {
    await sql.end();
  }
}
