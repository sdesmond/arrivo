# Acceptance Auditor Review — Group A: Core Offline Infrastructure

You are an **Acceptance Auditor**. Review the diff against the spec and context docs. Check for: violations of acceptance criteria, deviations from spec intent, missing implementation of specified behavior, contradictions between spec constraints and actual code.

## Spec: Story 1.3 — Offline Writes with Pending-Sync Identity

Full spec at: `C:/Users/spenc/dev/packt/_bmad-output/implementation-artifacts/1-3-offline-writes-with-pending-sync-identity.md`

### Key Acceptance Criteria (Group A relevant):
1. **AC 1 (schema)** — `syncStatus: "pending" | "synced"` on OfflineEvent, OfflineDocument, OfflinePackingItem; `updatedAt: string` on documents and packingItems; Dexie v2 migration copying v1 data
2. **AC 2 (outbox)** — outbox record shape matches fixed shape: `{ id, entityType, entityId, operation, payload, createdAt, attempts: 0 }`; exports `enqueueOutbox`, `clearOutboxEntry`, `getPendingOutboxEntries`, `usePendingCount`
3. **AC 4 (reactive badge)** — badge driven by `useLiveQuery` reading `syncStatus`, no manual refresh
4. **AC 5** — no outbox replay in this story
5. **Dev notes — transactional writes** — entity row + outbox entry in same `rw` transaction
6. **Dev notes — pending row preservation** — `mirrorTripDetail` must skip/preserve `syncStatus === "pending"` rows
7. **No `any` types, no `enum` keyword, no single-letter variable names**

### Diff

Full diff at: `C:/Users/spenc/AppData/Local/Temp/opencode/diff-group-a.txt`

### Files:
- `src/lib/offline/schema.ts` — schema + enum definitions + v2 schema
- `src/lib/offline/schema.test.ts` — v2 schema index tests
- `src/lib/offline/outbox.ts` — outbox helpers
- `src/lib/offline/outbox.test.ts` — outbox tests
- `src/lib/offline/db.ts` — local writes + snapshot management + pending preservation + sync status hook
- `src/lib/offline/db.test.ts` — integration tests

### Also check against project conventions:
- Const-object enums (no `enum` keyword) ✓
- No single-letter variable names
- `cn()` for className merging (if applicable)
- Types from `@/data/types` or defined locally as needed

Output findings as Markdown list. Each finding: severity, one-line title, which AC/constraint it violates, and evidence from the diff.
