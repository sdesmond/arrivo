// Static guards for .github/workflows, run by workflow-guards.test.mjs. They exist because this repository is public:
// anyone can comment, open issues and open PRs, so a workflow that holds a secret or a write token must not start for
// them. Text-based on purpose (no YAML dependency); it only needs to recognise the shapes these workflows use.

export const OWNER_GATE = "github.actor == github.repository_owner";

// Events a stranger can cause on a public repository, and that run with this repository's secrets.
const OUTSIDER_EVENTS =
  /^ {2}(issue_comment|pull_request_review_comment|pull_request_review|issues|discussion|discussion_comment):/m;
const JOB_KEY = /^ {2}([\w-]+):\s*$/;
const PR_HEAD_CHECKOUT = /^\s*ref:\s*\$\{\{\s*github\.(event\.pull_request\.head|head_ref)/m;

function jobBlocks(text) {
  const rows = text.split("\n");
  const start = rows.findIndex((row) => row === "jobs:");
  if (start < 0) return [];
  const blocks = [];
  for (const row of rows.slice(start + 1)) {
    const key = JOB_KEY.exec(row);
    if (key) blocks.push({ name: key[1], rows: [] });
    else if (blocks.length > 0) blocks.at(-1).rows.push(row);
  }
  return blocks;
}

// The job-level `if:` expression, including the continuation lines of a block scalar.
function jobCondition(block) {
  const index = block.rows.findIndex((row) => /^ {4}if:/.test(row));
  if (index < 0) return "";
  const lines = [block.rows[index]];
  for (const row of block.rows.slice(index + 1)) {
    if (/^ {5,}\S/.test(row)) lines.push(row);
    else break;
  }
  return lines.join("\n");
}

export function findWorkflowViolations(name, rawText) {
  // Checked-out files may have CRLF endings; a parser that sees "\r" would find no jobs and pass everything.
  const text = rawText.replace(/\r\n/g, "\n");
  const violations = [];
  if (OUTSIDER_EVENTS.test(text)) {
    for (const block of jobBlocks(text)) {
      if (!jobCondition(block).includes(OWNER_GATE)) {
        violations.push(
          `${name}: job "${block.name}" runs for comments or issues but is not gated on \`${OWNER_GATE}\``
        );
      }
    }
  }
  if (/^ {2}pull_request_target:/m.test(text) && PR_HEAD_CHECKOUT.test(text)) {
    violations.push(`${name}: pull_request_target must never check out the pull request's head`);
  }
  return violations;
}
