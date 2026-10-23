// Deterministic half of the PR reviewer: diff parsing, secret scan, test-pairing, and the compact packet the model
// sees. Nothing here calls a model, so these checks cost no tokens and give the same answer every run.

const MAX_MISSING = 10;
const MAX_PACKET_FILES = 60;
const MAX_BODY_CHARS = 1500;

const NOISE_FILE_NAMES = new Set(["package-lock.json", "pnpm-lock.yaml", "yarn.lock", ".env.example"]);
const ASSET_EXTENSIONS = /\.(png|jpe?g|gif|webp|ico|svg|woff2?|ttf|otf|eot|pdf|zip)$/i;
const SOURCE_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs|mts|py|go|rs|java)$/;
const CONFIG_EXTENSIONS = /\.(json|ya?ml|toml|lock)$/i;
const STRICT_TEST_DIRS = ["src/lib/", "src/components/arrivo/"];
const E2E_PATH = /^tests\/e2e\/(features|steps)\//;

function baseName(path) {
  return path.slice(path.lastIndexOf("/") + 1);
}

function dirName(path) {
  const index = path.lastIndexOf("/");
  return index < 0 ? "" : path.slice(0, index);
}

export function classifyFile(path) {
  const name = baseName(path);
  if (
    NOISE_FILE_NAMES.has(name) ||
    path.startsWith("drizzle/") ||
    name.endsWith(".d.ts") ||
    ASSET_EXTENSIONS.test(name) ||
    path.includes(".generated.")
  ) {
    return "noise";
  }
  if (/\.(test|spec)\.[a-z]+$/.test(name) || path.startsWith("tests/")) return "test";
  if (
    name.endsWith(".md") ||
    /LICENSE$/i.test(name) ||
    ["docs/", "_bmad-output/", ".agents/", "backlog/"].some((prefix) => path.startsWith(prefix))
  ) {
    return "doc";
  }
  // Eval harnesses are test infrastructure themselves, so they do not need tests of their own.
  if (path.startsWith("evals/")) return "tooling";
  if (path.startsWith("src/components/ui/")) return "ui";
  if (name === "types.ts") return "types";
  if (/^index\.(ts|tsx|js|jsx)$/.test(name)) return "barrel";
  if (
    path.startsWith(".github/") ||
    name === "Dockerfile" ||
    name.startsWith(".") ||
    /\.config\.[a-z]+$/.test(name) ||
    CONFIG_EXTENSIONS.test(name)
  ) {
    return "config";
  }
  if (SOURCE_EXTENSIONS.test(name)) return "source";
  return "other";
}

export function parseDiff(diff) {
  const files = [];
  let current = null;
  let newLine = 0;
  let inHunk = false;
  for (const row of diff.split("\n")) {
    const header = /^diff --git a\/(.+?) b\/(.+)$/.exec(row);
    if (header) {
      current = {
        path: header[2],
        oldPath: header[1],
        status: "modified",
        binary: false,
        additions: 0,
        deletions: 0,
        addedLines: [],
      };
      files.push(current);
      newLine = 0;
      inHunk = false;
      continue;
    }
    if (!current) continue;
    if (row.startsWith("new file mode")) current.status = "added";
    else if (row.startsWith("deleted file mode")) current.status = "deleted";
    else if (row.startsWith("rename from ")) current.status = "renamed";
    else if (row.startsWith("Binary files ")) {
      current.binary = true;
      current.status = "binary";
    } else if (row.startsWith("@@")) {
      const hunk = /\+(\d+)/.exec(row);
      newLine = hunk ? Number(hunk[1]) : 0;
      inHunk = true;
    } else if (!inHunk && (row.startsWith("+++") || row.startsWith("---"))) {
      // file header lines, not content
    } else if (row.startsWith("+")) {
      current.additions += 1;
      current.addedLines.push({ line: newLine, text: row.slice(1) });
      newLine += 1;
    } else if (row.startsWith("-")) {
      current.deletions += 1;
    } else if (row.startsWith(" ")) {
      newLine += 1;
    }
  }
  return files;
}

const HIGH_CONFIDENCE_PATTERNS = [
  { name: "private-key-header", regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "stripe-live-key", regex: /\bsk_live_[A-Za-z0-9]{10,}/ },
  { name: "aws-access-key-id", regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "github-token", regex: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: "jwt", regex: /\beyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]+/ },
  {
    name: "url-credentials",
    regex:
      /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@"'`]+:(?![$<{])[^\s@/"'`]{3,}@(?!localhost\b|127\.0\.0\.1|0\.0\.0\.0|host\.docker\.internal|\$\{)[^\s/"'`]+/i,
  },
];

const GENERIC_ASSIGNMENT =
  /[\w.-]*(?:password|passwd|secret|api[_-]?key|token|credential)s?[\w.-]*["']?\s*[:=]\s*["']([^"'\s]{8,})["']/i;
// Demo credentials legitimately live in seed data, fixtures, mocks and eval cases; only the high-confidence patterns apply there.
const DEMO_DATA_PATH = /(^|\/)(seed|fixtures?|mocks?|evals)([\w.-]*\.|\/)/i;
const PLACEHOLDER_VALUE = /changeme|example|placeholder|dummy|your[_-]|xxx|<.*>|\$\{|\{\{|process\.env|test/i;

function genericSecret(text) {
  const match = GENERIC_ASSIGNMENT.exec(text);
  if (!match) return false;
  const value = match[1];
  return !PLACEHOLDER_VALUE.test(value) && !/^(.)\1+$/.test(value);
}

export function findSecrets(files) {
  const findings = [];
  for (const file of files) {
    const kind = classifyFile(file.path);
    if (kind === "noise" || file.binary) continue;
    for (const entry of file.addedLines) {
      const high = HIGH_CONFIDENCE_PATTERNS.find((pattern) => pattern.regex.test(entry.text));
      if (high) {
        findings.push({ path: file.path, line: entry.line, pattern: high.name });
      } else if (kind !== "test" && !DEMO_DATA_PATH.test(file.path) && genericSecret(entry.text)) {
        findings.push({ path: file.path, line: entry.line, pattern: "literal-credential-assignment" });
      }
    }
  }
  return findings;
}

function needsTest(file) {
  if (file.status === "deleted" || file.status === "binary") return false;
  if (file.status === "renamed" && file.additions === 0) return false;
  return classifyFile(file.path) === "source";
}

function isStrict(path) {
  return STRICT_TEST_DIRS.some((prefix) => path.startsWith(prefix));
}

export function checkTests(files) {
  const tests = files.filter((file) => classifyFile(file.path) === "test");
  const testDirs = new Set(tests.map((file) => dirName(file.path)));
  const hasE2e = tests.some((file) => E2E_PATH.test(file.path));
  const hasMigration = files.some((file) => file.path.startsWith("drizzle/"));

  const uncovered = files.filter(needsTest).filter((file) => {
    if (testDirs.has(dirName(file.path))) return false;
    const e2eCovers = hasE2e && (file.path.startsWith("src/app/") || file.path.startsWith("src/components/"));
    return isStrict(file.path) || !e2eCovers;
  });
  const uncoveredPaths = uncovered.map((file) => file.path);

  let missing;
  let review = [];
  if (tests.length === 0) {
    missing = uncoveredPaths;
  } else {
    missing = uncoveredPaths.filter(isStrict);
    review = uncoveredPaths.filter((path) => !isStrict(path));
  }
  if (files.some((file) => file.path === "src/db/schema.ts") && !hasMigration) {
    missing = [...missing, "src/db/schema.ts (no drizzle/ migration)"];
  }
  missing = missing.slice(0, MAX_MISSING);

  if (missing.length > 0) return { status: "FAIL", missing, review };
  return { status: review.length > 0 ? "REVIEW" : "PASS", missing: [], review };
}

// Paths whose changes a person running Arrivo would notice. Dev-only files (docker-compose.dev.yml, tests, assets) are not.
const USER_FACING_PATHS = [
  /^src\/(app|components)\//,
  /^drizzle\/.*\.sql$/,
  /^Dockerfile$/,
  /^docker-compose\.yml$/,
  /^SETUP\.md$/,
  /^docs\/self-hosting\.md$/,
];
const MAX_CHANGELOG_FILES = 5;

export function checkChangelog(files) {
  if (files.some((file) => file.path === "CHANGELOG.md")) return { status: "PASS", files: [], updated: true };
  const hits = files
    .filter((file) => USER_FACING_PATHS.some((pattern) => pattern.test(file.path)))
    .filter((file) => file.path.startsWith("drizzle/") || !["test", "noise"].includes(classifyFile(file.path)))
    .map((file) => file.path);
  return hits.length > 0
    ? { status: "WARN", files: hits.slice(0, MAX_CHANGELOG_FILES), updated: false }
    : { status: "PASS", files: [], updated: false };
}

function areaOf(path) {
  const parts = path.split("/");
  return parts[0] === "src" && parts.length > 2 ? `src/${parts[1]}` : parts[0];
}

export function scopeStats(files) {
  const significant = files.filter((file) => !["noise", "test", "doc"].includes(classifyFile(file.path)));
  return {
    files: files.length,
    additions: files.reduce((sum, file) => sum + file.additions, 0),
    deletions: files.reduce((sum, file) => sum + file.deletions, 0),
    significantLines: significant.reduce((sum, file) => sum + file.additions + file.deletions, 0),
    areas: [...new Set(significant.map((file) => areaOf(file.path)))],
  };
}

// What the model sees: metadata and paths only. Diff content never enters the prompt, which keeps the cost flat
// however large the PR is; secrets and test pairing are decided above, not by the model.
export function buildPacket({ title, body, files, tests }) {
  const stats = scopeStats(files);
  const visible = files.filter((file) => classifyFile(file.path) !== "noise");
  const noiseCount = files.length - visible.length;
  const shown = visible.slice(0, MAX_PACKET_FILES);
  const trimmedBody = body.length > MAX_BODY_CHARS ? `${body.slice(0, MAX_BODY_CHARS)}\n[body truncated]` : body;

  const lines = [
    `Title: ${title}`,
    "Description:",
    trimmedBody.trim() === "" ? "(empty)" : trimmedBody,
    "",
    `Size: ${stats.files} files, +${stats.additions} -${stats.deletions}; ${stats.significantLines} lines outside tests, docs and generated files`,
    `Areas: ${stats.areas.join(", ") || "(none)"}`,
    "Files:",
    ...shown.map((file) => `${file.path} (+${file.additions} -${file.deletions})`),
  ];
  if (visible.length > shown.length) lines.push(`... ${visible.length - shown.length} more files omitted`);
  if (noiseCount > 0)
    lines.push(`${noiseCount} noise file${noiseCount === 1 ? "" : "s"} hidden (lockfiles, assets, migrations)`);

  if (tests.review.length > 0) {
    const changedTests = files.filter((file) => classifyFile(file.path) === "test").map((file) => file.path);
    lines.push(
      "",
      "Source files without a same-area test:",
      ...tests.review,
      "",
      "Changed tests:",
      ...changedTests.slice(0, 20)
    );
  }
  return lines.join("\n");
}
