import { describe, expect, it } from "vitest";

describe("run-e2e helpers", async () => {
  const { buildRunE2EPlan, buildPlaywrightArgs, isManagedAppServer, interpretAffectedOutput } =
    await import("./run-e2e.mjs");

  it("defaults to kill mode on port 3001", () => {
    expect(buildRunE2EPlan([])).toEqual({
      ui: false,
      port: 3001,
      serverMode: "kill",
      affected: false,
      full: false,
      grep: undefined,
    });
  });

  it("accepts ui, custom port, and reuse mode", () => {
    expect(buildRunE2EPlan(["--ui", "--port=3100", "--server=reuse"])).toMatchObject({
      ui: true,
      port: 3100,
      serverMode: "reuse",
    });
  });

  it("accepts affected, full, and explicit grep flags", () => {
    expect(buildRunE2EPlan(["--affected"])).toMatchObject({ affected: true, full: false, grep: undefined });
    expect(buildRunE2EPlan(["--affected", "--full"])).toMatchObject({ affected: true, full: true });
    expect(buildRunE2EPlan(["--grep=@feat:packing-tab"])).toMatchObject({ grep: "@feat:packing-tab" });
  });

  it("rejects unsupported server modes", () => {
    expect(() => buildRunE2EPlan(["--server=restart"])).toThrow('Unsupported server mode "restart"');
  });

  it("rejects unknown flags", () => {
    expect(() => buildRunE2EPlan(["--nope"])).toThrow('Unsupported argument "--nope"');
  });

  it("interprets affected-e2e output into full, skip, or grep", () => {
    expect(interpretAffectedOutput("FULL")).toEqual({ mode: "full" });
    expect(interpretAffectedOutput("")).toEqual({ mode: "full" });
    expect(interpretAffectedOutput("   ")).toEqual({ mode: "full" });
    expect(interpretAffectedOutput("NONE")).toEqual({ mode: "skip" });
    expect(interpretAffectedOutput("@feat:trips|@feat:auth")).toEqual({
      mode: "grep",
      grep: "@feat:trips|@feat:auth",
    });
    expect(interpretAffectedOutput("  @feat:spending  ")).toEqual({ mode: "grep", grep: "@feat:spending" });
  });

  it("threads grep into the playwright args only when present", () => {
    expect(buildPlaywrightArgs(false, undefined)).toEqual(["playwright", "test"]);
    expect(buildPlaywrightArgs(true, undefined)).toEqual(["playwright", "test", "--ui"]);
    expect(buildPlaywrightArgs(false, "@feat:trips|@feat:auth")).toEqual([
      "playwright",
      "test",
      "--grep",
      "@feat:trips|@feat:auth",
    ]);
  });

  it("recognizes an Arrivo-owned Next server on the target port", () => {
    const rootDir = "C:/Users/spenc/dev/arrivo";

    expect(
      isManagedAppServer(
        {
          pid: 1234,
          name: "node.exe",
          commandLine:
            '"C:\\Program Files\\nodejs\\node.exe" C:\\Users\\spenc\\dev\\arrivo\\node_modules\\next\\dist\\bin\\next dev -p 3001',
        },
        rootDir
      )
    ).toBe(true);
  });

  it("recognizes Next's start-server.js child even though its command line omits the port", () => {
    const rootDir = "C:/Users/spenc/dev/arrivo";

    expect(
      isManagedAppServer(
        {
          pid: 4321,
          name: "node.exe",
          commandLine:
            '"C:\\Program Files\\nodejs\\node.exe" C:\\Users\\spenc\\dev\\arrivo\\node_modules\\next\\dist\\server\\lib\\start-server.js',
        },
        rootDir
      )
    ).toBe(true);
  });

  it("refuses to manage a foreign process on the port", () => {
    const rootDir = "C:/Users/spenc/dev/arrivo";

    expect(
      isManagedAppServer(
        {
          pid: 5678,
          name: "python.exe",
          commandLine: '"C:\\Python\\python.exe" -m http.server 3001',
        },
        rootDir
      )
    ).toBe(false);
  });
});
