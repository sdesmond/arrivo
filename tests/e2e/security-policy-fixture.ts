import "dotenv/config";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { createConnection } from "node:net";
import { join } from "node:path";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { CredentialAuthorizationPurpose, UserRole, type PasswordPolicy } from "../../src/data/types";
import { appState, users } from "../../src/db/schema";
import {
  issueCredentialAuthorization,
  type CredentialAuthorizationDatabase,
} from "../../src/lib/credential-authorizations";
import { issueAdminRecovery } from "../../src/lib/admin-recovery-issuance";
import { E2E_STORAGE_DIRECTORY } from "../../scripts/e2e-storage.mjs";

// Password-policy scenarios change the singleton `app_state` row, which every other scenario reads. They therefore
// never touch the shared arrivo_e2e database: each scenario owns a migrated sibling database and its own app process,
// and tears both down. Slots keep that safe under parallel workers (one slot per worker) and keep the set of Next dist
// directories fixed, so tsconfig/eslint/prettier/gitignore can name them and Next never rewrites tsconfig.

export const POLICY_APP_SLOTS = 4;
export const POLICY_APP_BASE_PORT = 3110;
const MIGRATIONS_DIRECTORY = "drizzle";
const READY_TIMEOUT_MS = 300_000;
const DATABASE_INFIX = "_policy_";

export function policyAppPort(slot: number): number {
  return POLICY_APP_BASE_PORT + assertSlot(slot);
}

export function policyAppDistDirectory(slot: number): string {
  return `.next-e2e-policy-${assertSlot(slot)}`;
}

export function policyAppStorageDirectory(slot: number): string {
  return join(E2E_STORAGE_DIRECTORY, `policy-${assertSlot(slot)}`);
}

function assertSlot(slot: number): number {
  if (!Number.isInteger(slot) || slot < 0 || slot >= POLICY_APP_SLOTS) {
    throw new Error(
      `Password-policy fixture slot must be 0-${POLICY_APP_SLOTS - 1}; use at most ${POLICY_APP_SLOTS} workers.`
    );
  }
  return slot;
}

/** Sibling database of the regular E2E one, one per slot. Credentials and URL options are left untouched. */
export function policyAppDatabaseUrl(source: string, slot: number): string {
  assertSlot(slot);
  const target = new URL(source);
  const name = target.pathname.slice(1);
  if (!/^[a-zA-Z0-9_][a-zA-Z0-9_-]*$/.test(name) || name.includes(DATABASE_INFIX)) {
    throw new Error("E2E database name must be explicit and must not already be a password-policy database.");
  }
  const derived = `${name}${DATABASE_INFIX}${slot}`;
  if (derived.length > 63) throw new Error("E2E database name is too long for the password-policy suffix.");
  target.pathname = `/${derived}`;
  return target.toString();
}

function databaseName(connectionString: string): string {
  return new URL(connectionString).pathname.slice(1);
}

interface JournalEntry {
  idx: number;
  tag: string;
}

/** Applies the generated migrations in order; `through` stops early to build a pre-upgrade database, `from` resumes. */
export async function applyMigrations(
  client: postgres.Sql,
  { from = 0, through }: { from?: number; through?: number } = {}
): Promise<void> {
  const journal = JSON.parse(readFileSync(join(MIGRATIONS_DIRECTORY, "meta", "_journal.json"), "utf8")) as {
    entries: JournalEntry[];
  };
  for (const entry of journal.entries) {
    if (entry.idx < from) continue;
    if (through !== undefined && entry.idx > through) break;
    const statements = readFileSync(join(MIGRATIONS_DIRECTORY, `${entry.tag}.sql`), "utf8").split(
      "--> statement-breakpoint"
    );
    for (const statement of statements) if (statement.trim()) await client.unsafe(statement);
  }
}

export interface SecurityPolicyUserSeed {
  username: string;
  name: string;
  role: UserRole;
  /** Null makes an account that has not finished setup. */
  password: string | null;
}

export type SecurityPolicyUserMotherName = "admin" | "member" | "pending";

const USER_MOTHERS: Record<SecurityPolicyUserMotherName, SecurityPolicyUserSeed> = {
  admin: { username: "policy-admin", name: "Policy Admin", role: UserRole.Admin, password: "admin-pass-1" },
  member: { username: "policy-member", name: "Policy Member", role: UserRole.Member, password: "member-pass-1" },
  pending: { username: "policy-pending", name: "Policy Pending", role: UserRole.Member, password: null },
};

/** Fresh copy with a unique username, so no scenario shares or mutates another's mother. */
export function cloneSecurityPolicyUserMother(
  name: SecurityPolicyUserMotherName,
  overrides: Partial<SecurityPolicyUserSeed> = {}
): SecurityPolicyUserSeed {
  const seed = USER_MOTHERS[name];
  return { ...seed, username: `${seed.username}-${randomBytes(3).toString("hex")}`, ...overrides };
}

export interface SecurityPolicyUser extends SecurityPolicyUserSeed {
  id: string;
}

export interface SecurityPolicyApp {
  slot: number;
  /** The scenario database's own connection, for raw SQL. */
  client: postgres.Sql;
  /** Undefined when created with `startServer: false`. */
  baseURL: string | undefined;
  databaseName: string;
  database: ReturnType<typeof drizzle>;
  seedUser(seed: SecurityPolicyUserSeed): Promise<SecurityPolicyUser>;
  readPolicy(): Promise<PasswordPolicy>;
  writePolicy(policy: PasswordPolicy): Promise<void>;
  /** A usable link of the given kind, built the way the app builds it. */
  issueLink(
    kind: "setup" | "reset" | "recovery",
    user: SecurityPolicyUser,
    actor?: SecurityPolicyUser
  ): Promise<string>;
  stop(): Promise<void>;
}

export interface SecurityPolicyAppOptions {
  slot: number;
  /** False leaves the app uninitialized with no accounts, as on a first run. Default true. */
  initialized?: boolean;
  /** Skip the Next process; the spec for the fixture itself needs only the database. */
  startServer?: boolean;
  /** Stop after this migration index, to build a database as it was before an upgrade. */
  migrateThrough?: number;
  policy?: PasswordPolicy;
}

function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

function killProcessTree(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  }
}

function removeDirectory(path: string): void {
  try {
    rmSync(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  } catch {
    /* A locked cache directory must not fail the scenario; the next run on this slot clears it first. */
  }
}

async function startApp(slot: number, connectionString: string): Promise<{ baseURL: string; stop: () => void }> {
  const port = policyAppPort(slot);
  if (await portInUse(port)) {
    throw new Error(`Port ${port} is already in use; stop the leftover password-policy app server and retry.`);
  }
  const baseURL = `http://localhost:${port}`;
  const distDirectory = policyAppDistDirectory(slot);
  const storageDirectory = policyAppStorageDirectory(slot);
  removeDirectory(distDirectory);
  removeDirectory(storageDirectory);
  mkdirSync(storageDirectory, { recursive: true });

  const nextBinary = join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextBinary, "dev", "-p", String(port)], {
    cwd: process.cwd(),
    detached: process.platform !== "win32",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      DATABASE_URL: connectionString,
      NEXTAUTH_URL: baseURL,
      NEXT_DISTDIR: distDirectory,
      ACTIVITY_MAINTENANCE_INTERVAL_HOURS: "0",
      E2E_MODE: "true",
      E2E_MAPBOX_STUB: "true",
      E2E_UNSPLASH_STUB: "true",
      STORAGE_PROVIDER: "local",
      STORAGE_LOCAL_ROOT_DIR: storageDirectory,
      PORT: String(port),
    },
  });
  let output = "";
  const remember = (chunk: Buffer) => {
    output = (output + chunk.toString()).slice(-4000);
  };
  child.stdout?.on("data", remember);
  child.stderr?.on("data", remember);
  let exited = false;
  child.once("exit", () => {
    exited = true;
  });

  const stop = () => {
    killProcessTree(child);
    removeDirectory(distDirectory);
    removeDirectory(storageDirectory);
  };

  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (exited) {
      stop();
      throw new Error(`Password-policy app server exited before it was ready.\n${output}`);
    }
    try {
      const response = await fetch(`${baseURL}/sign-in`, { redirect: "manual" });
      if (response.status < 500) return { baseURL, stop };
    } catch {
      /* Not listening yet. */
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  stop();
  throw new Error(`Password-policy app server was not ready within ${READY_TIMEOUT_MS / 1000}s.\n${output}`);
}

export async function createSecurityPolicyApp(options: SecurityPolicyAppOptions): Promise<SecurityPolicyApp> {
  const { slot, initialized = true, startServer = true, migrateThrough, policy } = options;
  const source = process.env.E2E_DATABASE_URL;
  if (!source) throw new Error("E2E_DATABASE_URL is required.");
  const connectionString = policyAppDatabaseUrl(source, slot);
  const name = databaseName(connectionString);

  // Catalog work goes through the regular E2E connection; the scenario database is dropped first so a crashed
  // earlier run on this slot can never leak state into this one.
  const admin = postgres(source, { max: 1, onnotice: () => undefined });
  try {
    await admin.unsafe(`drop database if exists "${name}" with (force)`);
    await admin.unsafe(`create database "${name}"`);
  } finally {
    await admin.end();
  }

  const client = postgres(connectionString, { max: 4, onnotice: () => undefined });
  const database = drizzle(client);
  let stopServer: (() => void) | undefined;
  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    stopServer?.();
    await client.end({ timeout: 5 }).catch(() => undefined);
    const cleanup = postgres(source, { max: 1, onnotice: () => undefined });
    try {
      await cleanup.unsafe(`drop database if exists "${name}" with (force)`);
    } finally {
      await cleanup.end();
    }
  };

  try {
    await applyMigrations(client, { through: migrateThrough });
    if (migrateThrough === undefined) {
      if (initialized) await client`update app_state set initialized_at = now() where id = true`;
      if (policy) {
        await database
          .update(appState)
          .set({
            passwordMinLength: policy.minLength,
            passwordMaxLength: policy.maxLength,
            passwordMinUppercase: policy.minUppercase,
            passwordMinNumbers: policy.minNumbers,
            passwordMinSpecial: policy.minSpecial,
          })
          .where(sql`${appState.id} = true`);
      }
    }
    let baseURL: string | undefined;
    if (startServer) {
      const started = await startApp(slot, connectionString);
      baseURL = started.baseURL;
      stopServer = started.stop;
    }

    const app: SecurityPolicyApp = {
      slot,
      client,
      baseURL,
      databaseName: name,
      database,
      async seedUser(seed) {
        const passwordHash = seed.password === null ? null : await bcrypt.hash(seed.password, 4);
        const [created] = await database
          .insert(users)
          .values({
            username: seed.username,
            name: seed.name,
            role: seed.role,
            passwordHash,
            dateFormat: "MM/DD/YYYY",
            currency: "USD",
          })
          .returning({ id: users.id });
        return { ...seed, id: created.id };
      },
      async readPolicy() {
        const [row] = await client`select
          password_min_length as "minLength", password_max_length as "maxLength",
          password_min_uppercase as "minUppercase",
          password_min_numbers as "minNumbers",
          password_min_special as "minSpecial"
          from app_state where id = true`;
        return row as unknown as PasswordPolicy;
      },
      async writePolicy(next) {
        await client`update app_state set
          password_min_length = ${next.minLength}, password_max_length = ${next.maxLength},
          password_min_uppercase = ${next.minUppercase},
          password_min_numbers = ${next.minNumbers},
          password_min_special = ${next.minSpecial}
          where id = true`;
      },
      async issueLink(kind, user, actor) {
        if (!baseURL) throw new Error("Links need a running app.");
        const asDatabase = database as unknown as CredentialAuthorizationDatabase;
        if (kind === "recovery") {
          const outcome = await issueAdminRecovery(
            asDatabase,
            { kind: "trusted-operator" },
            { username: user.username, origin: baseURL }
          );
          if (!outcome.ok) throw new Error(`Recovery issuance failed: ${outcome.reason}`);
          return outcome.url;
        }
        if (!actor) throw new Error("Setup and reset links are issued by an admin.");
        const issued = await issueCredentialAuthorization(
          asDatabase,
          { kind: "admin", actorUserId: actor.id },
          {
            userId: user.id,
            purpose: kind === "setup" ? CredentialAuthorizationPurpose.Setup : CredentialAuthorizationPurpose.Reset,
          }
        );
        if (!issued.ok) throw new Error(`${kind} link issuance failed: ${issued.reason}`);
        return `${baseURL}/account-${kind === "setup" ? "setup" : "reset"}/open?token=${issued.token}`;
      },
      stop,
    };
    return app;
  } catch (error) {
    await stop();
    throw error;
  }
}
