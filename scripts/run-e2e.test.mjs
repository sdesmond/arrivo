import { afterEach, describe, expect, it, vi } from "vitest";

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

describe("isolated E2E preparation", async () => {
  const { prepareE2EDatabases, getE2EServerPorts } = await import("./run-e2e.mjs");
  it("manages separate regular and bootstrap app ports", () => {
    expect(getE2EServerPorts(3001)).toEqual([3001, 3002]);
    expect(getE2EServerPorts(3100)).toEqual([3100, 3002]);
    expect(() => getE2EServerPorts(3002)).toThrow("Bootstrap E2E port 3002 must be separate");
  });
  it("validates isolation and creates derived DB before either reset", async () => {
    const calls = [];
    const source = "postgres://test:secret@example.test/arrivo_e2e?sslmode=require";
    await prepareE2EDatabases(
      source,
      async (command, connectionString) => {
        calls.push([command, new URL(connectionString).pathname]);
      },
      async () => {
        calls.push(["ensure"]);
      }
    );
    expect(calls).toEqual([
      ["ensure"],
      ["db:reset:e2e", "/arrivo_e2e"],
      ["db:migrate:e2e", "/arrivo_e2e"],
      ["db:reset:e2e", "/arrivo_e2e_bootstrap"],
      ["db:migrate:e2e", "/arrivo_e2e_bootstrap"],
    ]);
    expect(source).toBe("postgres://test:secret@example.test/arrivo_e2e?sslmode=require");
  });
  it("never resets anything when derivation or creation fails", async () => {
    const run = () => {
      throw new Error("must not reset");
    };
    await expect(prepareE2EDatabases("invalid", run)).rejects.toThrow("E2E database");
    await expect(
      prepareE2EDatabases("postgres://host/arrivo_e2e", run, async () => {
        throw new Error("creation denied");
      })
    ).rejects.toThrow("creation denied");
  });
});

describe("runner integration", async () => {
  const { main, buildPackageInvocation } = await import("./run-e2e.mjs");
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  it("prepares both ports and databases before generating and running selected tests", async () => {
    vi.stubEnv("E2E_DATABASE_URL", "postgres://host/arrivo_e2e");
    const ports = [];
    const commands = [];
    const ensureDatabase = vi.fn(async () => undefined);
    await main(["--grep=@feat:auth|@feat:instance-bootstrap"], {
      prepareServer: ({ port }) => {
        ports.push(port);
      },
      ensureDatabase,
      runPackage: (command, args, options) => {
        commands.push({ command, args, database: options.env.E2E_DATABASE_URL });
      },
    });
    expect(ports).toEqual([3001, 3002]);
    expect(ensureDatabase).toHaveBeenCalledWith("postgres://host/arrivo_e2e");
    expect(commands.slice(0, 4).map(({ args, database }) => [args[1], new URL(database).pathname])).toEqual([
      ["db:reset:e2e", "/arrivo_e2e"],
      ["db:migrate:e2e", "/arrivo_e2e"],
      ["db:reset:e2e", "/arrivo_e2e_bootstrap"],
      ["db:migrate:e2e", "/arrivo_e2e_bootstrap"],
    ]);
    expect(commands[4].args).toEqual(["bddgen"]);
    expect(commands[5].args).toEqual(["playwright", "test", "--grep", "@feat:auth|@feat:instance-bootstrap"]);
    expect(process.env.E2E_DATABASE_URL).toBe("postgres://host/arrivo_e2e");
  });
  it("rejects port collisions before preparing servers or databases", async () => {
    const prepareServer = vi.fn();
    const runPackage = vi.fn();
    await expect(main(["--port=3002", "--grep=@feat:auth"], { prepareServer, runPackage })).rejects.toThrow(
      "Bootstrap E2E port"
    );
    expect(prepareServer).not.toHaveBeenCalled();
    expect(runPackage).not.toHaveBeenCalled();
  });
  it("passes Windows grep metacharacters as literal process arguments", () => {
    const invocation = buildPackageInvocation(
      "npx",
      ["playwright", "test", "--grep", "@feat:auth|E2E scenario fixtures"],
      "win32",
      "/runtime/node.exe"
    );
    expect(invocation.command).toBe("/runtime/node.exe");
    expect(invocation.args[0].replaceAll("\\", "/")).toBe("/runtime/node_modules/npm/bin/npx-cli.js");
    expect(invocation.args.slice(1)).toEqual(["playwright", "test", "--grep", "@feat:auth|E2E scenario fixtures"]);
    expect(buildPackageInvocation("npm", ["run", "db:reset:e2e"], "linux", "/runtime/node")).toEqual({
      command: "npm",
      args: ["run", "db:reset:e2e"],
    });
  });
});
