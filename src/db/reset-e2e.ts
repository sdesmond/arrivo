import "dotenv/config";
import { getRequiredE2EConnectionString, resetE2EDatabase } from "./e2e-reset";

async function main() {
  await resetE2EDatabase({
    connectionString: getRequiredE2EConnectionString({
      E2E_DATABASE_URL: process.env.E2E_DATABASE_URL,
    }),
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
