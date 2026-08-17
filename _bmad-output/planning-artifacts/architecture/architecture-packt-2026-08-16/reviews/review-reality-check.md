# Reality-Check Review — packt-storage-adapter Architecture Spine

Target: `_bmad-output/planning-artifacts/architecture/architecture-packt-2026-08-16/ARCHITECTURE-SPINE.md`
Reviewer pass: verify every committed technical claim against the actual codebase and, where the claim is external (Docker convention), against current web sources rather than training-data recall.

## Verdict

Mostly reality-checked and accurate against the codebase, but ships one factual error that a developer would trip over immediately (AD-3's "no next/image" claim is false for the existing document viewer) and one meaningfully overstated external claim (PUID/PGID is presented as a turnkey property of "the container" when it actually requires entrypoint plumbing this repo doesn't have yet).

## Findings

### HIGH — AD-3's "no next/image" claim is false for existing document rendering

AD-3 states: *"`put()` returns the final URL consumers render as-is (plain `<img src>` / `<a href>`, no `next/image`, no `remotePatterns`)."*

Checked `src/components/packt/doc-viewer.tsx` (the component that renders `doc.url` — exactly the field `put()` populates for documents): it imports `next/image` and renders image-kind documents via `<Image src={url} alt={doc.name} fill unoptimized style={{ objectFit: "contain" }} />` (lines 4, 214–218).

- The "no `remotePatterns`" half is *accidentally* true only because `unoptimized` is set, which bypasses the Next.js image optimizer (and therefore the need for `remotePatterns`) — but that's a different reason than the spine gives.
- The "no `next/image`" half is simply wrong: `next/image` is already in the render path for document images today.
- Cover images (`src/components/packt/trip-cover.tsx`) *do* use a plain `<img>` (lines 87–106), so the claim is accurate for that one call site but not for documents. The spine states it as a blanket rule across "consumers."

Why this matters: AD-3 is `[ADOPTED]` and will read as ground truth to whoever implements the adapter. If a future story points at doc-viewer.tsx to "clean up" the next/image usage on the strength of this line, that's an unrequested, unreviewed behavior change riding on a wrong premise. At minimum this line needs to say "no *new* next/image usage is required by this design" rather than asserting none exists.

**Fix:** correct AD-3's parenthetical, or explicitly carve out `doc-viewer.tsx`'s existing `unoptimized` `next/image` usage as out-of-scope/unaffected.

### MEDIUM — AD-7's "mirrors `globalThis.__pgClient`" glosses over a production-mode difference

`src/db/index.ts` (verified, full file):

```ts
const client = globalThis.__pgClient ?? postgres(process.env.DATABASE_URL!);
if (process.env.NODE_ENV !== "production") globalThis.__pgClient = client;
```

The global is only *written* outside production. In production, the module constructs a fresh `postgres()` client on every module evaluation and never caches it on `globalThis` — the caching exists specifically to survive Next.js dev-mode hot-reload module re-execution, not as a general-purpose production singleton.

AD-7 says the new resolver "caches the instance on `globalThis`" full stop, with no NODE_ENV gating mentioned. That's a fair paraphrase of intent ("hot-reload-survival") but not an accurate mirror of the actual code shape. Two readings are now possible for whoever implements `getStorageAdapter()`:
1. Always cache on `globalThis` (diverges from the pattern it claims to mirror), or
2. Also gate on `NODE_ENV !== "production"` (matches the db pattern exactly, but the spine doesn't say so).

**Fix:** either state explicitly whether the `NODE_ENV` gate is part of what's being mirrored, or acknowledge the resolver intentionally caches unconditionally (a legitimate choice, since a storage adapter singleton is cheaper/safer to keep across all environments than a DB client) and say so rather than calling it a mirror.

### MEDIUM — PUID/PGID is real and current, but the spine understates what "runs as PUID:PGID" requires

Confirmed via LinuxServer.io's own current docs (`docs.linuxserver.io/general/understanding-puid-and-pgid`) that PUID/PGID remains their live, actively-recommended convention for non-root containers writing to bind mounts — they explicitly say they still recommend it over Docker's newer `--user` flag due to compatibility gaps in their images. So the underlying convention is not stale; the brainstorm's sourcing (a third-party Spoolman/Synology guide) happens to point at something still accurate in 2026.

What's missing: PUID/PGID only works because the *image* does something with it — LinuxServer.io images ship an s6-overlay init that starts as root, remaps the `abc` user's UID/GID at boot, `chown`s as needed, then drops privileges to run the app. That plumbing lives in the Dockerfile/entrypoint, not in application code. The spine's deployment diagram (line ~139: `Container["Docker container — runs as PUID:PGID"]`) and AD-8 both talk about the container as if PUID/PGID-awareness is ambient, but:
- Packt doesn't have a Dockerfile in this spine's scope, let alone one with PUID/PGID remap logic (no `usermod`/`gosu`/`su-exec`/entrypoint script is mentioned anywhere in the document).
- AD-8's mitigation ("fails loudly on `EACCES`/`EPERM` ... naming the path and pointing at a PUID/PGID mismatch") is sound defensive coding regardless, but it's treating PUID/PGID support as a precondition that already exists rather than a dependency this effort (or a sibling effort) still has to build.

This isn't wrong so much as overconfident — "the proven self-hosted-Docker convention" is true of the ecosystem pattern, but Packt doesn't get it for free just by choosing local-filesystem storage and picking env var names. Worth an explicit line (even in Deferred) noting the Dockerfile/entrypoint work required to make PUID/PGID actually take effect is a separate, unscoped dependency.

**Fix:** add a Deferred/dependency note: "PUID/PGID env vars are read by the entrypoint script, which must perform the UID/GID remap + chown; that entrypoint doesn't exist yet and is out of scope here."

### LOW / Confirmed — items independently verified true

These committed claims were checked and hold up:

- **`node:fs/promises` already used, no new dependency** — confirmed: `src/lib/local-upload.ts` line 1 imports `mkdir, writeFile` from `"node:fs/promises"`. Since it's a Node built-in, the "no new dependency" framing is trivially true regardless.
- **`globalThis.__pgClient` pattern exists** at `src/db/index.ts` as a hot-reload-survival singleton — exists, see MEDIUM finding above for the one nuance.
- **6 action files with hand-rolled `UPLOAD_STUB` branching** — confirmed by name: `document-upload-actions.ts`, `cover-upload-actions.ts`, `reservation-document-actions.ts`, `trips/[tripId]/actions.ts`, `trips/actions.ts`, `trips/[tripId]/reservations/actions.ts` all import `@vercel/blob` directly and branch on `process.env.UPLOAD_STUB === "true"` vs. `put()`.
- **"Swallow-and-warn" `del()` cleanup pattern already exists** — confirmed in `trips/[tripId]/actions.ts` (multiple `del(url).catch((err) => console.warn(...))` call sites, lines ~212, 239, 414, 720–723).
- **`getEventTripId`/`getReservationTripId` exist independently in two files** (AD-6's stated duplication) — confirmed: `getEventTripId` in `document-upload-actions.ts`, `getReservationTripId` in `reservation-document-actions.ts`, both doing their own inline lookup.
- **`createUploadStorageName()` key shape** `{scope-prefix}/{ownerId}/{uuid}.{ext}` — confirmed exact match against `src/lib/upload-policy.ts` line 85–88 implementation.
- **`@vercel/blob` is a real current dependency** — confirmed `"@vercel/blob": "^2.4.0"` in `package.json`.
- **No `next/image` `remotePatterns` configured today** — confirmed `next.config.ts` has no `images` key at all; `output: "standalone"` is already set (relevant background for the Docker deployment target, not a spine claim itself).

## Scope note

The S3-adapter SDK (`@aws-sdk/client-s3`) is explicitly *not* pinned in the Stack table and the spine says to verify its version when that Should-scope work actually starts — that's the correct move for a deferred item and needed no further checking.
