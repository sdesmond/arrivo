# Sprint Change Proposal — Serwist App-Shell Precaching

**Date:** 2026-06-22
**Project:** Packt
**Author:** Correct Course workflow

---

## Section 1: Issue Summary

### Problem Statement

The service worker / app-shell precaching layer specified in `architecture.md` is entirely absent from the project. `architecture.md` (line 113) selected Serwist (`@serwist/next`) for SW compilation, manifest injection, Turbopack-compatible build integration, and NetworkFirst/CacheFirst/StaleWhileRevalidate caching strategies. The PRD addendum states "Offline = live degraded mode, not a static export — same app shell, different data source."

None of this exists: `package.json` has `dexie`/`dexie-react-hooks` but no `@serwist/next`, no `withSerwist` wrapper in `next.config.js`, no `sw.ts` source file, and no service worker registration anywhere in `src/`.

### Root Cause

`architecture.md` line 122 explicitly calls for this to be an early implementation story: "Installing these packages and scaffolding the Serwist Next.js config + Dexie database schema should be an early implementation story, before any feature-specific sync logic is built." However, this was never translated into a story in `epics.md`. The Implementation Sequence (architecture.md lines 179–188) also listed Serwist as step 6 (after the sync engine), creating an internal contradiction that contributed to the gap.

### Symptom

Refreshing while offline hits the network for the HTML document with no service worker to intercept it, so Chrome's native offline error page renders instead of the cached app shell. Four stories of offline write/read logic (1.1–1.4) now sit on a Dexie mirror with no service worker underneath them.

### Where We Are Now

| Story | Status |
|---|---|
| 1.1 (client UUIDs) | done |
| 1.2 (data mirror) | done |
| 1.3 (offline writes) | done |
| 1.4 (full write parity) | review |
| 1.5 (connectivity indicator) | backlog |
| Epic 2 (sync/conflict) | entirely backlog |
| Epic 3 (pinning/lifecycle) | entirely backlog |

---

## Section 2: Impact Analysis

### Epic Impact

| Epic | Impact |
|---|---|
| **Epic 1** (Offline Read & Write Foundation) | Four stories done/review that assume offline app loading works. The SW scaffolding was a missing dependency — not a defect in the stories themselves. |
| **Epic 2** (Automatic Sync & Conflict Resolution) | Conflict review screen (Story 2.4) and reconnect notification assume the app can load offline. Cannot be built correctly without SW precaching first. |
| **Epic 3** (Trip Pinning & Lifecycle) | Stories 3.2/3.3 explicitly require a trip to open offline, which is impossible without a cached app shell. Blocked until Serwist scaffolding lands. |

### Artifact Conflicts

| Artifact | Conflict |
|---|---|
| **PRD** | No conflict. PRD and addendum already assume offline app shell exists. |
| **Architecture** | Internal tension: line 122 says "early" but Implementation Sequence listed it as step 6. No technology choice conflict — Serwist is still the right option. |
| **UI/UX** | No conflict. UX-DR1, UX-DR5 assume app loads offline. No spec changes needed. |
| **Other** | `package.json` needs `@serwist/next`; `next.config.js` needs `withSerwist` wrapper; `src/sw.ts` needs to be created. |

### Technical Impact

- **Missing dependency:** `@serwist/next` not installed
- **Missing config:** `next.config.js` has no `withSerwist` wrapper
- **Missing source:** No `sw.ts` — Serwist's service worker entry point
- **No manifest:** No Web App Manifest configured for install prompt
- **No SW registration:** No `register()` call in the app layout
- **No precaching:** Build does not emit `sw.js`; no assets cached for offline

---

## Section 3: Recommended Approach

### Path: Direct Adjustment

Add a new story to Epic 1 for Serwist app-shell precaching scaffolding. Do not roll back existing work — the SW layer is additive, not corrective.

**Rationale:**
- **Effort:** Low — one developer story for package install, config scaffold, and basic SW setup
- **Risk:** Low — well-maintained library, Turbopack-compatible, straightforward `withSerwist` integration
- **Timeline:** Minimal — adds one story's work before Epic 1 closes
- **Alternatives considered:** Rollback (not needed — existing stories work online); MVP scope reduction (not needed — PRD already assumes this)
- **Sequencing:** Must land before Epic 2 begins and before Epic 1 is marked done, since both Epics 2 and 3 depend on it

---

## Section 4: Detailed Change Proposals

### Change 1: Add Story 1.6 to `epics.md`

**Artifact:** `_bmad-output/planning-artifacts/epics.md`

**Action:** Insert new Story 1.6 between Story 1.5 and the Epic 2 header.

**New content:**

```
### Story 1.6: App-Shell Service Worker Precaching

As a traveler going offline,
I want the Packt app shell to load from cache when there's no network,
So that I see the app interface — not a browser error — when I refresh while offline.

**Acceptance Criteria:**

**Given** the app has no existing service worker or precaching infrastructure
**When** `@serwist/next` is installed and configured
**Then** `next.config.js` wraps the existing config with `withSerwist({ swSrc: "src/sw.ts", swDest: "public/sw.js" })`
**And** `src/sw.ts` is created with Serwist's `defaultCache` preset precaching all static assets (JS, CSS, HTML for the app shell route group)
**And** the build emits `public/sw.js` in the existing build output without requiring a separate build step
**And** a hard refresh while offline (no cached HTML prior) serves the cached app shell HTML instead of Chrome's native offline error page — verified via Playwright's `context.setOffline()` in the E2E suite
**And** the service worker registers on app load with no console errors and does not interfere with hot reload in dev
**And** `@serwist/next` version is pinned in `package.json` (targeting latest 9.x)

This story covers app-shell precaching only — it does not implement Dexie schema changes (Story 1.2), runtime caching strategies for API data, or any data-layer offline logic.
```

**Rationale:** Fills the gap `architecture.md` line 122 explicitly called for. Without this, Epics 2 and 3 cannot function.

### Change 2: Reorder Implementation Sequence in `architecture.md`

**Artifact:** `_bmad-output/planning-artifacts/architecture.md`

**Section:** Core Architectural Decisions → Decision Impact Analysis → Implementation Sequence

**Change:** Move "Serwist app-shell integration" from step 6 to step 1.

**Before:**
```
1. StorageProvider interface + both implementations
2. Client-generated UUID switch across existing create actions
3. Dexie schema + OfflineProvider scaffolding
4. Shared-core-function extraction for existing Server Actions + /api/sync Route Handler
5. Sync engine (outbox replay, conflict detection, tiered resolution)
6. Serwist app-shell integration
...
```

**After:**
```
1. Serwist app-shell integration (prerequisite for any offline-capable page load)
2. StorageProvider interface + both implementations
3. Client-generated UUID switch across existing create actions
4. Dexie schema + OfflineProvider scaffolding
5. Shared-core-function extraction for existing Server Actions + /api/sync Route Handler
6. Sync engine (outbox replay, conflict detection, tiered resolution)
...
```

**Rationale:** Aligns implementation sequence with `architecture.md`'s own line 122 directive. Serwist has no upstream dependencies and is a prerequisite for all offline page load.

### Change 3: Add Story 1.6 to `sprint-status.yaml`

**Artifact:** `_bmad-output/implementation-artifacts/sprint-status.yaml`

**Section:** `development_status.epic-1`

**Change:** Insert `1-6-app-shell-service-worker-precaching: backlog` after `1-5-connectivity-indicator-base-states: backlog`.

**Rationale:** Tracks the new story in sprint status with same initial state as 1.5.

---

## Section 5: Implementation Handoff

### Scope Classification: **Minor**

This change can be implemented directly by a Developer agent. It involves:
1. Installing `@serwist/next`
2. Wrapping `next.config.js` with `withSerwist`
3. Creating `src/sw.ts` with app-shell precaching
4. Registering the service worker in the app layout
5. Adding the Web App Manifest (if not present)
6. Applying the three artifact updates above (epics.md, architecture.md, sprint-status.yaml)
7. Verifying offline app shell loading via Playwright

### Handoff Recipients

| Role | Responsibility |
|---|---|
| **Developer agent** | Implement Story 1.6 code changes |
| **Plan reviewer** (non-negotiable gate) | Run `packt-plan-reviewer` on the story file before implementation per AGENTS.md |
| **User (Spencer)** | Final approval before implementation |

### Success Criteria

- [ ] `@serwist/next` installed and version-pinned
- [ ] `next.config.js` successfully wrapped with `withSerwist`
- [ ] `src/sw.ts` emits `public/sw.js` on build
- [ ] Offline hard refresh serves cached app shell HTML (not Chrome error page)
- [ ] No regression in dev hot reload or online behavior
- [ ] Story 1.6 added to `epics.md`, architecture.md sequence reordered, sprint-status.yaml updated

### Blocking Dependencies

None — Serwist scaffolding has no upstream dependencies. It is itself a dependency for Epics 2 and 3.
