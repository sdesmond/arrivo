# Architecture evidence review

Reviewed 2026-10-24. Lens: configured technology/version and existing-reality verification.

## Verdict

Evidence gate passes with one medium security-guidance clarification. No unsupported technology selection, invented version, required upgrade, or starter assumption found. Architecture intentionally changes lifecycle behavior rather than claiming missing capabilities already exist.

## Finding E-1 — Carry password policy and abuse controls into new credential flows

**Severity:** Medium. **Location:** AD-3, AD-4, AD-5 / public credential route convention.

The cited OWASP guidance requires reset passwords to follow existing application password policy and calls for protection against token guessing. New CLI recovery additionally verifies a short MFA code. The spine fixes token entropy and atomic completion but does not explicitly bind these new entry points to shared password validation or throttled verification. Two implementations could independently choose weaker password rules or leave recovery MFA verification unthrottled while both satisfying the current rules.

Existing code demonstrates why reuse must be deliberate: `src/app/(auth)/actions.ts` validates signup passwords; `src/lib/authorize-credentials.ts` orchestrates throttling around password and second-factor verification; `src/lib/mfa.ts` provides verification primitives without itself applying throttle policy. The new recovery service cannot inherit those controls merely by reusing primitives.

**Suggested fix:** State that bootstrap, setup, reset and recovery use the same server-enforced password policy, and that token exchange/completion and replacement-MFA verification use bounded shared abuse controls. Invalid link responses should disclose no account state. Keep security throttling distinct from optional Activity logging; an Activity failure must not disable authorization controls.

Source: [OWASP Forgot Password guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html), URL Tokens and User Resets Password sections. This finding does not reopen user-approved trusted-LAN HTTP support.

## Evidence checked

| Claim / decision | Evidence | Result |
| --- | --- | --- |
| Existing application versions | `package-lock.json`: Next.js 16.2.4, next-auth 5.0.0-beta.31, drizzle-orm 0.45.2, postgres 3.4.9 | Exact matches; retained baseline is not described as latest. |
| Node 22 / PostgreSQL 17 topology | `Dockerfile` uses Node 22 Alpine; `docker-compose.yml` uses PostgreSQL 17 Alpine and persistent storage | Existing deployment ratified; no new runtime/provider. |
| Nonblocking post-response `after` | Version-matched `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md`; [current Next.js reference](https://nextjs.org/docs/app/api-reference/functions/after) | Stable since 15.1; Node and Docker supported. Captured context and accepted shutdown loss fit documented lifecycle. |
| Existing account/session revocation | `src/auth.ts`, `src/lib/session-version.ts`, `src/lib/authorize-credentials.ts` | DB session version and trusted-browser policy are real. New version binding for unfinished proofs is an explicit extension, not an existing guarantee. |
| Shared locks / migration serialization | `src/lib/server-action-locks.ts`, `src/db/migrate.ts`; [PostgreSQL 17 locking](https://www.postgresql.org/docs/17/explicit-locking.html) | Existing transaction/lock patterns support proposed serialization boundaries. New instance record is explicitly new. |
| Atomic deletion / storage boundary | `src/app/(app)/profile/actions.ts`, `src/lib/storage/storage-adapter.ts` | Existing self-service transaction and post-commit cleanup are real. Adapter health/usage are planned extensions; current interface does not claim them. |
| Hashed random authorizations | OWASP source above | Purpose-bound, securely generated, expiring single-use design fits guidance; numeric entropy floor is an engineering selection rather than an OWASP quotation. |
| Recovery CLI packaging / environment | `src/db/mfa-reset-cli.ts`, `docker/entrypoint.sh`, `Dockerfile`; [Docker exec documentation](https://docs.docker.com/reference/cli/docker/container/exec/) | Existing immediate-clear tool is correctly identified. Exec inherits container-created environment, supporting issuance without relying on later entrypoint exports. |
| Real security clock | `src/lib/auth-throttle.ts` | Explicit existing exception to simulated itinerary time, correctly preserved. |

Trusted configured HTTP LAN origins are a user-approved compatibility choice; HTTPS for public access is preserved. This differs deliberately from OWASP's blanket HTTPS recommendation and should not be presented as strict full compliance. The current spine makes that distinction without claiming new proxy configuration is required for Activity.

No source/runtime edits performed by this review.
