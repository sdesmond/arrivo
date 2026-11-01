import postgres from "postgres";

export const BOOTSTRAP_E2E_PORT = 3002;
const DATABASE_SUFFIX = "_bootstrap";
const CREATE_GUIDANCE = "Create the derived E2E bootstrap database or grant CREATEDB to the E2E role, then rerun.";

/** Derive an isolated sibling database without altering connection credentials or URL options. */
export function deriveBootstrapConnectionString(source) {
  let target;
  try {
    target = new URL(source);
  } catch {
    throw new Error("E2E database URL must be a valid PostgreSQL URL.");
  }
  const name = target.pathname.slice(1);
  if (
    !["postgres:", "postgresql:"].includes(target.protocol) ||
    !/^[a-zA-Z0-9_][a-zA-Z0-9_-]*$/.test(name) ||
    name.endsWith(DATABASE_SUFFIX) ||
    name.length + DATABASE_SUFFIX.length > 63
  ) {
    throw new Error("E2E database name must be explicit, safe and short enough for the bootstrap suffix.");
  }
  target.pathname = "/" + name + DATABASE_SUFFIX;
  return target.toString();
}

export function selectWorkerDatabase(source, bootstrap) {
  return bootstrap ? deriveBootstrapConnectionString(source) : source;
}

/** Only creates the derived DB; the source connection is used exclusively for catalog reads. */
export async function ensureBootstrapDatabase(source, connect = postgres) {
  const derived = new URL(deriveBootstrapConnectionString(source));
  const databaseName = derived.pathname.slice(1);
  let client;
  try {
    client = connect(source, { max: 1 });
    const existing = await client.unsafe("SELECT 1 AS exists FROM pg_database WHERE datname = $1", [databaseName]);
    if (existing.length) return;
    const [role] = await client.unsafe(
      'SELECT rolcreatedb OR rolsuper AS "canCreate" FROM pg_roles WHERE rolname = current_user'
    );
    if (!role?.canCreate) throw new Error(CREATE_GUIDANCE);
    try {
      await client.unsafe('CREATE DATABASE "' + databaseName + '"');
    } catch (error) {
      // Another runner may have created exactly this derived database after our catalog read.
      if (error.code !== "42P04") throw error;
    }
  } catch (error) {
    throw new Error(
      error.message === CREATE_GUIDANCE ? CREATE_GUIDANCE : "Could not prepare the E2E bootstrap database."
    );
  } finally {
    if (client) {
      try {
        await client.end();
      } catch {
        /* Preserve sanitized errors, never connection details. */
      }
    }
  }
}
