---
title: Offline Functionality for Packt
status: final
created: 2026-06-20
updated: 2026-06-21
---

# Offline Functionality for Packt

## Vision

Today, Packt loads nothing beyond whatever the browser happened to cache — there is no deliberate offline mode. This PRD takes Packt to near-complete offline parity: a traveler referencing a pre-planned trip should not notice they're offline at all, aside from a persistent status indicator in the nav.

Specifically, offline must support:
- Viewing itinerary, reservations, and documents
- Reordering events, viewing times and addresses (map/address *lookup* is online-only — addresses remain visible as data)
- Creating new events, adding documents, and packing list activity (not read-only — offline is a full write surface, not a cached view)

Conflict handling is designed for collaborators from day one, even though collaborators aren't implemented yet. Single-user-multi-device divergence (e.g., edit offline on phone, then open an already-online laptop) and true multi-collaborator divergence use the same sync/conflict mechanism — only the attribution shown to the user differs.

v1 targets web (PWA via service worker). No native/mobile app is planned now, but the architecture must not preclude one later.

## Goals

- Reading and routine interaction (reorder, check off, view) feels identical online and offline
- Writes made offline (new events, docs, packing items) are durable and sync automatically on reconnect
- Conflicts are resolved without silent data loss, using tiered strategy by entity risk (packing list / itinerary / docs)
- Self-hosted local-folder storage is achievable as a backend swap, not a fork
- A persistent nav indicator communicates offline/pending-sync state without interrupting use

A traveler reorders an event mid-trip and loses signal — the pending-sync badge (FR7) appears immediately, editing continues uninterrupted, and nothing in the UI suggests an error state. Reconnecting later in a hotel lobby, the nav indicator clears as sync completes silently — unless the server has diverged, in which case a single conflict review prompt (FR8) appears, naming who changed what, before anything overwrites.

## Glossary

- **Pin / Pinning** — marking a trip for offline availability; downloads its itinerary, days, events, and documents to the local device (FR5, FR6).
- **Sync** — reconciling local offline changes with the server; covers both the automatic background push (FR1) and the user-facing conflict review flow (FR8).
- **Conflict** — a divergence between local and server state for the same entity, detected on reconnect.
- **Entity tier** — the conflict-resolution strategy assigned to a data type: packing list (last-write-wins), itinerary (prompt-merge), documents (last-write-wins, except deletions which prompt-merge) — see FR2.

## Features

### Sync & Conflict Resolution

- **FR1** — System syncs offline writes to server automatically on reconnect, no user action required.
- **FR2** — Conflicting changes between local and server state resolve per entity tier: packing list = last-write-wins (no prompt), itinerary = prompt-merge, documents = last-write-wins (silent auto-merge — duplicate names are already permitted, so most apparent naming conflicts aren't real ones), except a document *deletion* conflict (deleted offline while changed/still present online, or vice versa), which prompt-merges to avoid silent data loss. Itinerary conflicts and document-deletion conflicts surface on the same conflict review screen (FR8) as tagged rows; only the available actions/copy differ by entity type.
- **FR3** — Documents created/uploaded offline queue locally and upload automatically on reconnect; user can see queue status and progress.
- **FR4** — Sync behavior adapts to what's waiting: on reconnect, compare the local last-synced timestamp against the server's last-updated timestamp per entity. No server-side changes since last sync → push silently. Server has changes → prompt for review (FR8).

### Offline UX & User Control

- **FR5** — User can pin a trip for offline availability; pinning downloads itinerary, days, events, and documents to the local device.
- **FR6** — Trips within a configurable lead-time window before their start date auto-pin without user action (Smart Pin). User preferences control this globally — one configuration applies to every trip, no per-trip override: opt out of auto-pin entirely, adjust the lead-time window, and restrict auto-download to unmetered/Wi-Fi connections.
- **FR7** — Items created or edited offline get a stable local identity and show a pending-sync badge until confirmed synced to server.
- **FR8** — When server-side changes are detected on reconnect, user gets a change notification and reviews them on a dedicated conflict review page before they apply.
- **FR9** — Every read and write action available online (view itinerary/reservations/documents, reorder events, create events, add documents, packing list activity) is available offline with no online-only blocking modal; the only online-required actions are address/map lookup and third-party API calls (see Out of Scope).

### Storage & Lifecycle

- **FR10** — Document storage backend is swappable via configuration (e.g. self-hosted local folder vs. cloud blob storage) without forking the app.
- **FR11** — Offline trip data auto-evicts from local storage after a grace period following trip end; defaults to 7 days, user-configurable.
- **FR13** — When device storage cannot fit a pin or sync operation, the system fails gracefully and notifies the user; no partial or corrupted local state results.

## Non-Functional Requirements

- **NFR1** — No sync or conflict path may silently discard user data; every overwrite is either auto-safe by tier (packing list) or user-confirmed (itinerary, docs).
- **NFR2** — Storage backend swap requires no schema or entity-model changes — config/adapter change only.
- **NFR3** — Local storage operations (read, write, search) run off the main thread (async/Web Worker) and never block UI rendering.
- **NFR4** — Reconnect detection and sync trigger within seconds of connectivity returning, not on next manual refresh.

## Success Metrics

- **Metric:** Zero data-loss incidents from sync conflicts across entity tiers. **Counter-metric:** Conflict-review prompts shown per session — if this trends high, tiering/UX is too noisy.
- **Metric:** % of pinned-trip actions (view/reorder/create) that work fully offline. **Counter-metric:** Crash/error rate when offline — full feature coverage shouldn't come at the cost of stability.
- **Metric:** Median time from reconnect to fully synced state. **Counter-metric:** Local storage size per pinned trip — faster sync shouldn't come from skipping cleanup/eviction.

## Out of Scope

- **Native/mobile app** — v1 is web/PWA only; architecture must not preclude native later, but no native client ships in this PRD's scope.
- **True multi-collaborator UI** (invites, roles, presence) — not yet implemented in Packt at all; this PRD only ensures the sync/conflict mechanism is collaborator-ready, not that collaboration itself ships.
- **Any third-party API integration while offline** (e.g. map/address lookup, Unsplash image search) — these require a live network call by nature; cached results already pulled may still display, but no offline fallback or queuing is in scope for these calls.
- **Offline search** (was FR12 — searching pinned/offline trip content without network connectivity) — descoped during UX design (`ux-packt-2026-06-20`). Current document-name search stays as-is; the direction is to build trip-name/travel-history search into those views directly as simple client-side filtering, not as an offline-specific capability tied to pinned data. Treated as a separate future initiative, not part of this PRD's scope.
