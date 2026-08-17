# Rubric Review — ARCHITECTURE-SPINE.md (packt-storage-adapter)

Reviewed: `_bmad-output/planning-artifacts/architecture/architecture-packt-2026-08-16/ARCHITECTURE-SPINE.md`
Cross-checked against: `.memlog.md` (same dir) and the live codebase (`src/lib/upload-policy.ts`, `src/lib/local-upload.ts`, the 6 named action files, `src/db/index.ts`, `next.config.ts`, `eslint.config.mjs`, `playwright.config.ts`, `tests/e2e/global-setup.ts`, `src/components/packt/doc-viewer.tsx`).

## Verdict

Solid on the core file-I/O abstraction — all 8 ADs accurately describe and correctly ratify the brownfield code they bind to — but **not yet complete build substrate**: it misses one real divergence point (cleanup eligibility for non-adapter-owned cover-image URLs) and silently drops one decision the memlog already made (E2E storage environment strategy). Both should be resolved before this is handed to implementation.

---

## 1. Do AD-1–AD-8 fix the real divergence points? Any missed?

Confirmed accurate against the codebase: AD-1's "6 action files" list is exactly right (`document-upload-actions.ts`, `cover-upload-actions.ts`, `reservation-document-actions.ts`, `trips/[tripId]/actions.ts`, `trips/actions.ts`, `trips/[tripId]/reservations/actions.ts`), all still hand-roll the `UPLOAD_STUB` if/else exactly as described. AD-6's "two independent copies" claim is exactly right — `getEventTripId` is duplicated verbatim in `trips/[tripId]/actions.ts` and `document-upload-actions.ts`; `getReservationTripId` lives only in `reservation-document-actions.ts`. AD-4's "swallow-and-warn" pattern is a precise match for the existing `del(...).catch((cleanupError) => console.warn(...))` in `cover-upload-actions.ts`.

**[MAJOR] Missed divergence point: no del()-eligibility convention for non-adapter-owned cover URLs.**
`trips.coverImageUrl` is not exclusively adapter-produced. Reading `src/app/(app)/trips/actions.ts:290-345` and `src/app/(app)/trips/[tripId]/actions.ts:423-440` shows three sources at trip-creation/cover-change time:
- `deriveGraphicCover(name)` — a locally-derived, non-file value
- `searchCoverImages(destinationName)` — an external stock-photo API; `coverUrl = firstImage?.url` is a raw third-party URL, never touches `upload-policy.ts` or any adapter
- an inline Mapbox static-tile fetch that currently calls `@vercel/blob`'s `put()` directly (`trips/actions.ts:320-322`) — itself an undocumented 7th direct-blob call site, just one that happens to live inside a file already on AD-1's binds list
- only `cover-upload-actions.ts`'s user-upload path is genuinely adapter-shaped

Today, `cover-upload-actions.ts:45` guards its previous-cover cleanup with `isBlobUploadUrl(previousUrl)` specifically so it never tries to `del()` a stock-photo or graphic-derived URL. AD-3/AD-4 state that `del(url)` "parses its own key back out of the url it produced," but never say how a call site decides whether a given stored URL was ever produced by an adapter *before* calling `del()` on it. Without an equivalent convention, two independently-built cleanup call sites will diverge: one may reinvent an ad hoc `isBlobUploadUrl`-style guard (recreating the exact per-call-site duplication AD-1 exists to eliminate), another may call `adapter.del(previousUrl)` unconditionally and crash or silently misbehave on an Unsplash-style URL that doesn't match the local adapter's `/api/storage/<key>` shape.

**Fix suggestion:** add a line to AD-3 or AD-4 (or a new AD-9) establishing who owns "is this URL ours to delete" — e.g. a shared predicate colocated with the port, checked against the current provider's known URL shape, used by every replace/cleanup call site instead of each reinventing it.

No other missed divergence points found — AD-1 through AD-8 otherwise cover the real seams (I/O access, key naming, URL vs key storage, single-backend discipline, proxy auth, shared trip-id resolution, singleton resolution, loud permission failures).

## 2. Is every AD's Rule enforceable and does it prevent its stated Prevents?

AD-2 through AD-8: yes — each Rule is either structurally enforced (schema shape for AD-3, file placement + singleton pattern for AD-7, one module owning the resolver for AD-6) or a narrow, single-owner discipline rule with low realistic divergence risk (AD-2, AD-5, AD-8).

**[MINOR] AD-1's enforcement is discipline-only.** `eslint.config.mjs` currently has no `no-restricted-imports` (or equivalent) rule — "No call site imports `@vercel/blob`, `node:fs`, or any backend SDK directly" is not mechanically enforced anywhere. Every other AD in this doc is backed by something structural (a type, a file layout, a singleton pattern); AD-1 is the one exception, and it's also the AD with the most call sites (6 files) most likely to regress silently over time. Worth a one-line note that a scoped `no-restricted-imports` rule is the natural enforcement mechanism, even if not required to land in this round.

**[MINOR/NOTE] AD-6's proxy route needs an unstated reverse mapping.** The catch-all route (`[...path]/route.ts`) only has the literal key segments (e.g. `event-documents/<id>/<uuid>.ext`), not the typed `UploadScope` union value `resolveOwningTripId(scope, ownerId)` expects. Something has to invert `UPLOAD_SCOPE_PREFIXES` (scope-prefix string → `UploadScope`) before the route can call the resolver. This is a small, single-natural-home piece of logic (belongs next to the resolver), so real divergence risk is low, but it's currently unstated in AD-6 and worth a one-line callout so it isn't invented twice.

## 3. Does anything under "Deferred" need a decision now?

No. Checked each item against what AD-1–AD-8 already lock down:
- S3-compatible adapter — the port's `read()` requirement already keeps proxying possible later; deferring the S3 auth posture doesn't let the *local* adapter diverge, since AD-5 explicitly scopes its auth-gate requirement to local only.
- Migration script / orphaned-files-across-switch — both depend on AD-4's "single active backend, redeploy-to-switch" model, which is already decided; nothing here is load-bearing before real multi-backend data exists.
- Image resize/optimization, Vercel Blob adapter — genuinely out of scope given the confirmed full Vercel→Docker cutover decision.
- `STORAGE_LOCAL_ROOT_DIR` naming — cosmetic, single-owner (the adapter file itself), fine to leave to code.

## 4. Named tech plausibility

`node:fs/promises` — correct, already in use by `local-upload.ts`. `@aws-sdk/client-s3` is explicitly flagged "not pinned, verify when built" — appropriately deferred, not this reviewer's job to re-verify per instructions.

## 5. Does it ratify the brownfield codebase?

Yes, on everything checked directly:
- `upload-policy.ts`'s `UploadScope`, `UPLOAD_SCOPE_PREFIXES`, and `createUploadStorageName()` match AD-2's description exactly (`{scope-prefix}/{ownerId}/{uuid}.{ext}`).
- `src/db/index.ts`'s `globalThis.__pgClient` pattern matches what AD-7 says it mirrors (note: the real pattern only re-caches on `globalThis` when `NODE_ENV !== "production"`, relying on Node's module cache in prod; AD-7's rule doesn't call this nuance out, but it's a harmless simplification, not a contradiction — flagging as trivia, not a finding).
- `documents.url` / `trips.coverImageUrl` are plain `text` columns in `src/db/schema.ts` with no companion key column, matching AD-3.
- `local-upload.ts`'s `isBlobUploadUrl`/`isLocalUploadUrl` existing purely for cleanup-eligibility (as the memlog itself notes) is exactly the gap identified in Finding 1 above — the spine correctly identifies these functions' current purpose in the memlog but doesn't carry an equivalent forward into the ADs.

## 6. Is every structural dimension addressed (esp. operational/environmental envelope)?

Deployment target is well covered: Docker/PUID-PGID/bind-mount diagram, `STORAGE_PROVIDER` env selector, AD-8's fail-loud EACCES handling.

**[MAJOR] E2E storage environment strategy: decided in memlog, absent from the spine.** `.memlog.md` line 15 records a clear, already-made decision: *"E2E retires UPLOAD_STUB entirely once StorageAdapter exists - E2E runs the real local-filesystem adapter with STORAGE_PROVIDER=local pointed at an E2E-scoped root dir, exercising the real code path instead of a parallel stub."* The spine never mentions E2E, `UPLOAD_STUB`, or an E2E storage root anywhere (grep confirms `UPLOAD_STUB` appears exactly once, only inside AD-1's "Prevents" clause, as something being replaced). Concretely, `playwright.config.ts:35` sets `UPLOAD_STUB: "true"` in the E2E webServer env today — that line has to change as part of implementing this spine, and nothing here says what it changes to, whether the E2E-scoped root directory gets truncated/reset between runs the way `global-setup.ts` already does for the DB, or how AD-8's loud-EACCES behavior is expected to behave in CI (where PUID/PGID bind-mount semantics don't apply the same way as the Docker target). This is exactly the kind of environmental-envelope item the altitude is supposed to own, and it's worse than "silently unaddressed" — it's a decision that was already reached and then dropped in distillation. Should be restored, at minimum as a Deferred line with reasoning, ideally as a short consistency-convention entry (E2E env: `STORAGE_PROVIDER=local`, `STORAGE_LOCAL_ROOT_DIR=<e2e-scoped path>`, reset-between-runs story).

No other envelope gaps found — provider strategy (single active backend via env), infra target (self-hosted Docker), and operations (fail-loud on misconfig, orphan tolerance) are all explicitly decided or explicitly deferred with reasons.

## 7. Terseness / template hygiene

Clean. No leftover placeholder text, no empty sections, consistent Binds/Prevents/Rule structure across all 8 ADs, both mermaid diagrams are relevant and non-decorative, Stack/Consistency Conventions/Structural Seed tables are all filled in rather than stubbed. Appropriately terse for a build substrate.

**[MINOR] AD-3's "no next/image" claim is factually wrong against the current codebase.** `src/components/packt/doc-viewer.tsx:216` renders document URLs via `next/image` (`<Image src={url} ... unoptimized ... />`), not a plain `<img>`. Functionally harmless — `unoptimized` sidesteps the `remotePatterns` concern AD-3 is actually trying to avoid, and proxy-relative or external URLs both render fine through it — but the AD's stated rationale doesn't match reality and should either be corrected or reconciled with the existing `doc-viewer.tsx` usage.

---

## Summary of Findings

| # | Severity | Finding |
|---|----------|---------|
| 1 | MAJOR | No convention for whether a stored cover-image URL was ever adapter-produced before calling `del()` on it — `trips.coverImageUrl` can be a stock-photo URL, a derived-graphic value, or an adapter upload; today's `isBlobUploadUrl()` guard has no stated successor. |
| 2 | MAJOR | E2E storage environment strategy (`STORAGE_PROVIDER=local` + E2E-scoped root dir, retiring `UPLOAD_STUB` in `playwright.config.ts`) was decided in `.memlog.md` but never made it into the spine. |
| 3 | MINOR | AD-1 ("no call site imports `@vercel/blob`/`node:fs` directly") has no lint-level enforcement mechanism (`eslint.config.mjs` has no `no-restricted-imports`), unlike every other AD which is structurally backed. |
| 4 | MINOR | AD-3's "no next/image" claim is contradicted by `doc-viewer.tsx`'s existing `unoptimized` `next/image` usage (harmless in practice, but factually inaccurate as written). |
| 5 | NOTE | AD-6's proxy route needs an unstated reverse mapping from key scope-prefix back to `UploadScope` before it can call `resolveOwningTripId()` — low divergence risk, worth one line. |

File reviewed: `C:\Users\spenc\dev\packt\_bmad-output\planning-artifacts\architecture\architecture-packt-2026-08-16\ARCHITECTURE-SPINE.md`
