// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { run } = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("./admin-recovery-cli", () => ({ runAdminRecoveryCli: run }));

async function load() {
  vi.resetModules();
  await import("./admin-recovery-main");
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("admin-recovery-main", () => {
  const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
  const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const argv = process.argv;
  beforeEach(() => {
    vi.clearAllMocks();
    process.argv = ["node", "admin-recovery.mjs", "root", "https://arrivo.example.com"];
  });
  afterEach(() => {
    process.argv = argv;
  });

  it("passes argv.slice(2) and prints through the console, exiting 0 on success", async () => {
    run.mockImplementation(async ({ stdout }) => {
      stdout("https://arrivo.example.com/account-recovery?token=abc");
      return 0;
    });
    await load();
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ argv: ["root", "https://arrivo.example.com"], env: process.env })
    );
    expect(log).toHaveBeenCalledWith("https://arrivo.example.com/account-recovery?token=abc");
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("forwards stderr and a non-zero exit code", async () => {
    run.mockImplementation(async ({ stderr }) => {
      stderr("No completed admin account matches that username.");
      return 1;
    });
    await load();
    expect(error).toHaveBeenCalledWith("No completed admin account matches that username.");
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("reports only a generic message when the run throws", async () => {
    run.mockRejectedValue(new Error("connection to db refused with secret-value"));
    await load();
    expect(error).toHaveBeenCalledWith("Admin recovery failed.");
    expect(JSON.stringify(error.mock.calls)).not.toContain("secret-value");
    expect(exit).toHaveBeenCalledWith(1);
  });
});
