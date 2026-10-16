import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(SCRIPT_DIR, "..");
const MARKER_PATH = join(ROOT_DIR, "node_modules", ".cache", "build-validator", "last-pass.json");

const FULL_SCOPE = "full";
const NONE_SCOPE = "none";

// Hash of HEAD + all uncommitted tracked changes + the contents of every untracked (non-ignored)
// file. Identical on an unchanged working tree; changes the moment any source is edited, staged, or
// added. Untracked contents are folded in because `git diff HEAD` alone misses brand-new files.
export function computeFingerprint({ head, trackedDiff, untracked }) {
  const hash = createHash("sha256");
  hash.update(`head\0${head}\0diff\0${trackedDiff}\0`);
  for (const file of [...untracked].sort((left, right) => left.path.localeCompare(right.path))) {
    hash.update(`untracked\0${file.path}\0${file.content}\0`);
  }
  return hash.digest("hex");
}

// "full" | "none" | comma/pipe-separated tag list → "full" | "none" | sorted tag array.
// Empty/garbage → "full" (safe default); an explicit "none" (no impacted features) stays "none".
export function parseScope(raw) {
  const value = (raw ?? "").trim();
  if (!value || value.toLowerCase() === FULL_SCOPE) return FULL_SCOPE;
  if (value.toLowerCase() === NONE_SCOPE) return NONE_SCOPE;
  const tags = value
    .split(/[,|]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
  return tags.length === 0 ? FULL_SCOPE : [...new Set(tags)].sort();
}

// Skip only when the tree is byte-identical to the last PASS AND that pass already covered the
// requested scope. A "full" request is never satisfied by a prior affected-only pass. A "none"
// request (nothing to run) is satisfied by any prior pass on the same tree.
export function shouldSkip(marker, fingerprint, requestedScope) {
  if (!marker || marker.fingerprint !== fingerprint) return false;
  const recorded = marker.scope;
  if (recorded === FULL_SCOPE) return true;
  if (requestedScope === NONE_SCOPE) return true;
  if (requestedScope === FULL_SCOPE) return false;
  const recordedTags = Array.isArray(recorded) ? recorded : [];
  return requestedScope.every((tag) => recordedTags.includes(tag));
}

function git(args) {
  try {
    return execFileSync("git", args, { cwd: ROOT_DIR, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return "";
  }
}

function gatherGitState() {
  const head = git(["rev-parse", "HEAD"]).trim();
  const trackedDiff = git(["diff", "HEAD"]);
  const untracked = git(["ls-files", "--others", "--exclude-standard"])
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((path) => {
      try {
        return { path, content: readFileSync(join(ROOT_DIR, path), "utf8") };
      } catch {
        return { path, content: "" };
      }
    });
  return { head, trackedDiff, untracked };
}

function readMarker() {
  try {
    return JSON.parse(readFileSync(MARKER_PATH, "utf8"));
  } catch {
    return undefined;
  }
}

function writeMarker(fingerprint, scope) {
  mkdirSync(dirname(MARKER_PATH), { recursive: true });
  writeFileSync(MARKER_PATH, JSON.stringify({ fingerprint, scope, recordedAt: new Date().toISOString() }, null, 2));
}

function clearMarker() {
  rmSync(MARKER_PATH, { force: true });
}

function readScopeArg(argv) {
  const scopeArg = argv.find((arg) => arg.startsWith("--scope="));
  return parseScope(scopeArg?.slice("--scope=".length));
}

function main(argv) {
  const [command] = argv;

  if (command === "clear") {
    clearMarker();
    return;
  }

  const fingerprint = computeFingerprint(gatherGitState());
  const scope = readScopeArg(argv);

  if (command === "record") {
    writeMarker(fingerprint, scope);
    return;
  }

  if (command === "check") {
    const marker = readMarker();
    process.stdout.write(
      JSON.stringify({
        fingerprint,
        skip: shouldSkip(marker, fingerprint, scope),
        recordedScope: marker?.scope ?? null,
      })
    );
    return;
  }

  throw new Error(`Unknown command "${command ?? ""}". Use check | record | clear.`);
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`[validator-fingerprint] ${error.message}`);
    process.exit(1);
  }
}
