// Structural PR reviewer. Every check is a script: no model, no tokens, no secrets, same answer every run.
//
//   node scripts/pr-review/review.mjs --pr 123 --repo owner/name [--dry-run]
//
// It reads the PR through `gh` (title, body, diff), posts or updates one sticky comment, and exits 1 when the review
// fails. PR text is only ever data here: it is never executed or interpolated into a shell command.
import { execFile } from "node:child_process";
import { pathToFileURL } from "node:url";
import { checkTests, findSecrets, parseDiff } from "./checks.mjs";
import { structureVerdicts } from "./structure.mjs";

const MARKER = "<!-- pr-review:v2 -->";
const MARKER_PREFIX = "<!-- pr-review:";

export function shouldSkipPr({ isDraft, author }) {
  const login = author?.login ?? "";
  return Boolean(isDraft || author?.is_bot || login.endsWith("[bot]") || login.startsWith("app/"));
}

export function isReviewComment(body) {
  return Boolean(body?.includes(MARKER_PREFIX));
}

export function evaluate({ title, body, diff, versions }) {
  const files = parseDiff(diff);
  const secrets = findSecrets(files);
  const tests = checkTests(files, versions);
  const structure = structureVerdicts({ title, body, files });

  let testsResult;
  if (tests.status === "FAIL") {
    testsResult = { verdict: "FAIL", reason: "Source files changed without matching tests.", files: tests.missing };
  } else if (tests.status === "REVIEW") {
    testsResult = {
      verdict: "WARN",
      reason: "No test sits next to these files; check the changed tests cover them.",
      files: tests.review,
    };
  } else {
    testsResult = { verdict: "PASS", reason: "", files: [] };
  }
  const secretsResult = { verdict: secrets.length > 0 ? "FAIL" : "PASS", findings: secrets };

  return {
    title: structure.title,
    scope: structure.scope,
    secrets: secretsResult,
    tests: testsResult,
    overall: secretsResult.verdict === "FAIL" || testsResult.verdict === "FAIL" ? "FAIL" : "PASS",
  };
}

function line(label, check, detail) {
  const suffix = detail ? ` — ${detail}` : "";
  return `- ${label}: ${check.verdict}${suffix}`;
}

export function renderComment(result) {
  const rows = [
    MARKER,
    "## PR review",
    "",
    line("Title and description", result.title, result.title.reason),
    line("Scope", result.scope, result.scope.reason),
    line("Secrets", result.secrets, ""),
    ...result.secrets.findings.map((finding) => `  - \`${finding.path}:${finding.line}\` (${finding.pattern})`),
    line("Tests", result.tests, result.tests.reason),
    ...result.tests.files.map((file) => `  - \`${file}\``),
    "",
    `Overall: ${result.overall}`,
  ];
  return rows.join("\n") + "\n";
}

function run(file, args) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { maxBuffer: 256 * 1024 * 1024 }, (error, stdout, stderr) =>
      error
        ? reject(new Error(`${file} ${args.slice(0, 3).join(" ")}: ${stderr.trim() || error.message}`))
        : resolve(stdout)
    );
  });
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith("--")) continue;
    const key = argv[index].slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) options[key] = true;
    else {
      options[key] = next;
      index += 1;
    }
  }
  return options;
}

export async function main(argv = process.argv.slice(2), runCommand = run) {
  const options = parseArgs(argv);
  if (!options.pr || !options.repo) throw new Error("usage: review.mjs --pr <number> --repo <owner/name> [--dry-run]");
  const pr = String(options.pr);

  const meta = JSON.parse(
    await runCommand("gh", [
      "pr",
      "view",
      pr,
      "-R",
      options.repo,
      "--json",
      "title,body,isDraft,author,baseRefOid,headRefOid",
    ])
  );
  if (shouldSkipPr(meta)) {
    console.log("Skipped: draft or bot PR.");
    return;
  }
  const diff = await runCommand("gh", [
    "api",
    `repos/${options.repo}/compare/${meta.baseRefOid}...${meta.headRefOid}`,
    "-H",
    "Accept: application/vnd.github.v3.diff",
  ]);
  const versions = {};
  let mergeBase;
  try {
    const comparison = JSON.parse(
      await runCommand("gh", ["api", `repos/${options.repo}/compare/${meta.baseRefOid}...${meta.headRefOid}`])
    );
    mergeBase = comparison.merge_base_commit?.sha;
  } catch {
    // Missing merge base prevents any comment-only exemption.
  }
  for (const file of parseDiff(diff)) {
    if (!mergeBase || file.status !== "modified" || !/\.tsx?$/.test(file.path)) continue;
    try {
      const readVersion = async (revision) => {
        const path = file.path.split("/").map(encodeURIComponent).join("/");
        const data = JSON.parse(
          await runCommand("gh", ["api", `repos/${options.repo}/contents/${path}?ref=${revision}`])
        );
        if (data.encoding !== "base64" || typeof data.content !== "string") throw new Error("Source unavailable");
        return Buffer.from(data.content, "base64").toString("utf8");
      };
      versions[file.path] = { before: await readVersion(mergeBase), after: await readVersion(meta.headRefOid) };
    } catch {
      // Missing source keeps the existing conservative test check.
    }
  }
  const result = evaluate({ title: meta.title, body: meta.body ?? "", diff, versions });
  const comment = renderComment(result);

  if (options["dry-run"]) {
    console.log(comment);
  } else {
    const comments = JSON.parse(
      await runCommand("gh", ["api", `repos/${options.repo}/issues/${pr}/comments`, "--paginate", "--slurp"])
    ).flat();
    const existing = comments.find((item) => isReviewComment(item.body));
    if (existing && existing.body === comment) {
      console.log("Comment already up to date.");
    } else if (existing) {
      await runCommand("gh", [
        "api",
        `repos/${options.repo}/issues/comments/${existing.id}`,
        "-X",
        "PATCH",
        "-f",
        `body=${comment}`,
      ]);
    } else {
      await runCommand("gh", ["api", `repos/${options.repo}/issues/${pr}/comments`, "-f", `body=${comment}`]);
    }
  }
  console.log(`overall: ${result.overall}`);
  if (result.overall === "FAIL") process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 2;
  });
}
