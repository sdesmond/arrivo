// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { issue, postgres, end, drizzle } = vi.hoisted(() => {
  const end = vi.fn();
  return { issue: vi.fn(), end, postgres: vi.fn(() => ({ end })), drizzle: vi.fn(() => ({ transaction: vi.fn() })) };
});
vi.mock("@/lib/admin-recovery-issuance", () => ({ issueAdminRecovery: issue }));
vi.mock("postgres", () => ({ default: postgres }));
vi.mock("drizzle-orm/postgres-js", () => ({ drizzle }));

import { ADMIN_RECOVERY_USAGE, runAdminRecoveryCli } from "./admin-recovery-cli";

const DATABASE = { transaction: vi.fn() };
const close = vi.fn();
const connect = vi.fn();
const out: string[] = [];
const err: string[] = [];

function run(argv: string[], env: Record<string, string | undefined> = { DATABASE_URL: "postgres://db/arrivo" }) {
  return runAdminRecoveryCli({
    argv,
    env,
    stdout: (line) => out.push(line),
    stderr: (line) => err.push(line),
    connect,
  });
}

describe("runAdminRecoveryCli", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    out.length = 0;
    err.length = 0;
    connect.mockReturnValue({ database: DATABASE, close });
    close.mockResolvedValue(undefined);
    issue.mockResolvedValue({
      ok: true,
      userId: "user-1",
      username: "root",
      url: "https://arrivo.example.com/account-recovery?token=abc",
      expiresAt: "2026-10-29T13:00:00.000Z",
    });
  });

  it("issues a link as the trusted operator and prints it", async () => {
    expect(await run(["root", "https://arrivo.example.com"])).toBe(0);
    expect(issue).toHaveBeenCalledWith(
      DATABASE,
      { kind: "trusted-operator" },
      { username: "root", origin: "https://arrivo.example.com" }
    );
    expect(out).toContain("https://arrivo.example.com/account-recovery?token=abc");
    expect(err).toEqual([]);
    expect(connect).toHaveBeenCalledWith("postgres://db/arrivo");
    expect(close).toHaveBeenCalledOnce();
  });

  it.each([
    ["no arguments", []],
    ["no base URL", ["root"]],
    ["extra arguments", ["root", "https://arrivo.example.com", "more"]],
  ])("prints usage for %s without connecting", async (_name, argv) => {
    expect(await run(argv)).toBe(1);
    expect(err).toEqual([ADMIN_RECOVERY_USAGE]);
    expect(connect).not.toHaveBeenCalled();
  });

  it("needs only DATABASE_URL", async () => {
    expect(await run(["root", "https://arrivo.example.com"], {})).toBe(1);
    expect(err).toEqual([ADMIN_RECOVERY_USAGE]);
    expect(connect).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid-username", /valid username/],
    ["invalid-origin", /base URL/],
    ["forbidden", /refused/],
    ["app-unavailable", /not set up/],
    ["changed-state", /No completed admin/],
    ["retry", /again/],
  ])("explains a %s refusal, exits non-zero and closes the connection", async (reason, message) => {
    issue.mockResolvedValue({ ok: false, reason });
    expect(await run(["root", "https://arrivo.example.com"])).toBe(1);
    expect(err.join("\n")).toMatch(message);
    expect(out).toEqual([]);
    expect(close).toHaveBeenCalledOnce();
  });

  it("closes the connection when issuance throws", async () => {
    issue.mockRejectedValue(new Error("db down"));
    await expect(run(["root", "https://arrivo.example.com"])).rejects.toThrow("db down");
    expect(close).toHaveBeenCalledOnce();
  });

  it("owns exactly one postgres connection by default and ends it", async () => {
    end.mockResolvedValue(undefined);
    const code = await runAdminRecoveryCli({
      argv: ["root", "https://arrivo.example.com"],
      env: { DATABASE_URL: "postgres://db/arrivo" },
      stdout: (line) => out.push(line),
      stderr: (line) => err.push(line),
    });
    expect(code).toBe(0);
    expect(postgres).toHaveBeenCalledWith("postgres://db/arrivo", expect.objectContaining({ max: 1 }));
    expect(drizzle).toHaveBeenCalledOnce();
    expect(end).toHaveBeenCalledOnce();
  });
});
