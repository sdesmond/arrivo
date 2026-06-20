import { describe, expect, it } from "vitest";

describe("run-e2e helpers", async () => {
  const { buildRunE2EPlan, isManagedPacktServer } = await import("./run-e2e.mjs");

  it("defaults to kill mode on port 3001", () => {
    expect(buildRunE2EPlan([])).toEqual({
      ui: false,
      port: 3001,
      serverMode: "kill",
    });
  });

  it("accepts ui, custom port, and reuse mode", () => {
    expect(buildRunE2EPlan(["--ui", "--port=3100", "--server=reuse"])).toEqual({
      ui: true,
      port: 3100,
      serverMode: "reuse",
    });
  });

  it("rejects unsupported server modes", () => {
    expect(() => buildRunE2EPlan(["--server=restart"])).toThrow('Unsupported server mode "restart"');
  });

  it("recognizes a Packt-owned Next server on the target port", () => {
    const rootDir = "C:/Users/spenc/dev/packt";

    expect(
      isManagedPacktServer(
        {
          pid: 1234,
          name: "node.exe",
          commandLine:
            '"C:\\Program Files\\nodejs\\node.exe" C:\\Users\\spenc\\dev\\packt\\node_modules\\next\\dist\\bin\\next dev -p 3001',
        },
        rootDir
      )
    ).toBe(true);
  });

  it("recognizes Next's start-server.js child even though its command line omits the port", () => {
    const rootDir = "C:/Users/spenc/dev/packt";

    expect(
      isManagedPacktServer(
        {
          pid: 4321,
          name: "node.exe",
          commandLine:
            '"C:\\Program Files\\nodejs\\node.exe" C:\\Users\\spenc\\dev\\packt\\node_modules\\next\\dist\\server\\lib\\start-server.js',
        },
        rootDir
      )
    ).toBe(true);
  });

  it("refuses to manage a foreign process on the port", () => {
    const rootDir = "C:/Users/spenc/dev/packt";

    expect(
      isManagedPacktServer(
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
