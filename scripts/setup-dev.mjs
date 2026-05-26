import { randomBytes } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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
  "UPLOAD_STUB",
  "BLOB_READ_WRITE_TOKEN",
];

const DEFAULT_ENV_VALUES = {
  NEXTAUTH_URL: "http://localhost:3000",
  ALLOW_SIGNUP: "true",
  E2E_EMAIL: "e2e@packt.local",
  E2E_PASSWORD: "e2e1234",
  HIDE_OVERLAY: "true",
  BLOB_READ_WRITE_TOKEN: "",
};

const LOCAL_DATABASE_URL = "postgres://packt:packt@localhost:5432/packt";
const LOCAL_E2E_DATABASE_URL = "postgres://packt:packt@localhost:5432/packt_e2e";

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

function createEnvValues(existingValues) {
  const nextValues = { ...existingValues };

  nextValues.DATABASE_URL = LOCAL_DATABASE_URL;
  nextValues.E2E_DATABASE_URL = LOCAL_E2E_DATABASE_URL;

  for (const [key, value] of Object.entries(DEFAULT_ENV_VALUES)) {
    if (!nextValues[key]) {
      nextValues[key] = value;
    }
  }

  if (needsGeneratedSecret(nextValues.NEXTAUTH_SECRET)) {
    nextValues.NEXTAUTH_SECRET = randomBytes(32).toString("base64");
  }

  if (!nextValues.BLOB_READ_WRITE_TOKEN) {
    nextValues.UPLOAD_STUB = "true";
  } else if (!nextValues.UPLOAD_STUB) {
    nextValues.UPLOAD_STUB = "false";
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

function ensureEnvFile(rootDir) {
  const examplePath = join(rootDir, ".env.example");
  const envPath = join(rootDir, ".env");
  const exampleValues = parseEnv(readFileSync(examplePath, "utf8"));
  const currentValues = existsSync(envPath) ? parseEnv(readFileSync(envPath, "utf8")) : {};
  const mergedValues = createEnvValues({ ...exampleValues, ...currentValues });

  writeFileSync(envPath, serializeEnv(mergedValues), "utf8");
  return mergedValues;
}

function ensureDirectory(path) {
  mkdirSync(path, { recursive: true });
}

function ensureAiToolLinks(rootDir) {
  const agentsDir = join(rootDir, ".agents");
  const claudeDir = join(rootDir, ".claude");
  const claudeMemoryDir = join(claudeDir, "memory");
  const mappings = [
    { linkPath: join(claudeDir, "skills"), targetPath: join(agentsDir, "skills") },
    { linkPath: join(claudeDir, "agents"), targetPath: join(agentsDir, "agents") },
  ];

  ensureDirectory(join(agentsDir, "skills"));
  ensureDirectory(join(agentsDir, "agents"));
  ensureDirectory(claudeDir);
  ensureDirectory(claudeMemoryDir);

  for (const mapping of mappings) {
    if (existsSync(mapping.linkPath)) {
      const stats = lstatSync(mapping.linkPath);
      if (stats.isSymbolicLink()) {
        rmSync(mapping.linkPath, { recursive: true, force: true });
      } else {
        fail(`Refusing to replace existing path: ${relative(rootDir, mapping.linkPath)}`);
      }
    }

    const symlinkTarget = process.platform === "win32" ? mapping.targetPath : relative(claudeDir, mapping.targetPath);
    symlinkSync(symlinkTarget, mapping.linkPath, process.platform === "win32" ? "junction" : "dir");
  }
}

function ensureLocalPostgresDatabases() {
  if (!commandExists("psql")) {
    fail("psql is required for local PostgreSQL setup.");
  }

  const roleExists =
    runCommand("psql", ["-d", "postgres", "-tAc", "SELECT 1 FROM pg_roles WHERE rolname='packt'"], {
      captureOutput: true,
    }).stdout === "1";

  if (!roleExists) {
    log("Creating local PostgreSQL role packt");
    runCommand("psql", ["-d", "postgres", "-c", "CREATE ROLE packt LOGIN PASSWORD 'packt'"]);
  }

  for (const databaseName of ["packt", "packt_e2e"]) {
    const dbExists =
      runCommand("psql", ["-d", "postgres", "-tAc", `SELECT 1 FROM pg_database WHERE datname='${databaseName}'`], {
        captureOutput: true,
      }).stdout === "1";

    if (!dbExists) {
      log(`Creating local PostgreSQL database ${databaseName}`);
      runCommand("psql", ["-d", "postgres", "-c", `CREATE DATABASE ${databaseName} OWNER packt`]);
    }
  }
}

function ensureDockerDatabase(rootDir) {
  if (!commandExists("docker", ["compose", "version"])) {
    fail("Docker Compose is required for Docker database setup.");
  }

  runCommand("docker", ["compose", "up", "-d", "db"], { cwd: rootDir });

  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      runCommand("docker", ["compose", "exec", "-T", "db", "pg_isready", "-U", "packt"], {
        cwd: rootDir,
      });
      return;
    } catch {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
    }
  }

  fail("Docker database did not become ready in time.");
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
    UPLOAD_STUB: envValues.UPLOAD_STUB,
    BLOB_READ_WRITE_TOKEN: envValues.BLOB_READ_WRITE_TOKEN,
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

export function mergeEnvForSetup(exampleContent, currentContent) {
  const exampleValues = parseEnv(exampleContent);
  const currentValues = currentContent ? parseEnv(currentContent) : {};
  return serializeEnv(createEnvValues({ ...exampleValues, ...currentValues }));
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

  const envValues = ensureEnvFile(rootDir);
  applyDatabaseSetup(rootDir, envValues);

  log("Setup complete");
  log("Start the app with: npm run dev");
  log("Sign in with: demo@packt.local / demo1234");
  if (envValues.UPLOAD_STUB === "true") {
    log("Uploads are stubbed locally until BLOB_READ_WRITE_TOKEN is set.");
  }
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  main().catch((error) => {
    console.error(`[setup-dev] ${error.message}`);
    process.exit(1);
  });
}
