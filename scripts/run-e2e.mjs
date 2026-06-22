import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DETECT_PORT_SCRIPT = join(SCRIPT_DIR, "detect-port.mjs");
const AFFECTED_SCRIPT = join(SCRIPT_DIR, "affected-e2e.mjs");

const DEFAULT_PORT = 3001;
const SERVER_MODE_KILL = "kill";
const SERVER_MODE_REUSE = "reuse";
const SUPPORTED_SERVER_MODES = [SERVER_MODE_KILL, SERVER_MODE_REUSE];
const PORT_WAIT_TIMEOUT_MS = 15_000;
const PORT_WAIT_INTERVAL_MS = 250;

function log(message) {
  console.log(`[run-e2e] ${message}`);
}

function fail(message) {
  throw new Error(message);
}

function parsePort(rawValue) {
  const parsedValue = Number(rawValue);
  if (!Number.isInteger(parsedValue) || parsedValue < 1 || parsedValue > 65535) {
    fail(`Unsupported port "${rawValue}".`);
  }
  return parsedValue;
}

export function buildRunE2EPlan(argv) {
  const plan = {
    ui: false,
    port: DEFAULT_PORT,
    serverMode: SERVER_MODE_KILL,
    affected: false,
    full: false,
    grep: undefined,
  };

  for (const arg of argv) {
    if (arg === "--ui") {
      plan.ui = true;
      continue;
    }

    if (arg === "--affected") {
      plan.affected = true;
      continue;
    }

    if (arg === "--full") {
      plan.full = true;
      continue;
    }

    if (arg.startsWith("--grep=")) {
      plan.grep = arg.slice("--grep=".length);
      continue;
    }

    if (arg.startsWith("--port=")) {
      plan.port = parsePort(arg.slice("--port=".length));
      continue;
    }

    if (arg.startsWith("--server=")) {
      const serverMode = arg.slice("--server=".length);
      if (!SUPPORTED_SERVER_MODES.includes(serverMode)) {
        fail(`Unsupported server mode "${serverMode}". Use kill or reuse.`);
      }
      plan.serverMode = serverMode;
      continue;
    }

    fail(`Unsupported argument "${arg}".`);
  }

  return plan;
}

function normalizePath(value) {
  return value.replace(/\\/g, "/").toLowerCase();
}

export function isManagedPacktServer(listener, rootDir) {
  if (!listener) return false;

  const normalizedCommandLine = normalizePath(listener.commandLine ?? "");
  const normalizedRootDir = normalizePath(rootDir);

  // Next dev forks a `start-server.js` child to actually bind the port; that child's
  // command line never carries the port (it's passed via env/IPC, not argv), so the port
  // can't be part of this check. The port match is already guaranteed by the caller, which
  // only looks up listeners bound to the target port in the first place.
  return (
    listener.name?.toLowerCase() === "node.exe" &&
    normalizedCommandLine.includes(normalizedRootDir) &&
    normalizedCommandLine.includes("next")
  );
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

function runPackageCommand(command, args, options = {}) {
  if (process.platform === "win32") {
    return runCommand("cmd.exe", ["/d", "/s", "/c", `${command} ${args.join(" ")}`], options);
  }

  return runCommand(command, args, options);
}

function wait(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function getWindowsListeningProcess(port) {
  // Delegate the pwsh query to an isolated child (detect-port.mjs). Spawning pwsh directly from
  // this process would corrupt job-object state and break the next spawn (AssignProcessToJobObject:
  // (87)); running it through a node child contains that to the short-lived helper process.
  const { stdout } = runCommand(process.execPath, [DETECT_PORT_SCRIPT, `${port}`], {
    captureOutput: true,
  });

  if (!stdout) return undefined;

  const parsedValue = JSON.parse(stdout);
  return {
    pid: Number(parsedValue.ProcessId),
    name: String(parsedValue.Name ?? ""),
    commandLine: String(parsedValue.CommandLine ?? ""),
  };
}

function getPosixListeningProcess(port) {
  try {
    const { stdout } = runCommand("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-Fpc"], {
      captureOutput: true,
    });

    if (!stdout) return undefined;

    const lines = stdout.split(/\r?\n/);
    let pid;
    let commandLine = "";

    for (const line of lines) {
      if (line.startsWith("p")) {
        pid = Number(line.slice(1));
      }
      if (line.startsWith("c")) {
        commandLine = line.slice(1);
      }
    }

    if (!pid) return undefined;

    return {
      pid,
      name: commandLine,
      commandLine,
    };
  } catch {
    return undefined;
  }
}

function getListeningProcess(port) {
  if (process.platform === "win32") {
    return getWindowsListeningProcess(port);
  }

  return getPosixListeningProcess(port);
}

function stopListeningProcess(processId) {
  if (process.platform === "win32") {
    // taskkill runs through cmd.exe, which (unlike pwsh) does not poison subsequent spawns. /T
    // also terminates the dev server's child workers.
    runCommand("cmd.exe", ["/d", "/s", "/c", `taskkill /PID ${processId} /T /F`], {
      captureOutput: true,
    });
    return;
  }

  runCommand("kill", ["-TERM", `${processId}`], { captureOutput: true });
}

function waitForPortToClear(port) {
  const deadline = Date.now() + PORT_WAIT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (!getListeningProcess(port)) {
      return;
    }
    wait(PORT_WAIT_INTERVAL_MS);
  }

  fail(`Timed out waiting for port ${port} to clear.`);
}

function prepareServerPort({ serverMode, port, rootDir }) {
  const listeningProcess = getListeningProcess(port);

  if (!listeningProcess) {
    log(`Port ${port} is free.`);
    return;
  }

  if (serverMode === SERVER_MODE_REUSE) {
    if (!isManagedPacktServer(listeningProcess, rootDir)) {
      fail(
        `Port ${port} is occupied by pid ${listeningProcess.pid} (${listeningProcess.name}). Refusing to reuse a non-Packt process.`
      );
    }
    log(`Reusing existing process ${listeningProcess.pid} on port ${port}.`);
    return;
  }

  if (!isManagedPacktServer(listeningProcess, rootDir)) {
    fail(
      `Port ${port} is occupied by pid ${listeningProcess.pid} (${listeningProcess.name}). Refusing to terminate a non-Packt process.`
    );
  }

  log(`Stopping existing Packt server pid ${listeningProcess.pid} on port ${port}.`);
  stopListeningProcess(listeningProcess.pid);
  waitForPortToClear(port);
}

export function buildPlaywrightArgs(ui, grep) {
  return ["playwright", "test", ...(ui ? ["--ui"] : []), ...(grep ? ["--grep", grep] : [])];
}

// Explicit `--grep` wins; otherwise `--affected` (unless overridden by `--full`) asks
// affected-e2e.mjs which feature tags the change set touches. "FULL" means run everything.
function resolveGrep(plan) {
  if (plan.grep) return plan.grep;
  if (!plan.affected || plan.full) return undefined;

  const { stdout } = runCommand(process.execPath, [AFFECTED_SCRIPT], { captureOutput: true });
  const filter = stdout.trim();
  if (!filter || filter === "FULL") {
    log("Affected detection selected the full suite.");
    return undefined;
  }

  log(`Affected detection selected: ${filter}`);
  return filter;
}

export async function main(argv = process.argv.slice(2)) {
  const __filename = fileURLToPath(import.meta.url);
  const rootDir = join(dirname(__filename), "..");
  const plan = buildRunE2EPlan(argv);
  const grep = resolveGrep(plan);

  prepareServerPort({
    serverMode: plan.serverMode,
    port: plan.port,
    rootDir,
  });

  const env = {
    E2E_REUSE_SERVER: plan.serverMode === SERVER_MODE_REUSE ? "true" : "false",
    PORT: `${plan.port}`,
  };

  runPackageCommand("npm", ["run", "db:reset:e2e"], { cwd: rootDir, env });
  runPackageCommand("npm", ["run", "db:migrate:e2e"], { cwd: rootDir, env });
  runPackageCommand("npx", ["bddgen"], { cwd: rootDir, env });
  runPackageCommand("npx", buildPlaywrightArgs(plan.ui, grep), { cwd: rootDir, env });
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  main().catch((error) => {
    console.error(`[run-e2e] ${error.message}`);
    process.exit(1);
  });
}
