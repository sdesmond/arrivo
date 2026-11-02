// Reads the dev seed accounts' password for the screenshot script from the environment, so no
// credential is written into the repo. The value is documented in docs/dev-seed-data.md.

export function readSeedPassword(env = process.env) {
  const password = env.SCREENSHOT_SEED_PASSWORD;
  if (!password) {
    throw new Error(
      "Set SCREENSHOT_SEED_PASSWORD to the dev seed accounts' password (see docs/dev-seed-data.md), e.g. " +
        "`SCREENSHOT_SEED_PASSWORD=<password> npm run screenshots`."
    );
  }
  return password;
}
