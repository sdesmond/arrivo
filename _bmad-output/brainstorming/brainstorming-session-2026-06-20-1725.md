---
stepsCompleted: [1, 2, 3, 4]
inputDocuments: []
session_topic: "Offline functionality implementation for Packt travel itinerary app"
session_goals: "Near-complete offline parity (docs, itinerary, packing lists); explore self-hosted local folder as document storage"
selected_approach: "AI-Recommended Techniques"
techniques_used: ["Question Storming", "First Principles Thinking", "Constraint Mapping"]
ideas_generated: [16]
context_file: ""
---

# Brainstorming Session Results

**Facilitator:** Spencer
**Date:** 2026-06-20T17:25

## Session Overview

**Topic:** Offline functionality implementation for Packt travel itinerary app

**Goals:** Documents, itinerary, packing lists behave identically offline as online. Explore self-hosted local folder as document upload/storage location.

### Session Setup

_No context file provided. Topic confirmed and goals validated with user._

## Technique Selection

**Approach:** AI-Recommended Techniques
**Analysis Context:** Offline functionality implementation with focus on near-complete offline parity and self-hosted local folder storage

**Recommended Techniques:**

- **Question Storming:** Define the problem space before jumping to solutions — map what we don't know about offline sync, storage, and architecture
- **First Principles Thinking:** Strip away online-only assumptions and rebuild from fundamental truths about what must work offline
- **Constraint Mapping:** Map real vs imagined constraints around the local-folder storage model and find pathways through them

**AI Rationale:** The session topic is complex and multi-dimensional (sync, conflict resolution, storage, UI state). Starting with Question Storming ensures we solve the right sub-problems. First Principles breaks inherited architecture assumptions. Constraint Mapping directly addresses the self-hosted local folder secondary goal and surfaces viable pathways.

## Technique Execution Results

**Question Storming:**

- **Interactive Focus:** Conflict resolution strategies, storage topology, service worker architecture, sync triggers, offline read boundaries, storage eviction
- **Key Breakthroughs:**
  - Entity-tiered conflict resolution (packing list = last-write-wins, itinerary = prompt-merge, docs = review-merge)
  - Hybrid SW + IndexedDB architecture as the offline backbone
  - Self-hosted local folder as a simple storage adapter swap, not a filesystem watcher
  - Connection-adaptive sync (silent push for clean server, prompt for pending server changes)
- **Energy Level:** Analytical and focused — user brought clear domain expertise on what should and shouldn't work offline

**Ideas Generated:** 10 (documented inline during session)

**First Principles Thinking:**

- **Interactive Focus:** Stripping away online architecture assumptions to find the irreducible kernel
- **Key Breakthroughs:**
  - Kernel = trips → days → chronological events → notes/docs refs (addresses are data, not map dependency)
  - `StorageProvider` abstraction — self-hosted folder as adapter, not architecture fork
  - Offline = live degraded mode (full interactivity, different data source), not a static export
  - Relational mirror in IndexedDB for sync simplicity over document-store read speed
- **Energy Level:** High — user quickly identified the kernel and made clear tradeoff decisions

**Constraint Mapping:**

- **Interactive Focus:** Docker volume mount for self-hosted folder, offline upload path, storage provider abstraction
- **Key Breakthroughs:**
  - Docker volume mount is a low-impact constraint — `fs` access inside container
  - Staged upload with sync replay — offline docs blob-stored in IndexedDB, replayed through standard API pipeline on reconnect
  - Upload queue with progress view for full visibility of pending docs
  - Local-first direct write ruled out as too complex
- **Energy Level:** Pragmatic — quick elimination of over-engineered approaches

## Idea Organization and Prioritization

**Thematic Organization:**

**Theme 1: Sync & Conflict Resolution**
- Entity-Tiered Conflict Resolution (#1)
- Hybrid SW + IndexedDB Architecture (#6)
- Connection-Adaptive Sync (#7)
- Relational Mirror in IndexedDB (#14)
- Staged Upload with Sync Replay (#15)

**Theme 2: Offline UX & User Control**
- Local UUID + Pending Sync Badge (#2)
- Trip Manifest (Pin for Offline) (#4)
- Change Notification + Conflict Review Page (#5)
- Smart Pin with Lead-Time Window (#10)
- Live Degraded Mode (#12)
- Upload Queue with Progress View (#16)

**Theme 3: Storage & Lifecycle**
- Local Folder as Upload Target (#3)
- Storage Backend Abstraction (#11)
- Auto-Cleanup by Trip Lifecycle (#9)
- Local-Only Search (#8)

**Prioritization Results:**

- **Top Priority:** Frictionless offline (Smart Pin, Auto-Cleanup, Connection-Adaptive Sync, Upload Queue) + Storage Abstraction (StorageProvider interface + Local Folder adapter)
- **Quick Win:** Auto-Cleanup by Trip Lifecycle (1–2 days, minimal code surface)
- **Breakthrough Concept:** Storage Backend Abstraction — enables self-hosting without architecture fork

**Action Plans:**

**Priority 1: Storage Backend Abstraction** (2–3 days)
1. Define `StorageProvider` interface
2. Implement `LocalFolderProvider`
3. Implement `VercelBlobProvider` wrapper
4. Add `STORAGE_PROVIDER` env var + factory
5. Unit tests

**Priority 2: Smart Pin with Lead-Time Window** (2–3 days)
1. `offline_settings` table (trip_id, auto_lead_days, pinned_at)
2. On app startup: check upcoming trips within lead window → auto-download
3. UI toggle in trip settings
4. Skip re-download if already cached

**Priority 3: Auto-Cleanup by Trip Lifecycle** (1–2 days)
1. `offline_cleanup_at` derived from trip end + grace period
2. Check + evict on app startup and trip deletion
3. Configurable grace period (default 7 days)

**Priority 4: Connection-Adaptive Sync** (4–6 days)
1. Reconnect detection (navigator.onLine + health-check ping)
2. Compare `last_synced_at` vs server `updated_at`
3. Server has changes → review prompt; no changes → silent push
4. Transient "Online" indicator

## Session Summary

**Key Achievements:**
- 16 ideas generated across Question Storming, First Principles Thinking, and Constraint Mapping
- Clear architecture direction: Hybrid SW + IndexedDB with relational mirror
- Entity-tiered conflict resolution model defined
- Self-hosted storage path identified as an adapter pattern, not a fork
- Four prioritized action plans with concrete next steps and timelines
