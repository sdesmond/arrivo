import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

export type E2EDb = ReturnType<typeof drizzle>;

export async function withE2EDb<T>(fn: (db: E2EDb) => Promise<T>): Promise<T> {
  const client = postgres(process.env.E2E_DATABASE_URL!);
  const db = drizzle(client);

  try {
    return await fn(db);
  } finally {
    await client.end();
  }
}
