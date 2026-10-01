# Reality-Check Review — architecture-trip-contributors-2026-08-31

**Lens:** reality-check (verify committed technical decisions were web-researched/reality-checked, not asserted from training data)
**Target:** `ARCHITECTURE-SPINE.md`
**Reviewed against:** `_bmad-output/project-context.md`, `_bmad-output/specs/spec-trip-contributors/SPEC.md`
**Date:** 2026-08-31

## Verdict

Confirmed-fine on both pinned-version and SSE-mechanism claims; no BLOCKING findings — the spine's two literal factual claims check out against live sources, and the remaining unverified-but-asserted items are reasonable design tradeoffs rather than errors, with one worth a one-line caveat before build.

---

## 1. Stack table pinned versions (nodemailer, @types/nodemailer)

**Tier: Confirmed fine.**

Checked directly against the npm registry rather than trusting the spine's "web-verified current" annotation:

- `GET https://registry.npmjs.org/nodemailer/latest` → `"version": "9.1.0"`. Matches spine's `^9.1.0` exactly.
- `GET https://registry.npmjs.org/@types/nodemailer/latest` → `"version": "8.0.1"`. Matches spine's `^8.0.1` exactly.
- Also checked whether `@types/nodemailer` is still necessary at all (nodemailer sometimes ships its own `.d.ts` in later majors, which would make the `@types` package dead weight): pulled `nodemailer@9.1.0`'s `package.json` — no `"types"`/`"typings"` field, plain JS package. `@types/nodemailer` is still required. The spine's dependency choice and both pins are correct as written.

No issue. This is the one part of the spine that already cites its own verification ("web-verified current") and the citation holds up.

## 2. AD-4 / Stack claim: Next.js 16 Route Handler can return `text/event-stream` via `ReadableStream` with no extra library

**Tier: Confirmed fine, with one caveat worth folding into AD-4 or the Structural Seed comment.**

Verified against the live Next.js docs (`nextjs.org/docs/app/guides/streaming`, version stamped 16.3.3, updated 2026-08-25 — i.e., current for this stack's Next 16.2.4+):

- The docs have a dedicated "Streaming in Route Handlers" section showing exactly this pattern: a `ReadableStream` + `TextEncoder`, returned as `new Response(stream, { headers: { 'Content-Type': ... } })`, explicitly called out for "Server-Sent Events" as a use case. No additional package involved.
- The docs' own "Platform support" table lists **Docker container: Yes** for this streaming approach (Static export is the only "No"). Packt's self-hosted-via-Docker target is directly covered.
- Confirmed via a second search that Next.js 15+ changed the default so **GET Route Handlers are no longer cached by default** (the Next 14 behavior the spine's author would need to have unlearned). This actually removes a foot-gun: on Next 14 a naive SSE route could get cache-wrapped and need an explicit `export const dynamic = 'force-dynamic'` opt-out; on Next 16 that's not the default trap. The spine doesn't mention `dynamic` at all, and per current docs it doesn't need to — this route is already dynamic in practice because it calls `requireUser()`/reads cookies before subscribing.

**Caveat (not blocking, worth one line in AD-4):** the docs explicitly warn that reverse proxies (nginx) buffer responses by default and recommend setting `X-Accel-Buffering: no`, and that compression layers can add latency to first-chunk delivery. For a self-hosted Docker deployment, whether nginx (or another reverse proxy) sits in front of the container is an environment detail the spine doesn't address — AD-4/Deferred should note the `X-Accel-Buffering: no` header (or equivalent) as a follow-up if/when a reverse-proxy is placed in front of this route, since without it the "live" in "live sync" could silently degrade to proxy-buffered near-polling in some self-hosted setups. This is an operational footnote, same tier as the spine's existing "SMTP provider selection/deliverability" deferred item — not a design flaw.

## 3. Other decisions checked for asserted-vs-verified risk

**In-process `Map`/`globalThis` pub-sub for single-container (AD-5) — Tier: Fine, correctly scoped, not something that needed external verification.**
This is an internal architectural tradeoff, not a factual claim about the world — it mirrors the codebase's own existing `db/index.ts` `globalThis.__pgClient` singleton pattern, and the spine explicitly scopes it to single-instance and defers Redis/pub-sub to a stated Deferred item if horizontal scale ever happens. Nothing here needed a web check; the risk (multi-instance breaks it) is already named. One thing worth confirming operationally rather than architecturally: that the eventual Docker Compose/production setup doesn't run `next start` under a process manager with cluster/multiple workers (e.g., PM2 cluster mode) — that would silently break AD-5's single-instance assumption without changing "container count." Not a spine defect; flag as a deploy-config constraint to carry into the Docker/PM2 setup docs, not a re-architecture.

**SMTP via nodemailer for a self-hosted Docker target (AD-6) — Tier: Fine, sensible default, no verification needed.**
This is a "don't add a SaaS dependency where none exists" judgment call consistent with the project's existing storage-adapter posture (`STORAGE_PROVIDER`/self-hosted-first pattern per `project-context.md`), not a claim that could be wrong the way a version number or API surface claim could be. No external fact to check here.

**`crypto.randomBytes(32)` + `sha256` for invitation token hashing (AD-3) — Tier: Fine, and correctly reasoned (not merely asserted).**
This is a case where the spine's reasoning is actually right in a way that's easy to get wrong by pattern-matching to `users.passwordHash`: hashing a **high-entropy random token** with a fast hash (SHA-256) is standard/correct practice, unlike hashing a **low-entropy user password**, which needs a slow/salted KDF (bcrypt/scrypt/argon2) specifically to resist offline brute-force. The spine's AD-3 justification text ("same reasoning that already governs `users.passwordHash`") slightly overstates the parallel — the mechanism differs (fast hash is fine here, would not be fine for passwords) even though the *motivation* (don't store live secrets in plaintext) is the same. Not wrong, just a one-line rationale that could confuse a future reader into thinking SHA-256 is also fine for passwords. Consider tightening that sentence, but this is a wording nit, not a technical defect.

---

## Summary Table

| # | Item | Tier | Outcome |
|---|------|------|---------|
| 1 | nodemailer `^9.1.0` / `@types/nodemailer` `^8.0.1` pins | Confirmed fine | Verified live against npm registry; exact match; `@types` package still needed (nodemailer ships no own types) |
| 2 | Next 16 Route Handler SSE via `ReadableStream`, no library | Confirmed fine | Verified against current Next.js 16 docs incl. Docker platform-support row; minor reverse-proxy buffering caveat worth a Deferred-style note |
| 3 | In-process pub-sub (AD-5) | Fine as scoped | Design tradeoff, not a factual claim; risk already named in spine; add PM2/cluster-mode caveat to deploy docs, not architecture |
| 4 | SMTP/nodemailer fit (AD-6) | Fine | Judgment call consistent with existing self-hosted posture; nothing externally verifiable to check |
| 5 | Token hashing (AD-3) | Fine, reasoning slightly loose | SHA-256-for-high-entropy-token is correct; the "same reasoning as passwordHash" line conflates a fast-hash-appropriate case with a slow-hash-required case — wording nit only |
