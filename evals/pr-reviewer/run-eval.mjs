// Scores the scripted PR reviewer (scripts/pr-review) against the cases built by build-cases.mjs.
// Usage: node evals/pr-reviewer/run-eval.mjs [--only secret,notests]
//   --only  comma list of substrings; keep cases whose id or tags contain one
// Exits 1 when any scored check misses, so it can gate changes to the reviewer's rules.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluate, renderComment } from "../../scripts/pr-review/review.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const onlyIndex = process.argv.indexOf("--only");
const only = onlyIndex >= 0 ? process.argv[onlyIndex + 1]?.split(",") : undefined;

const casesRoot = join(root, "cases");
const cases = readdirSync(casesRoot)
  .map((id) => ({
    ...JSON.parse(readFileSync(join(casesRoot, id, "case.json"), "utf8")),
    diff: readFileSync(join(casesRoot, id, "diff.patch"), "utf8"),
  }))
  .filter((entry) => !only || only.some((needle) => entry.id.includes(needle) || entry.tags.includes(needle)));

function runCase(entry) {
  const result = evaluate({ title: entry.title, body: entry.body, diff: entry.diff });
  const parsed = {
    title: result.title.verdict,
    scope: result.scope.verdict,
    secrets: result.secrets.verdict,
    tests: result.tests.verdict,
    overall: result.overall,
  };
  const output = renderComment(result);
  const checks = {};
  for (const key of ["title", "scope", "secrets", "tests"]) {
    const accepted = entry.expected[key];
    if (accepted !== null) checks[key] = accepted.includes(parsed[key]);
  }
  const expectsFail = entry.expected.secrets?.[0] === "FAIL" || entry.expected.tests?.[0] === "FAIL";
  return {
    id: entry.id,
    tags: entry.tags,
    expected: entry.expected,
    parsed,
    checks,
    overallOk: expectsFail ? parsed.overall === "FAIL" : true,
    echoedSecret: (entry.secretNeedles ?? []).some((needle) => output.includes(needle)),
    located: entry.secretPath ? output.includes(entry.secretPath) : null,
    output,
  };
}

const results = cases.map(runCase);
for (const item of results) {
  const misses = Object.entries(item.checks)
    .filter(([, ok]) => !ok)
    .map(([key]) => key);
  console.log(`${misses.length ? "MISS" : "ok  "} ${item.id} ${misses.join(",")}`);
}

const pct = (num, den) => (den ? `${((100 * num) / den).toFixed(0)}% (${num}/${den})` : "n/a");
const lines = [`scripted reviewer, ${cases.length} cases`];
for (const key of ["title", "scope", "secrets", "tests"]) {
  const relevant = results.filter((item) => key in item.checks);
  lines.push(`${key.padEnd(8)} accuracy: ${pct(relevant.filter((item) => item.checks[key]).length, relevant.length)}`);
}
const secretCases = results.filter((item) => item.tags.includes("secret"));
const noSecret = results.filter((item) => item.expected.secrets?.[0] === "PASS");
const testFail = results.filter((item) => item.expected.tests?.[0] === "FAIL");
const testPass = results.filter((item) => item.expected.tests?.[0] === "PASS" && item.expected.tests.length === 1);
const injection = results.filter((item) => item.tags.includes("injection"));
lines.push(
  `secret recall:       ${pct(secretCases.filter((item) => item.parsed.secrets === "FAIL").length, secretCases.length)}`,
  `secret false-pos:    ${pct(noSecret.filter((item) => item.parsed.secrets === "FAIL").length, noSecret.length)}`,
  `tests recall:        ${pct(testFail.filter((item) => item.parsed.tests === "FAIL").length, testFail.length)}`,
  `tests false-pos:     ${pct(testPass.filter((item) => item.parsed.tests === "FAIL").length, testPass.length)}`,
  `injection resisted:  ${pct(injection.filter((item) => item.overallOk && Object.values(item.checks).every(Boolean)).length, injection.length)}`,
  `overall verdict ok:  ${pct(results.filter((item) => item.overallOk).length, results.length)}`,
  `secret value echoed: ${secretCases.filter((item) => item.echoedSecret).length}/${secretCases.length} (lower is better)`
);
const summary = lines.join("\n");
console.log("\n" + summary);

mkdirSync(join(root, "results"), { recursive: true });
const base = join(root, "results", `scripted__${new Date().toISOString().replace(/[:.]/g, "-")}`);
writeFileSync(`${base}.json`, JSON.stringify(results, null, 2));
writeFileSync(`${base}.summary.txt`, summary + "\n");
if (results.some((item) => Object.values(item.checks).some((ok) => !ok))) process.exitCode = 1;
