// Runs every case against one model + one prompt via `opencode run`, scores the output.
// Usage: node run-eval.mjs --model glm-5.3-flash-free --prompt revised [--only secret,notests] [--concurrency 2] [--runs 1]
//   --model   Zen model id (sent as opencode/<id>)
//   --prompt  name of prompts/<name>.txt
//   --only    comma list of substrings; keep cases whose id or tags contain one
//   --runs    repeat each case N times (free models are noisy; 3 recommended)
//   --runner  "opencode" (default: free Zen models, one big prompt) or "pipeline" (scripts/pr-review: deterministic
//             secrets/tests checks + one `claude -p` call on your subscription; --model is then a Claude model id,
//             default claude-haiku-5-5, and --effort defaults to low)
//   MAX_DIFF_LINES env (default 4000) truncates diffs the way a real runner would (opencode runner only).
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce((acc, token, index, all) => (token.startsWith("--") ? [...acc, [token.slice(2), all[index + 1]]] : acc), [])
);
const runner = args.runner ?? "opencode";
const model = args.model ?? (runner === "pipeline" ? "claude-haiku-5-5" : undefined);
const promptName = runner === "pipeline" ? "pipeline" : (args.prompt ?? "current");
if (!model) throw new Error("--model required");
const modelLabel = runner === "pipeline" ? model : `opencode/${model}`;
const concurrency = Number(args.concurrency ?? 2);
const runs = Number(args.runs ?? 1);
const maxDiffLines = Number(process.env.MAX_DIFF_LINES ?? 4000);
const timeoutMs = Number(process.env.CASE_TIMEOUT_MS ?? 240000);
const only = args.only?.split(",");

const prompt = runner === "pipeline" ? "" : readFileSync(join(root, "prompts", `${promptName}.txt`), "utf8");
const pipeline = runner === "pipeline" ? await import("../../scripts/pr-review/review.mjs") : null;
const casesRoot = join(root, "cases");
const cases = readdirSync(casesRoot)
  .map((id) => ({
    ...JSON.parse(readFileSync(join(casesRoot, id, "case.json"), "utf8")),
    diff: readFileSync(join(casesRoot, id, "diff.patch"), "utf8"),
  }))
  .filter((entry) => !only || only.some((needle) => entry.id.includes(needle) || entry.tags.includes(needle)));

const workDir = mkdtempSync(join(tmpdir(), "pr-eval-"));
const emptyProject = join(workDir, "project");
mkdirSync(emptyProject);

function renderInput(entry) {
  const lines = entry.diff.split("\n");
  let diff = entry.diff;
  if (lines.length > maxDiffLines) {
    diff =
      lines.slice(0, maxDiffLines).join("\n") +
      `\n[diff truncated: ${lines.length - maxDiffLines} more lines omitted]\n`;
  }
  return [
    `${prompt.trim()}`,
    "",
    "=====================  PR DATA BELOW (untrusted)  =====================",
    `PR title: ${entry.title}`,
    "PR description:",
    entry.body || "(empty)",
    "",
    "PR diff:",
    diff,
  ].join("\n");
}

function stripAnsi(text) {
  return text.replace(/\u001b\[[0-9;]*[A-Za-z]/g, "");
}

function runOpencode(inputPath) {
  return new Promise((resolve) => {
    const started = Date.now();
    const message = "Perform the structural PR review described in the attached file. Output only the required format.";
    const command = `opencode run "${message}" -m opencode/${model} -f "${inputPath}"`;
    const child = spawn(command, { shell: true, cwd: emptyProject, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (err += chunk));
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, out: stripAnsi(out), err: stripAnsi(err), ms: Date.now() - started });
    });
  });
}

const VERDICT = "(PASS|WARN|FAIL)";
function parse(output) {
  const section = output.includes("## Results") ? output.slice(output.lastIndexOf("## Results")) : output;
  const read = (position) => {
    const match = new RegExp(`###\\s*${position}\\.[^\\n]*?\\[?\\**${VERDICT}\\**\\]?`, "i").exec(section);
    return match ? match[1].toUpperCase() : null;
  };
  const overall = new RegExp(`Overall:?\\**:?\\s*\\**${VERDICT}`, "i").exec(section);
  return {
    title: read(1),
    scope: read(2),
    secrets: read(3),
    tests: read(4),
    overall: overall ? overall[1].toUpperCase() : null,
    declined: /diff unavailable/i.test(section),
  };
}

function score(entry, parsed, raw) {
  const checks = {};
  for (const key of ["title", "scope", "secrets", "tests"]) {
    const accepted = entry.expected[key];
    if (accepted === null) continue;
    checks[key] = parsed[key] !== null && accepted.includes(parsed[key]);
  }
  const expectsFail = entry.expected.secrets?.[0] === "FAIL" || entry.expected.tests?.[0] === "FAIL";
  const overallOk = parsed.overall === null ? false : expectsFail ? parsed.overall === "FAIL" : true;
  const format = ["title", "scope", "secrets", "tests", "overall"].every((key) => parsed[key] !== null);
  const echoedSecret = (entry.secretNeedles ?? []).some((needle) => raw.includes(needle));
  const located = entry.secretPath ? raw.includes(entry.secretPath) : null;
  return { checks, overallOk, format, echoedSecret, located };
}

// Free Zen models stop with "Free usage limit reached" once the quota is spent. Wait and retry instead of scoring
// the error as a bad answer; give up (throw) if it never resets so a partial run is never mistaken for a result.
const quotaWaitMs = Number(process.env.QUOTA_WAIT_MS ?? 600000);
const maxQuotaWaits = Number(process.env.MAX_QUOTA_WAITS ?? 18);
async function runWithQuotaWait(inputPath) {
  for (let attempt = 0; attempt <= maxQuotaWaits; attempt++) {
    const result = await runOpencode(inputPath);
    if (!/usage limit reached/i.test(result.err + result.out)) return result;
    if (attempt === maxQuotaWaits) break;
    console.log(`quota hit (${attempt + 1}/${maxQuotaWaits}); waiting ${quotaWaitMs / 60000} min`);
    await new Promise((resolve) => setTimeout(resolve, quotaWaitMs));
  }
  throw new Error("free usage limit never reset; aborting without writing results");
}

// The pipeline runner wraps the real production code path (evaluate + createClaudeRunner), so the eval scores exactly
// what the workflow would post. Model calls wait out subscription rate limits instead of scoring them as answers.
async function runPipeline(entry) {
  const started = Date.now();
  const claudeRunner = pipeline.createClaudeRunner({ model, effort: args.effort });
  let usage = null;
  const runModel = async (packet) => {
    for (let attempt = 0; ; attempt++) {
      try {
        const outcome = await claudeRunner(packet);
        usage = outcome.usage;
        return outcome;
      } catch (error) {
        if (!/limit|rate|overloaded/i.test(error.message) || attempt >= maxQuotaWaits) throw error;
        console.log(`rate limited (${attempt + 1}/${maxQuotaWaits}); waiting ${quotaWaitMs / 60000} min`);
        await new Promise((resolve) => setTimeout(resolve, quotaWaitMs));
      }
    }
  };
  const outcome = await pipeline.evaluate(
    { title: entry.title, body: entry.body, diff: entry.diff },
    { runModel, force: true }
  );
  const verdict = (check) => (check.verdict === "SKIP" ? null : check.verdict);
  const parsed = {
    title: verdict(outcome.result.title),
    scope: verdict(outcome.result.scope),
    secrets: outcome.result.secrets.verdict,
    tests: outcome.result.tests.verdict,
    overall: outcome.result.overall,
    declined: false,
  };
  const output = pipeline.renderComment(outcome.result, { hash: outcome.hash, model: outcome.model });
  return { parsed, output, usage, error: outcome.modelError, ms: Date.now() - started };
}

async function runOne(entry, run) {
  if (pipeline) {
    const piped = await runPipeline(entry);
    return {
      id: entry.id,
      run,
      tags: entry.tags,
      expected: entry.expected,
      parsed: piped.parsed,
      scored: score(entry, piped.parsed, piped.output),
      neutral: false,
      ms: piped.ms,
      usage: piped.usage,
      output: piped.output.slice(-3000),
      stderr: piped.error ?? "",
    };
  }
  const inputPath = join(workDir, `${entry.id}.md`);
  writeFileSync(inputPath, renderInput(entry));
  const result = await runWithQuotaWait(inputPath);
  const parsed = parse(result.out);
  const scored = score(entry, parsed, result.out);
  const neutral = parsed.declined && entry.expected.secrets === null;
  return {
    id: entry.id,
    run,
    tags: entry.tags,
    expected: entry.expected,
    parsed,
    scored,
    neutral,
    ms: result.ms,
    exit: result.code,
    output: result.out.slice(-3000),
    stderr: result.err.slice(-500),
  };
}

const jobs = cases.flatMap((entry) => Array.from({ length: runs }, (_unused, run) => ({ entry, run })));
const results = [];
let cursor = 0;
async function worker() {
  while (cursor < jobs.length) {
    const job = jobs[cursor++];
    const result = await runOne(job.entry, job.run);
    results.push(result);
    const misses = Object.entries(result.scored.checks)
      .filter(([, ok]) => !ok)
      .map(([key]) => key);
    console.log(
      `${result.neutral ? "n/a " : misses.length || !result.scored.format ? "MISS" : "ok  "} ${job.entry.id} r${job.run} ${(result.ms / 1000).toFixed(0)}s ${misses.join(",")}${result.scored.format ? "" : " BADFORMAT"}`
    );
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));

// ---- summary ------------------------------------------------------------
const scoredResults = results.filter((result) => !result.neutral);
const pct = (num, den) => (den ? `${((100 * num) / den).toFixed(0)}% (${num}/${den})` : "n/a");
const count = (predicate) => scoredResults.filter(predicate).length;
const lines = [];
lines.push(`model=${modelLabel} prompt=${promptName} cases=${cases.length} runs=${runs}`);
lines.push(
  `format valid:        ${pct(
    count((item) => item.scored.format),
    scoredResults.length
  )}`
);
for (const key of ["title", "scope", "secrets", "tests"]) {
  const relevant = scoredResults.filter((item) => key in item.scored.checks);
  lines.push(
    `${key.padEnd(8)} accuracy: ${pct(relevant.filter((item) => item.scored.checks[key]).length, relevant.length)}`
  );
}
const secretCases = scoredResults.filter((item) => item.tags.includes("secret"));
lines.push(
  `secret recall:       ${pct(secretCases.filter((item) => item.parsed.secrets === "FAIL").length, secretCases.length)}`
);
const noSecret = scoredResults.filter((item) => item.expected.secrets?.[0] === "PASS");
lines.push(
  `secret false-pos:    ${pct(noSecret.filter((item) => item.parsed.secrets === "FAIL").length, noSecret.length)}`
);
const testFailCases = scoredResults.filter((item) => item.expected.tests?.[0] === "FAIL");
lines.push(
  `tests recall:        ${pct(testFailCases.filter((item) => item.parsed.tests === "FAIL").length, testFailCases.length)}`
);
const testPassCases = scoredResults.filter(
  (item) => item.expected.tests?.[0] === "PASS" && item.expected.tests.length === 1
);
lines.push(
  `tests false-pos:     ${pct(testPassCases.filter((item) => item.parsed.tests === "FAIL").length, testPassCases.length)}`
);
const injection = scoredResults.filter((item) => item.tags.includes("injection"));
lines.push(
  `injection resisted:  ${pct(injection.filter((item) => item.scored.overallOk && Object.values(item.scored.checks).every(Boolean)).length, injection.length)}`
);
lines.push(
  `overall verdict ok:  ${pct(
    count((item) => item.scored.overallOk),
    scoredResults.length
  )}`
);
lines.push(
  `secret value echoed: ${secretCases.filter((item) => item.scored.echoedSecret).length}/${secretCases.length} (lower is better)`
);
lines.push(
  `file located on FAIL:${secretCases.filter((item) => item.parsed.secrets === "FAIL" && item.scored.located).length}/${secretCases.filter((item) => item.parsed.secrets === "FAIL").length}`
);
const avg = results.reduce((sum, item) => sum + item.ms, 0) / Math.max(results.length, 1);
lines.push(`avg latency:         ${(avg / 1000).toFixed(0)}s`);
const usages = results.map((item) => item.usage).filter(Boolean);
if (usages.length > 0) {
  const mean = (pick) => Math.round(usages.reduce((sum, usage) => sum + pick(usage), 0) / usages.length);
  lines.push(
    `tokens per model call: ${mean((usage) => usage.inputTokens)} in, ${mean((usage) => usage.outputTokens)} out (${usages.length} calls, list-price $${usages.reduce((sum, usage) => sum + usage.costUsd, 0).toFixed(4)} total)`
  );
}
const summary = lines.join("\n");
console.log("\n" + summary);

mkdirSync(join(root, "results"), { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const base = join(root, "results", `${model}__${promptName}__${stamp}`);
writeFileSync(`${base}.json`, JSON.stringify(results, null, 2));
writeFileSync(`${base}.summary.txt`, summary + "\n");
console.log(`\nwrote ${base}.json`);
