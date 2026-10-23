// Bundled to /app/mfa-reset.mjs: `docker exec arrivo node /app/mfa-reset.mjs jane`.
import postgres from "postgres";
import { resetMfa } from "./mfa-reset";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const username = process.argv[2];
  if (!databaseUrl || !username) {
    console.error("Usage: node mfa-reset.mjs <username>  (DATABASE_URL must be set)");
    process.exit(1);
  }

  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    if (await resetMfa(sql, username)) {
      console.log(`Two-factor authentication is off for ${username}; they can sign in with their password.`);
    } else {
      console.error(`No account found for ${username}.`);
      process.exitCode = 1;
    }
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  console.error("Two-factor reset failed:", error);
  process.exit(1);
});
