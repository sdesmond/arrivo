import { randomBytes } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ENV_ORDER = [
  "DATABASE_URL",
  "E2E_DATABASE_URL",
  "NEXTAUTH_URL",
  "NEXTAUTH_SECRET",
  "ALLOW_SIGNUP",
  "E2E_EMAIL",
  "E2E_PASSWORD",
  "HIDE_OVERLAY",
  "STORAGE_PROVIDER",
  "STORAGE_LOCAL_ROOT_DIR",
];

const DEFAULT_ENV_VALUES = {
  NEXTAUTH_URL: "http://localhost:3000",
  ALLOW_SIGNUP: "true",
  E2E_EMAIL: "e2e@arrivo.com",
  E2E_PASSWORD: "e2e1234",
  HIDE_OVERLAY: "true",
  STORAGE_PROVIDER: "local",
  STORAGE_LOCAL_ROOT_DIR: "./.dev-storage",
};

// A host Postgres usually owns 5432, so the dev container publishes 5433 to keep the two databases apart.
const DATABASE_URLS = {
  local: {
    app: "postgres://arrivo:arrivo@localhost:5432/arrivo",
    e2e: "postgres://arrivo:arrivo@localhost:5432/arrivo_e2e",
  },
  docker: {
    app: "postgres://arrivo:arrivo@localhost:5433/arrivo",
    e2e: "postgres://arrivo:arrivo@localhost:5433/arrivo_e2e",
  },
};

function log(message) {
  console.log(`[setup-dev] ${message}`);
}

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  let db = "auto";

  for (const arg of argv) {
    if (arg.startsWith("--db=")) {
      db = arg.slice("--db=".length);
      continue;
    }

    if (arg === "--db") {
      fail("Expected a value after --db. Use --db=docker, --db=local, or --db=auto.");
    }
  }

  if (!["auto", "docker", "local"].includes(db)) {
    fail(`Unsupported database mode "${db}". Use docker, local, or auto.`);
  }

  return { db };
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    encoding: "utf8",
    shell: false,
    stdio: options.captureOutput ? "pipe" : "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const details = options.captureOutput ? [result.stdout, result.stderr].filter(Boolean).join("\n").trim() : "";
    throw new Error(`Command failed: ${command} ${args.join(" ")}${details ? `\n${details}` : ""}`);
  }

  return {
    stdout: result.stdout?.trim() ?? "",
    stderr: result.stderr?.trim() ?? "",
  };
}

function commandExists(command, args = ["--version"]) {
  try {
    runCommand(command, args, { captureOutput: true });
    return true;
  } catch {
    return false;
  }
}

function dockerComposeAvailable() {
  if (!commandExists("docker", ["compose", "version"])) {
    return false;
  }

  try {
    runCommand("docker", ["info"], { captureOutput: true });
    return true;
  } catch {
    return false;
  }
}

function localPostgresAvailable() {
  if (!commandExists("psql")) {
    return false;
  }

  try {
    runCommand("psql", ["-d", "postgres", "-tAc", "SELECT 1"], { captureOutput: true });
    return true;
  } catch {
    return false;
  }
}

function runPackageCommand(command, args, options = {}) {
  if (process.platform === "win32") {
    runCommand("cmd.exe", ["/d", "/s", "/c", `${command} ${args.join(" ")}`], options);
    return;
  }

  runCommand(command, args, options);
}

function resolveDatabaseMode(requestedMode) {
  if (requestedMode === "docker") {
    return requestedMode;
  }

  if (requestedMode === "local") {
    if (!localPostgresAvailable()) {
      fail(
        "Local PostgreSQL is not reachable with the current psql settings. Start PostgreSQL and set PGUSER/PGPASSWORD if needed, or rerun with --db=docker."
      );
    }
    return "local";
  }

  if (dockerComposeAvailable()) {
    return "docker";
  }

  if (localPostgresAvailable()) {
    return "local";
  }

  fail(
    "Neither a reachable Docker daemon nor a reachable local PostgreSQL admin connection is available. Start Docker Desktop, or start PostgreSQL and set PGUSER/PGPASSWORD if needed."
  );
}

function parseEnv(content) {
  const values = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = rawLine.indexOf("=");
    if (separatorIndex < 0) continue;

    const key = rawLine.slice(0, separatorIndex).trim();
    const rawValue = rawLine.slice(separatorIndex + 1);
    values[key] = stripWrappingQuotes(rawValue.trim());
  }

  return values;
}

function stripWrappingQuotes(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  return value;
}

function quoteEnvValue(value) {
  if (value === "") return "";
  if (/^[A-Za-z0-9_./:@+-]+$/.test(value)) return value;
  return JSON.stringify(value);
}

function needsGeneratedSecret(value) {
  if (!value) return true;
  return value === "change-me-32-bytes-min";
}

function createEnvValues(existingValues, databaseMode) {
  const nextValues = { ...existingValues };

  delete nextValues.UPLOAD_STUB;
  delete nextValues.BLOB_READ_WRITE_TOKEN;

  nextValues.DATABASE_URL = DATABASE_URLS[databaseMode].app;
  nextValues.E2E_DATABASE_URL = DATABASE_URLS[databaseMode].e2e;

  for (const [key, value] of Object.entries(DEFAULT_ENV_VALUES)) {
    if (!nextValues[key]) {
      nextValues[key] = value;
    }
  }

  if (needsGeneratedSecret(nextValues.NEXTAUTH_SECRET)) {
    nextValues.NEXTAUTH_SECRET = randomBytes(32).toString("base64");
  }

  return nextValues;
}

function serializeEnv(values) {
  const orderedKeys = [
    ...ENV_ORDER.filter((key) => key in values),
    ...Object.keys(values)
      .filter((key) => !ENV_ORDER.includes(key))
      .sort(),
  ];

  return `${orderedKeys.map((key) => `${key}=${quoteEnvValue(values[key] ?? "")}`).join("\n")}\n`;
}

function ensureEnvFile(rootDir, databaseMode) {
  const examplePath = join(rootDir, ".env.example");
  const envPath = join(rootDir, ".env");
  const exampleValues = parseEnv(readFileSync(examplePath, "utf8"));
  const currentValues = existsSync(envPath) ? parseEnv(readFileSync(envPath, "utf8")) : {};
  const mergedValues = createEnvValues({ ...exampleValues, ...currentValues }, databaseMode);

  writeFileSync(envPath, serializeEnv(mergedValues), "utf8");
  return mergedValues;
}

function ensureDirectory(path) {
  mkdirSync(path, { recursive: true });
}

function moveDirectoryEntries(sourceDir, targetDir, rootDir) {
  ensureDirectory(targetDir);

  for (const entryName of readdirSync(sourceDir)) {
    const sourceEntryPath = join(sourceDir, entryName);
    const targetEntryPath = join(targetDir, entryName);

    if (existsSync(targetEntryPath)) {
      fail(`Refusing to overwrite existing migrated AI workspace path: ${relative(rootDir, targetEntryPath)}`);
    }

    renameSync(sourceEntryPath, targetEntryPath);
  }
}

function ensureDirectoryLink(rootDir, linkPath, targetPath, options = {}) {
  const { migrateExistingDirectory = false } = options;

  ensureDirectory(targetPath);
  ensureDirectory(dirname(linkPath));

  // lstat, not existsSync: existsSync follows links, so a dangling link (repo moved or renamed) looks absent.
  const stats = lstatSync(linkPath, { throwIfNoEntry: false });

  if (stats) {
    if (stats.isSymbolicLink()) {
      rmSync(linkPath, { recursive: true, force: true });
    } else if (migrateExistingDirectory) {
      moveDirectoryEntries(linkPath, targetPath, rootDir);
      rmSync(linkPath, { recursive: true, force: true });
    } else {
      fail(`Refusing to replace existing path: ${relative(rootDir, linkPath)}`);
    }
  }

  const symlinkTarget = process.platform === "win32" ? targetPath : relative(dirname(linkPath), targetPath);
  symlinkSync(symlinkTarget, linkPath, process.platform === "win32" ? "junction" : "dir");
}

export function ensureAiToolLinks(rootDir) {
  const agentsDir = join(rootDir, ".agents");
  const agentsSkillsDir = join(agentsDir, "skills");
  const agentsAgentsDir = join(agentsDir, "agents");
  const agentsMemoriesDir = join(agentsDir, "memories");
  const claudeDir = join(rootDir, ".claude");
  const mappings = [
    { linkPath: join(claudeDir, "skills"), targetPath: agentsSkillsDir },
    { linkPath: join(claudeDir, "agents"), targetPath: agentsAgentsDir },
    {
      linkPath: join(claudeDir, "memory"),
      targetPath: agentsMemoriesDir,
      migrateExistingDirectory: true,
    },
  ];

  ensureDirectory(agentsSkillsDir);
  ensureDirectory(agentsAgentsDir);
  ensureDirectory(agentsMemoriesDir);
  ensureDirectory(claudeDir);

  for (const mapping of mappings) {
    ensureDirectoryLink(rootDir, mapping.linkPath, mapping.targetPath, {
      migrateExistingDirectory: mapping.migrateExistingDirectory,
    });
  }
}

function ensureLocalPostgresDatabases() {
  if (!commandExists("psql")) {
    fail("psql is required for local PostgreSQL setup.");
  }

  const roleExists =
    runCommand("psql", ["-d", "postgres", "-tAc", "SELECT 1 FROM pg_roles WHERE rolname='arrivo'"], {
      captureOutput: true,
    }).stdout === "1";

  if (!roleExists) {
    log("Creating local PostgreSQL role arrivo");
    runCommand("psql", ["-d", "postgres", "-c", "CREATE ROLE arrivo LOGIN PASSWORD 'arrivo'"]);
  }

  for (const databaseName of ["arrivo", "arrivo_e2e"]) {
    const dbExists =
      runCommand("psql", ["-d", "postgres", "-tAc", `SELECT 1 FROM pg_database WHERE datname='${databaseName}'`], {
        captureOutput: true,
      }).stdout === "1";

    if (!dbExists) {
      log(`Creating local PostgreSQL database ${databaseName}`);
      runCommand("psql", ["-d", "postgres", "-c", `CREATE DATABASE ${databaseName} OWNER arrivo`]);
    }
  }
}

// Dev uses its own compose file: docker-compose.yml is the self-hosting stack (bind mounts, no
// published DB port), while dev needs 5433 on the host and a named volume that works on Docker Desktop.
export const DEV_COMPOSE_ARGS = ["compose", "-f", "docker-compose.dev.yml"];

// docker-compose.dev.yml only provisions POSTGRES_DB=arrivo, so the E2E database is created on demand.
export function buildDockerE2eDatabaseArgs() {
  const psql = [...DEV_COMPOSE_ARGS, "exec", "-T", "db", "psql", "-U", "arrivo", "-d", "postgres"];
  return {
    check: [...psql, "-tAc", "SELECT 1 FROM pg_database WHERE datname='arrivo_e2e'"],
    create: [...psql, "-c", "CREATE DATABASE arrivo_e2e OWNER arrivo"],
  };
}

function ensureDockerE2eDatabase(rootDir) {
  const { check, create } = buildDockerE2eDatabaseArgs();

  if (runCommand("docker", check, { cwd: rootDir, captureOutput: true }).stdout !== "1") {
    log("Creating Docker PostgreSQL database arrivo_e2e");
    runCommand("docker", create, { cwd: rootDir });
  }
}

function ensureDockerDatabase(rootDir) {
  if (!commandExists("docker", ["compose", "version"])) {
    fail("Docker Compose is required for Docker database setup.");
  }

  runCommand("docker", [...DEV_COMPOSE_ARGS, "up", "-d", "db"], { cwd: rootDir });

  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      runCommand("docker", [...DEV_COMPOSE_ARGS, "exec", "-T", "db", "pg_isready", "-U", "arrivo"], {
        cwd: rootDir,
      });
      ready = true;
      break;
    } catch {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
    }
  }

  if (!ready) {
    fail("Docker database did not become ready in time.");
  }

  ensureDockerE2eDatabase(rootDir);
}

function installDependencies(rootDir) {
  runPackageCommand("npm", ["install"], { cwd: rootDir });
}

function installPlaywrightBrowser(rootDir) {
  runPackageCommand("npx", ["playwright", "install", "chromium"], { cwd: rootDir });
}

function applyDatabaseSetup(rootDir, envValues) {
  const env = {
    DATABASE_URL: envValues.DATABASE_URL,
    E2E_DATABASE_URL: envValues.E2E_DATABASE_URL,
    NEXTAUTH_URL: envValues.NEXTAUTH_URL,
    NEXTAUTH_SECRET: envValues.NEXTAUTH_SECRET,
    ALLOW_SIGNUP: envValues.ALLOW_SIGNUP,
    E2E_EMAIL: envValues.E2E_EMAIL,
    E2E_PASSWORD: envValues.E2E_PASSWORD,
    HIDE_OVERLAY: envValues.HIDE_OVERLAY,
    STORAGE_PROVIDER: envValues.STORAGE_PROVIDER,
    STORAGE_LOCAL_ROOT_DIR: envValues.STORAGE_LOCAL_ROOT_DIR,
  };

  runPackageCommand("npm", ["run", "db:push"], { cwd: rootDir, env });
  runPackageCommand("npm", ["run", "db:seed"], { cwd: rootDir, env });
  runPackageCommand("npm", ["run", "db:migrate:e2e"], { cwd: rootDir, env });
}

export function buildSetupPlan(argv, platform = process.platform) {
  const args = parseArgs(argv);
  return {
    requestedDatabaseMode: args.db,
    platform,
  };
}

export function mergeEnvForSetup(exampleContent, currentContent, databaseMode = "local") {
  const exampleValues = parseEnv(exampleContent);
  const currentValues = currentContent ? parseEnv(currentContent) : {};
  return serializeEnv(createEnvValues({ ...exampleValues, ...currentValues }, databaseMode));
}

export async function main(argv = process.argv.slice(2)) {
  const __filename = fileURLToPath(import.meta.url);
  const rootDir = join(dirname(__filename), "..");
  const plan = buildSetupPlan(argv);
  const databaseMode = resolveDatabaseMode(plan.requestedDatabaseMode);

  log(`Using ${databaseMode} database setup`);
  installDependencies(rootDir);
  installPlaywrightBrowser(rootDir);
  ensureAiToolLinks(rootDir);

  if (databaseMode === "docker") {
    ensureDockerDatabase(rootDir);
  } else {
    ensureLocalPostgresDatabases();
  }

  const envValues = ensureEnvFile(rootDir, databaseMode);
  applyDatabaseSetup(rootDir, envValues);

  log("Setup complete");
  log("Start the app with: npm run dev");
  log("Sign in with: demo@arrivo.com / demo1234 (see docs/dev-seed-data.md for two more seed accounts)");
  log(`Storage: ${envValues.STORAGE_PROVIDER} (${envValues.STORAGE_LOCAL_ROOT_DIR})`);
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  main().catch((error) => {
    console.error(`[setup-dev] ${error.message}`);
    process.exit(1);
  });
}
