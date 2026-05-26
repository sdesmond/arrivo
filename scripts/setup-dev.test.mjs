import { describe, expect, it } from "vitest";

describe("setup-dev helpers", async () => {
  const { buildBMadInstallArgsForTest, buildSetupPlan, mergeEnvForSetup, readBMadManifestForTest } =
    await import("./setup-dev.mjs");

  it("defaults to auto database mode", () => {
    expect(buildSetupPlan([])).toEqual({
      requestedDatabaseMode: "auto",
      platform: process.platform,
    });
  });

  it("accepts an explicit database mode", () => {
    expect(buildSetupPlan(["--db=local"], "win32")).toEqual({
      requestedDatabaseMode: "local",
      platform: "win32",
    });
  });

  it("rejects unsupported database modes", () => {
    expect(() => buildSetupPlan(["--db=sqlite"])).toThrow('Unsupported database mode "sqlite"');
  });

  it("merges env values and generates a real secret", () => {
    const baseExample = [
      "DATABASE_URL=postgres://packt:packt@localhost:5432/packt",
      "E2E_DATABASE_URL=postgres://packt:packt@localhost:5432/packt_e2e",
      "NEXTAUTH_URL=http://localhost:3000",
      "NEXTAUTH_SECRET=change-me-32-bytes-min",
      "ALLOW_SIGNUP=true",
      "E2E_EMAIL=e2e@packt.local",
      "E2E_PASSWORD=e2e1234",
      "HIDE_OVERLAY=true",
      "BLOB_READ_WRITE_TOKEN=",
      "",
    ].join("\n");

    const merged = mergeEnvForSetup(baseExample, "NEXTAUTH_URL=http://localhost:4000\nALLOW_SIGNUP=false\n");

    expect(merged).toContain("DATABASE_URL=postgres://packt:packt@localhost:5432/packt");
    expect(merged).toContain("E2E_DATABASE_URL=postgres://packt:packt@localhost:5432/packt_e2e");
    expect(merged).toContain("NEXTAUTH_URL=http://localhost:4000");
    expect(merged).toContain("ALLOW_SIGNUP=false");
    expect(merged).toContain("UPLOAD_STUB=true");

    const secretLine = merged.split("\n").find((line) => line.startsWith("NEXTAUTH_SECRET="));
    const secret = secretLine?.slice("NEXTAUTH_SECRET=".length) ?? "";
    expect(secret).not.toBe("change-me-32-bytes-min");
    expect(secret.length).toBeGreaterThanOrEqual(43);
  });

  it("keeps a real blob token and disables stub uploads by default", () => {
    const example = "BLOB_READ_WRITE_TOKEN=\n";
    const merged = mergeEnvForSetup(example, "BLOB_READ_WRITE_TOKEN=token-123\n");

    expect(merged).toContain("BLOB_READ_WRITE_TOKEN=token-123");
    expect(merged).toContain("UPLOAD_STUB=false");
  });

  it("parses the repo-style BMad manifest structure", () => {
    const manifest = readBMadManifestForTest(
      [
        "installation:",
        "  version: 6.6.0",
        "modules:",
        "  - name: core",
        "    version: 6.6.0",
        "    source: built-in",
        "  - name: bmm",
        "    version: 6.6.0",
        "    source: built-in",
        "  - name: bmb",
        "    version: v1.8.0",
        "    source: external",
        "    channel: stable",
        "  - name: tea",
        "    version: v1.17.0",
        "    source: external",
        "    channel: stable",
        "ides:",
        "  - claude-code",
        "",
      ].join("\n")
    );

    expect(manifest.installation.version).toBe("6.6.0");
    expect(manifest.modules).toHaveLength(4);
    expect(manifest.modules[2]).toMatchObject({
      name: "bmb",
      version: "v1.8.0",
      source: "external",
      channel: "stable",
    });
    expect(manifest.ides).toEqual(["claude-code"]);
  });

  it("builds a pinned BMad install command from the manifest", () => {
    const args = buildBMadInstallArgsForTest(
      [
        "installation:",
        "  version: 6.6.0",
        "modules:",
        "  - name: core",
        "    version: 6.6.0",
        "  - name: bmm",
        "    version: 6.6.0",
        "  - name: bmb",
        "    version: v1.8.0",
        "  - name: tea",
        "    version: v1.17.0",
        "  - name: cis",
        "    version: v0.2.0",
        "ides:",
        "  - claude-code",
        "",
      ].join("\n")
    );

    expect(args).toEqual([
      "-y",
      "bmad-method@6.6.0",
      "install",
      "--yes",
      "--action",
      "update",
      "--modules",
      "bmm,bmb,tea,cis",
      "--tools",
      "claude-code",
      "--pin",
      "bmb=v1.8.0",
      "--pin",
      "tea=v1.17.0",
      "--pin",
      "cis=v0.2.0",
    ]);
  });
});
