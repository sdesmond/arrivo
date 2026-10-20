import postgres from "postgres";

export const E2E_RESET_STATEMENTS = [
  // Migration journal lives outside public; leaving it makes `migrate` skip the baseline on an empty DB.
  "DROP SCHEMA IF EXISTS drizzle CASCADE",
  "DROP SCHEMA IF EXISTS public CASCADE",
  "CREATE SCHEMA public",
  "GRANT ALL ON SCHEMA public TO CURRENT_USER",
  "GRANT ALL ON SCHEMA public TO PUBLIC",
  "CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public",
] as const;

export interface ResetE2EDatabaseOptions {
  connectionString: string;
}

export interface E2EResetEnv {
  E2E_DATABASE_URL?: string;
}

export function getRequiredE2EConnectionString(env: E2EResetEnv): string {
  const connectionString = env.E2E_DATABASE_URL;

  if (!connectionString) {
    throw new Error("E2E_DATABASE_URL is required to reset the E2E database.");
  }

  return connectionString;
}

export async function resetE2EDatabase({ connectionString }: ResetE2EDatabaseOptions): Promise<void> {
  const client = postgres(connectionString, { max: 1 });

  try {
    for (const statement of E2E_RESET_STATEMENTS) {
      await client.unsafe(statement);
    }
  } finally {
    await client.end();
  }
}
