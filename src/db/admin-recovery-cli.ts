import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { issueAdminRecovery } from "@/lib/admin-recovery-issuance";
import type { CredentialAuthorizationDatabase } from "@/lib/credential-authorizations";
import * as schema from "./schema";

export const ADMIN_RECOVERY_USAGE = "Usage: node admin-recovery.mjs <username> <base-url>  (DATABASE_URL must be set)";

export interface AdminRecoveryCliConnection {
  database: CredentialAuthorizationDatabase;
  close: () => Promise<void>;
}
export interface AdminRecoveryCliOptions {
  argv: string[];
  env: Record<string, string | undefined>;
  stdout: (line: string) => void;
  stderr: (line: string) => void;
  /** Test seam; the default owns exactly one postgres connection. */
  connect?: (databaseUrl: string) => AdminRecoveryCliConnection;
}

const FAILURES = {
  "invalid-username": "That is not a valid username.",
  "invalid-origin": "The base URL must be the address people open Arrivo at, such as https://arrivo.example.com.",
  forbidden: "Recovery was refused.",
  "changed-state": "No completed admin account matches that username.",
  "app-unavailable": "Arrivo is not set up yet, so there is nothing to recover.",
  retry: "Another change was in progress. Run the command again.",
} as const;

function connectOwnConnection(databaseUrl: string): AdminRecoveryCliConnection {
  const client = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  return { database: drizzle(client, { schema }), close: () => client.end() };
}

/**
 * Operator adapter for `issueAdminRecovery`: needs only DATABASE_URL, issues a one-hour recovery link without
 * changing any credential, and always closes its connection. Returns the process exit code.
 */
export async function runAdminRecoveryCli({
  argv,
  env,
  stdout,
  stderr,
  connect = connectOwnConnection,
}: AdminRecoveryCliOptions): Promise<number> {
  const [username, origin, ...extra] = argv;
  if (!env.DATABASE_URL || !username || !origin || extra.length > 0) {
    stderr(ADMIN_RECOVERY_USAGE);
    return 1;
  }

  const connection = connect(env.DATABASE_URL);
  try {
    const outcome = await issueAdminRecovery(connection.database, { kind: "trusted-operator" }, { username, origin });
    if (!outcome.ok) {
      stderr(FAILURES[outcome.reason]);
      return 1;
    }
    stdout(`Recovery link for ${outcome.username} (valid until ${outcome.expiresAt}, replaces any earlier link):`);
    stdout(outcome.url);
    stdout("Nothing about the account changes until its admin opens the link and finishes recovery.");
    return 0;
  } finally {
    await connection.close();
  }
}
