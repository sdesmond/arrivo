import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { OWNER_GATE, findWorkflowViolations } from "./workflow-guards.mjs";

const workflowsDir = join(import.meta.dirname, "..", ".github", "workflows");

function workflow({ on, jobs }) {
  return `name: sample\n\non:\n${on}\n\njobs:\n${jobs}\n`;
}

describe("findWorkflowViolations", () => {
  const commentTrigger = "  issue_comment:\n    types: [created]";

  it("flags a comment-triggered job that is open to everyone", () => {
    const text = workflow({
      on: commentTrigger,
      jobs: "  bot:\n    if: contains(github.event.comment.body, '@bot')\n    runs-on: ubuntu-latest",
    });

    expect(findWorkflowViolations("bot.yml", text)).toEqual([expect.stringContaining("bot")]);
  });

  it("still flags an ungated job when the file has Windows line endings", () => {
    const text = workflow({
      on: commentTrigger,
      jobs: "  bot:\n    if: contains(github.event.comment.body, '@bot')\n    runs-on: ubuntu-latest",
    }).replace(/\n/g, "\r\n");

    expect(findWorkflowViolations("bot.yml", text)).toHaveLength(1);
  });

  it("accepts a job gated on the repository owner, in a one-line or block-scalar if", () => {
    const oneLine = workflow({
      on: commentTrigger,
      jobs: `  bot:\n    if: ${OWNER_GATE} && contains(github.event.comment.body, '@bot')\n    runs-on: ubuntu-latest`,
    });
    const block = workflow({
      on: commentTrigger,
      jobs: `  bot:\n    if: |\n      ${OWNER_GATE} &&\n      contains(github.event.comment.body, '@bot')\n    runs-on: ubuntu-latest`,
    });

    expect(findWorkflowViolations("bot.yml", oneLine)).toEqual([]);
    expect(findWorkflowViolations("bot.yml", block)).toEqual([]);
  });

  it("flags every ungated job, not just the first", () => {
    const text = workflow({
      on: commentTrigger,
      jobs: [
        `  gated:\n    if: ${OWNER_GATE}\n    runs-on: ubuntu-latest`,
        "  open:\n    runs-on: ubuntu-latest\n    steps: []",
      ].join("\n"),
    });

    expect(findWorkflowViolations("bot.yml", text)).toEqual([expect.stringContaining("open")]);
  });

  it("does not count a gate that only appears outside the job's if", () => {
    const text = workflow({
      on: commentTrigger,
      jobs: `  bot:\n    if: contains(github.event.comment.body, '@bot')\n    runs-on: ubuntu-latest\n    env:\n      NOTE: ${OWNER_GATE}`,
    });

    expect(findWorkflowViolations("bot.yml", text)).toHaveLength(1);
  });

  it.each(["issues", "pull_request_review_comment", "pull_request_review", "discussion_comment"])(
    "treats %s as an outsider-triggerable event",
    (event) => {
      const text = workflow({ on: `  ${event}:\n    types: [created]`, jobs: "  bot:\n    runs-on: ubuntu-latest" });

      expect(findWorkflowViolations("bot.yml", text)).toHaveLength(1);
    }
  );

  it("ignores workflows that only run on pushes, tags and the repo's own pull requests", () => {
    const text = workflow({
      on: "  push:\n    branches: [main]\n  pull_request:\n  workflow_dispatch:",
      jobs: "  build:\n    runs-on: ubuntu-latest",
    });

    expect(findWorkflowViolations("ci.yml", text)).toEqual([]);
  });

  it("flags a pull_request_target workflow that checks out the PR head", () => {
    const text = workflow({
      on: "  pull_request_target:\n    types: [opened]",
      jobs: [
        "  review:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - uses: actions/checkout@v7",
        "        with:",
        "          ref: ${{ github.event.pull_request.head.sha }}",
      ].join("\n"),
    });

    expect(findWorkflowViolations("review.yml", text)).toEqual([expect.stringContaining("pull_request_target")]);
  });

  it("accepts a pull_request_target workflow that only checks out the base branch", () => {
    const text = workflow({
      on: "  pull_request_target:\n    types: [opened]",
      jobs: "  review:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v7",
    });

    expect(findWorkflowViolations("review.yml", text)).toEqual([]);
  });
});

describe("this repository's workflows", () => {
  const files = readdirSync(workflowsDir).filter((name) => name.endsWith(".yml"));

  it("finds the workflow files", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)(
    "%s only lets the repository owner trigger bots, and never runs PR code with a write token",
    (name) => {
      const text = readFileSync(join(workflowsDir, name), "utf8");

      expect(findWorkflowViolations(name, text)).toEqual([]);
    }
  );
});
