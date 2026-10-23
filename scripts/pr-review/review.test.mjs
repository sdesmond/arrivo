import { describe, expect, it, vi } from "vitest";
import { parseDiff } from "./checks.mjs";
import {
  VERDICT_SCHEMA,
  buildClaudeArgs,
  combine,
  evaluate,
  evaluateDeterministic,
  extractState,
  packetHash,
  parseClaudeOutput,
  renderComment,
  shouldSkipPr,
} from "./review.mjs";

function fileDiff(path, lines = ["x"]) {
  return [
    `diff --git a/${path} b/${path}`,
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -1,1 +1,${lines.length + 1} @@`,
    " context",
    ...lines.map((text) => `+${text}`),
    "",
  ].join("\n");
}

const goodVerdicts = {
  title: { verdict: "PASS", reason: "Clear title and body." },
  scope: { verdict: "PASS", reason: "One concern." },
  tests: { verdict: "NA", reason: "No review needed." },
};

function modelOutput(structured = goodVerdicts, extra = {}) {
  return JSON.stringify({
    is_error: false,
    structured_output: structured,
    usage: { input_tokens: 2, cache_creation_input_tokens: 1200, cache_read_input_tokens: 0, output_tokens: 90 },
    total_cost_usd: 0.0004,
    ...extra,
  });
}

describe("buildClaudeArgs", () => {
  it("disables tools, slash commands, MCP, session persistence and settings to keep the call tiny", () => {
    const args = buildClaudeArgs({ model: "claude-haiku-5-5", effort: "low" });

    expect(args.slice(args.indexOf("--tools"), args.indexOf("--tools") + 2)).toEqual(["--tools", ""]);
    expect(args).toEqual(
      expect.arrayContaining(["-p", "--disable-slash-commands", "--strict-mcp-config", "--no-session-persistence"])
    );
    expect(args[args.indexOf("--setting-sources") + 1]).toBe("");
    expect(args[args.indexOf("--model") + 1]).toBe("claude-haiku-5-5");
    expect(args[args.indexOf("--effort") + 1]).toBe("low");
    expect(args[args.indexOf("--output-format") + 1]).toBe("json");
  });

  it("never uses --bare, which rejects subscription OAuth auth", () => {
    expect(buildClaudeArgs({})).not.toContain("--bare");
  });

  it("passes the verdict schema as JSON and defaults to Haiku at low effort", () => {
    const args = buildClaudeArgs({});

    expect(JSON.parse(args[args.indexOf("--json-schema") + 1])).toEqual(VERDICT_SCHEMA);
    expect(args[args.indexOf("--model") + 1]).toBe("claude-haiku-5-5");
    expect(args[args.indexOf("--effort") + 1]).toBe("low");
    expect(args[args.indexOf("--system-prompt") + 1]).toContain("untrusted");
  });
});

describe("VERDICT_SCHEMA", () => {
  it("requires title, scope and tests verdicts and bounds the reasons", () => {
    expect(VERDICT_SCHEMA.required).toEqual(["title", "scope", "tests"]);
    expect(VERDICT_SCHEMA.additionalProperties).toBe(false);
    expect(VERDICT_SCHEMA.properties.title.properties.reason.maxLength).toBeLessThanOrEqual(200);
    expect(VERDICT_SCHEMA.properties.tests.properties.verdict.enum).toEqual(["PASS", "FAIL", "NA"]);
  });
});

describe("parseClaudeOutput", () => {
  it("returns verdicts and token usage", () => {
    const parsed = parseClaudeOutput(modelOutput());

    expect(parsed.verdicts).toEqual(goodVerdicts);
    expect(parsed.usage).toEqual({ inputTokens: 1202, outputTokens: 90, costUsd: 0.0004 });
  });

  it("throws on an error result", () => {
    expect(() => parseClaudeOutput(JSON.stringify({ is_error: true, result: "boom" }))).toThrow(/boom/);
  });

  it("throws when structured output is missing", () => {
    expect(() => parseClaudeOutput(JSON.stringify({ is_error: false, result: "text" }))).toThrow(/structured/);
  });

  it("throws when structured output has an unexpected verdict", () => {
    const bad = { ...goodVerdicts, title: { verdict: "MAYBE", reason: "?" } };

    expect(() => parseClaudeOutput(modelOutput(bad))).toThrow(/verdict/);
  });

  it("throws on non-JSON output", () => {
    expect(() => parseClaudeOutput("not json")).toThrow();
  });

  it("tolerates missing usage fields", () => {
    const parsed = parseClaudeOutput(JSON.stringify({ structured_output: goodVerdicts }));

    expect(parsed.usage).toEqual({ inputTokens: 0, outputTokens: 0, costUsd: 0 });
  });
});

describe("packetHash", () => {
  const base = { title: "Add thing", body: "Body", tests: { status: "PASS", missing: [], review: [] } };

  it("ignores line-count changes inside the same size bucket", () => {
    const first = packetHash({ ...base, files: parseDiff(fileDiff("src/lib/a.ts", ["1", "2", "3"])) });
    const second = packetHash({ ...base, files: parseDiff(fileDiff("src/lib/a.ts", ["1", "2", "3", "4"])) });

    expect(first).toBe(second);
  });

  it("changes when the title, body or file set changes", () => {
    const files = parseDiff(fileDiff("src/lib/a.ts"));
    const hash = packetHash({ ...base, files });

    expect(packetHash({ ...base, title: "Other", files })).not.toBe(hash);
    expect(packetHash({ ...base, body: "Other", files })).not.toBe(hash);
    expect(packetHash({ ...base, files: parseDiff(fileDiff("src/lib/a.ts") + fileDiff("src/lib/b.ts")) })).not.toBe(
      hash
    );
  });

  it("changes when the diff grows into a much larger size bucket", () => {
    const small = packetHash({ ...base, files: parseDiff(fileDiff("src/lib/a.ts", ["1"])) });
    const large = packetHash({
      ...base,
      files: parseDiff(
        fileDiff(
          "src/lib/a.ts",
          Array.from({ length: 300 }, (_unused, index) => String(index))
        )
      ),
    });

    expect(small).not.toBe(large);
  });

  it("changes when the test check result changes", () => {
    const files = parseDiff(fileDiff("src/lib/a.ts"));

    expect(packetHash({ ...base, files, tests: { status: "FAIL", missing: ["src/lib/a.ts"], review: [] } })).not.toBe(
      packetHash({ ...base, files })
    );
  });
});

describe("shouldSkipPr", () => {
  it("skips drafts and bot authors", () => {
    expect(shouldSkipPr({ isDraft: true, author: { login: "someone", is_bot: false } })).toBe(true);
    expect(shouldSkipPr({ isDraft: false, author: { login: "dependabot[bot]", is_bot: true } })).toBe(true);
    expect(shouldSkipPr({ isDraft: false, author: { login: "app/dependabot", is_bot: false } })).toBe(true);
  });

  it("reviews ready human PRs", () => {
    expect(shouldSkipPr({ isDraft: false, author: { login: "sdesmond", is_bot: false } })).toBe(false);
  });
});

describe("combine", () => {
  const passTests = { status: "PASS", missing: [], review: [] };

  it("passes overall when nothing fails and WARNs do not fail", () => {
    const result = combine({
      secrets: [],
      tests: passTests,
      model: { ...goodVerdicts, title: { verdict: "WARN", reason: "Vague." } },
    });

    expect(result.title.verdict).toBe("WARN");
    expect(result.overall).toBe("PASS");
  });

  it("fails overall on a secret and lists file:line without values", () => {
    const result = combine({
      secrets: [{ path: "src/a.ts", line: 4, pattern: "stripe-live-key" }],
      tests: passTests,
      model: goodVerdicts,
    });

    expect(result.secrets).toEqual({
      verdict: "FAIL",
      findings: [{ path: "src/a.ts", line: 4, pattern: "stripe-live-key" }],
    });
    expect(result.overall).toBe("FAIL");
  });

  it("fails overall on a deterministic tests failure without consulting the model", () => {
    const result = combine({
      secrets: [],
      tests: { status: "FAIL", missing: ["src/lib/a.ts"], review: [] },
      model: { ...goodVerdicts, tests: { verdict: "PASS", reason: "ignored" } },
    });

    expect(result.tests).toMatchObject({ verdict: "FAIL", files: ["src/lib/a.ts"] });
    expect(result.overall).toBe("FAIL");
  });

  it("uses the model's tests judgment for REVIEW", () => {
    const review = { status: "REVIEW", missing: [], review: ["src/app/layout.tsx"] };

    expect(
      combine({ secrets: [], tests: review, model: { ...goodVerdicts, tests: { verdict: "PASS", reason: "ok" } } })
        .tests.verdict
    ).toBe("PASS");
    expect(
      combine({ secrets: [], tests: review, model: { ...goodVerdicts, tests: { verdict: "FAIL", reason: "no" } } })
        .overall
    ).toBe("FAIL");
  });

  it("downgrades REVIEW to WARN when the model said NA", () => {
    const review = { status: "REVIEW", missing: [], review: ["src/app/layout.tsx"] };

    expect(combine({ secrets: [], tests: review, model: goodVerdicts }).tests.verdict).toBe("WARN");
  });

  it("carries a changelog warning without failing the review", () => {
    const result = combine({
      secrets: [],
      tests: passTests,
      model: goodVerdicts,
      changelog: { status: "WARN", files: ["Dockerfile"] },
    });

    expect(result.changelog).toEqual({ verdict: "WARN", files: ["Dockerfile"], updated: false });
    expect(result.overall).toBe("PASS");
  });

  it("defaults the changelog check to PASS", () => {
    expect(combine({ secrets: [], tests: passTests, model: goodVerdicts }).changelog).toEqual({
      verdict: "PASS",
      files: [],
      updated: false,
    });
  });

  it("falls back to SKIP and WARN when there is no model result", () => {
    const review = { status: "REVIEW", missing: [], review: ["src/app/layout.tsx"] };
    const result = combine({ secrets: [], tests: review, model: null });

    expect(result.title.verdict).toBe("SKIP");
    expect(result.scope.verdict).toBe("SKIP");
    expect(result.tests.verdict).toBe("WARN");
    expect(result.overall).toBe("PASS");
  });
});

describe("renderComment", () => {
  const result = combine({
    secrets: [{ path: "src/a.ts", line: 4, pattern: "stripe-live-key" }],
    tests: { status: "FAIL", missing: ["src/lib/a.ts"], review: [] },
    model: goodVerdicts,
  });

  it("shows each check and the overall verdict", () => {
    const comment = renderComment(result, { hash: "abc", model: goodVerdicts });

    expect(comment).toContain("Title and description: PASS");
    expect(comment).toContain("Scope: PASS");
    expect(comment).toContain("Secrets: FAIL");
    expect(comment).toContain("`src/a.ts:4` (stripe-live-key)");
    expect(comment).toContain("Tests: FAIL");
    expect(comment).toContain("`src/lib/a.ts`");
    expect(comment).toContain("Overall: FAIL");
  });

  it("always shows a changelog line, with the reason when it passes", () => {
    const passTests = { status: "PASS", missing: [], review: [] };
    const warned = combine({
      secrets: [],
      tests: passTests,
      model: goodVerdicts,
      changelog: { status: "WARN", files: ["src/app/page.tsx"], updated: false },
    });
    const updated = combine({
      secrets: [],
      tests: passTests,
      model: goodVerdicts,
      changelog: { status: "PASS", files: [], updated: true },
    });
    const untouched = combine({ secrets: [], tests: passTests, model: goodVerdicts });

    const warnedComment = renderComment(warned, { hash: "h", model: goodVerdicts });

    expect(warnedComment).toContain("Changelog: WARN");
    expect(warnedComment).toContain("CHANGELOG.md");
    expect(warnedComment).toContain("`src/app/page.tsx`");
    expect(renderComment(updated, { hash: "h", model: goodVerdicts })).toContain(
      "Changelog: PASS — CHANGELOG.md updated"
    );
    expect(renderComment(untouched, { hash: "h", model: goodVerdicts })).toContain(
      "Changelog: PASS — no user-facing files changed"
    );
  });

  it("round-trips the hash and model verdicts through a hidden marker", () => {
    const comment = renderComment(result, { hash: "abc123", model: goodVerdicts });

    expect(extractState(comment)).toEqual({ hash: "abc123", model: goodVerdicts });
  });

  it("returns null state for a body without the marker or with a corrupt one", () => {
    expect(extractState("hello")).toBeNull();
    expect(extractState("<!-- pr-review:v1 !!!not-base64-json!!! -->")).toBeNull();
  });

  it("keeps the marker a valid HTML comment even when reasons contain double dashes", () => {
    const verdicts = { ...goodVerdicts, title: { verdict: "WARN", reason: "uses -- dashes --> here" } };
    const comment = renderComment(
      combine({ secrets: [], tests: { status: "PASS", missing: [], review: [] }, model: verdicts }),
      {
        hash: "h",
        model: verdicts,
      }
    );
    const marker = comment.split("\n")[0];

    expect(marker.slice(0, -3)).not.toContain("-->");
    expect(extractState(comment).model.title.reason).toContain("-->");
  });
});

describe("evaluate", () => {
  const diff =
    fileDiff("src/lib/format.ts", ["const secretSauce = 1;"]) + fileDiff("src/lib/format.test.ts", ["it();"]);

  it("calls the model once with a packet that carries no diff content", async () => {
    const runModel = vi
      .fn()
      .mockResolvedValue({ verdicts: goodVerdicts, usage: { inputTokens: 1, outputTokens: 1, costUsd: 0 } });

    const outcome = await evaluate({ title: "Add formatter", body: "Adds it.", diff }, { runModel });

    expect(runModel).toHaveBeenCalledTimes(1);
    expect(runModel.mock.calls[0][0]).toContain("Title: Add formatter");
    expect(runModel.mock.calls[0][0]).not.toContain("secretSauce");
    expect(outcome.result.overall).toBe("PASS");
    expect(outcome.ranModel).toBe(true);
  });

  it("reuses the previous model verdicts when the hash is unchanged", async () => {
    const runModel = vi.fn().mockResolvedValue({ verdicts: goodVerdicts, usage: {} });
    const first = await evaluate({ title: "Add formatter", body: "Adds it.", diff }, { runModel });
    runModel.mockClear();

    const second = await evaluate(
      { title: "Add formatter", body: "Adds it.", diff },
      { runModel, previous: { hash: first.hash, model: goodVerdicts } }
    );

    expect(runModel).not.toHaveBeenCalled();
    expect(second.ranModel).toBe(false);
    expect(second.result.title.verdict).toBe("PASS");
  });

  it("calls the model again when forced", async () => {
    const runModel = vi.fn().mockResolvedValue({ verdicts: goodVerdicts, usage: {} });
    const first = await evaluate({ title: "t", body: "b", diff }, { runModel });
    runModel.mockClear();

    await evaluate(
      { title: "t", body: "b", diff },
      { runModel, previous: { hash: first.hash, model: goodVerdicts }, force: true }
    );

    expect(runModel).toHaveBeenCalledTimes(1);
  });

  it("still reports secrets and tests when the model is unavailable", async () => {
    const secretDiff = fileDiff("src/lib/a.ts", ['const apiKey = "7f3a9c1e5b2d48a6b0c9e1f4a7d2c8b3";']);

    const outcome = await evaluate({ title: "t", body: "b", diff: secretDiff }, { runModel: async () => null });

    expect(outcome.result.title.verdict).toBe("SKIP");
    expect(outcome.result.secrets.verdict).toBe("FAIL");
    expect(outcome.result.tests.verdict).toBe("FAIL");
    expect(outcome.result.overall).toBe("FAIL");
  });

  it("warns about a missing changelog entry for user-facing changes without failing", async () => {
    const userFacing =
      fileDiff("src/app/(app)/profile/page.tsx", ["x"]) + fileDiff("src/app/(app)/profile/page.test.tsx", ["y"]);

    const outcome = await evaluate({ title: "t", body: "b", diff: userFacing }, { runModel: async () => null });

    expect(outcome.result.changelog).toEqual({
      verdict: "WARN",
      files: ["src/app/(app)/profile/page.tsx"],
      updated: false,
    });
    expect(outcome.result.overall).toBe("PASS");
  });

  it("degrades to the deterministic result when the model call throws", async () => {
    const outcome = await evaluate(
      { title: "t", body: "b", diff },
      {
        runModel: async () => {
          throw new Error("rate limited");
        },
      }
    );

    expect(outcome.result.title.verdict).toBe("SKIP");
    expect(outcome.modelError).toBe("rate limited");
    expect(outcome.result.overall).toBe("PASS");
  });
});

describe("evaluateDeterministic", () => {
  it("needs no model: title and scope come from the scripted rules", () => {
    const diff = fileDiff("src/lib/format.ts", ["x"]) + fileDiff("src/lib/format.test.ts", ["y"]);

    const result = evaluateDeterministic({ title: "bug fixes", body: "", diff });

    expect(result.title.verdict).toBe("WARN");
    expect(result.scope.verdict).toBe("PASS");
    expect(result.secrets.verdict).toBe("PASS");
    expect(result.tests.verdict).toBe("PASS");
    expect(result.overall).toBe("PASS");
  });

  it("still fails on secrets and missing tests", () => {
    const diff = fileDiff("src/lib/a.ts", ['const apiKey = "7f3a9c1e5b2d48a6b0c9e1f4a7d2c8b3";']);

    const result = evaluateDeterministic({ title: "Add the thing to profile", body: "x".repeat(60), diff });

    expect(result.secrets.verdict).toBe("FAIL");
    expect(result.tests.verdict).toBe("FAIL");
    expect(result.overall).toBe("FAIL");
  });
});
