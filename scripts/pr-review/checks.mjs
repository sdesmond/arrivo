// Deterministic half of the PR reviewer: diff parsing, secret scan, test-pairing, and the compact packet the model
// sees. Nothing here calls a model, so these checks cost no tokens and give the same answer every run.

const MAX_MISSING = 10;

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
  // Test setup and eval harnesses do not need colocated tests of their own.
  if (path === "vitest.setup.mts" || path.startsWith("evals/")) return "tooling";
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
  /([\w.-]*(?:password|passwd|secret|api[_-]?key|token|credential)s?[\w.-]*)["']?\s*[:=]\s*["']([^"'\s]{8,})["']/gi;
const FETCH_CREDENTIAL_MODES = new Set(["same-origin", "include", "omit"]);
// A PascalCase constant member set to lowercase snake/kebab words is an identifier (ActivityEventType.PasswordChanged =
// "password_changed"), not a secret. Lowercase and camelCase names (apiToken, password) are still checked.
const CONSTANT_IDENTIFIER_VALUE = /^[a-z]+(?:[_-][a-z]+)+$/;
// Demo credentials legitimately live in seed data, fixtures, mocks and eval cases; only the high-confidence patterns apply there.
const DEMO_DATA_PATH = /(^|\/)(seed|fixtures?|mocks?|evals)([\w.-]*\.|\/)/i;
const PLACEHOLDER_VALUE = /changeme|example|placeholder|dummy|your[_-]|xxx|<.*>|\$\{|\{\{|process\.env|test/i;

function genericSecret(text) {
  for (const match of text.matchAll(GENERIC_ASSIGNMENT)) {
    const [, name, value] = match;
    if (name === "credentials" && FETCH_CREDENTIAL_MODES.has(value)) continue;
    if (/^[A-Z]/.test(name) && CONSTANT_IDENTIFIER_VALUE.test(value)) continue;
    if (!PLACEHOLDER_VALUE.test(value) && !/^(.)\1+$/.test(value)) return true;
  }
  return false;
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

// A test beside the file always covers it. Outside the strict directories a test in an ancestor directory covers the
// subdirectories too (src/db/seed-runner.test.ts for src/db/seed-data/users.ts); the repository root never counts.
function hasNearbyTest(path, testDirs) {
  const dir = dirName(path);
  if (testDirs.has(dir)) return true;
  if (isStrict(path)) return false;
  return [...testDirs].some((testDir) => testDir !== "" && dir.startsWith(`${testDir}/`));
}

export function checkTests(files) {
  const tests = files.filter((file) => classifyFile(file.path) === "test");
  const testDirs = new Set(tests.map((file) => dirName(file.path)));
  const hasE2e = tests.some((file) => E2E_PATH.test(file.path));
  const hasMigration = files.some((file) => file.path.startsWith("drizzle/"));

  const uncovered = files.filter(needsTest).filter((file) => {
    if (hasNearbyTest(file.path, testDirs)) return false;
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
