import { spawnSync } from "node:child_process";

// Isolated PowerShell port-detection helper.
//
// Spawning `pwsh` (PowerShell 7) as a spawnSync child corrupts Windows job-object state for the
// NEXT spawn in the same Node process (libuv `AssignProcessToJobObject: (87)`), which previously
// killed run-e2e.mjs right after its inline port check. Running the pwsh query inside this
// short-lived child keeps the parent (run-e2e.mjs) clean, so every later pipeline spawn succeeds.
//
// Prints the listener as compact JSON (`{ProcessId, Name, CommandLine}`) to stdout, or an empty
// string when nothing is listening on the port.

const port = process.argv[2];

if (!port || !/^\d+$/.test(port)) {
  process.stderr.write(`detect-port: invalid port "${port ?? ""}".\n`);
  process.exit(1);
}

const command = [
  "$listener = Get-NetTCPConnection -LocalPort",
  port,
  "-State Listen -ErrorAction SilentlyContinue | Select-Object -First 1;",
  "if ($null -eq $listener) { Write-Output ''; exit 0 }",
  "$process = Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -eq $listener.OwningProcess } | Select-Object -First 1;",
  "$process | Select-Object ProcessId, Name, CommandLine | ConvertTo-Json -Compress",
].join(" ");

const result = spawnSync("pwsh", ["-NoLogo", "-NoProfile", "-Command", command], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "inherit"],
});

if (result.error) {
  process.stderr.write(`detect-port: ${result.error.message}\n`);
  process.exit(1);
}

if (typeof result.status === "number" && result.status !== 0) {
  process.exit(result.status);
}

process.stdout.write(result.stdout ?? "");
