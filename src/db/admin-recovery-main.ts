// Bundled to /app/admin-recovery.mjs: `docker exec arrivo node /app/admin-recovery.mjs jane https://arrivo.example.com`.
import { runAdminRecoveryCli } from "./admin-recovery-cli";

runAdminRecoveryCli({
  argv: process.argv.slice(2),
  env: process.env,
  stdout: (line) => console.log(line),
  stderr: (line) => console.error(line),
}).then(
  (code) => process.exit(code),
  () => {
    // Driver errors can echo connection strings; report the class of failure only.
    console.error("Admin recovery failed.");
    process.exit(1);
  }
);
