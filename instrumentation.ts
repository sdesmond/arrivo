import { MISSING_KEY_MESSAGE, isFieldEncryptionConfigured } from "@/lib/field-encryption";

// Runs once when the server starts. A missing data encryption key otherwise only shows up later, as a failed
// passport save or two-factor setup. The Docker image always sets one (docker/entrypoint.sh), so in production
// this only stops a misconfigured build-from-source install; in development it just says how to fix .env.
export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || isFieldEncryptionConfigured()) return;
  if (process.env.NODE_ENV === "production") throw new Error(MISSING_KEY_MESSAGE);
  console.error(`\n[arrivo] ${MISSING_KEY_MESSAGE} Add it to .env, then restart the dev server.\n`);
}
