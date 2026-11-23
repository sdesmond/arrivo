import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function validateTarget(connection, confirmed) {
  if (!confirmed || !connection) throw new Error("Set BENCHMARK_DATABASE_URL and pass --confirm-disposable");
  const url = new URL(connection);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.search ||
    url.hash ||
    !/^\/arrivo_benchmark_[a-z0-9_]+$/.test(url.pathname)
  )
    throw new Error("Target must be a local dedicated arrivo_benchmark_* database");
}

export function summarize(results) {
  return {
    timesMs: results.map((result) => result.elapsedMs),
    committed: results.filter((result) => result.outcome === "committed").length,
    deadlines: results.filter((result) => result.outcome === "deadline").length,
    rollbacksVerified: results.filter((result) => result.rolledBack).length,
  };
}

export function main() {
  const connection = process.env.BENCHMARK_DATABASE_URL;
  validateTarget(connection, process.argv.includes("--confirm-disposable"));
  const result = spawnSync(
    process.execPath,
    ["node_modules/vitest/vitest.mjs", "run", "--config", "scripts/benchmark-template-reorder.config.mts"],
    {
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: connection, BENCHMARK_CONFIRMED: "yes" },
    }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
