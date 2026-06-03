# Story 3.2: Server Action Hardening

Status: done

## Story

As a developer,
I want to harden packing server actions with labelId validation, sanitized error messages, and idempotency support,
So that invalid data cannot enter the system and internal details are not leaked to clients.

## Acceptance Criteria

1. **Given** a packing server action receives a `labelId`
   **When** the `labelId` references a row that is not marked `isLabel = true` or belongs to a different trip
   **Then** the action rejects with a validation error
   **And** the mutation is not performed

2. **Given** a packing server action throws an unexpected error
   **When** the error is serialized to the client
   **Then** only a sanitized message is sent, not the raw internal details

3. **Given** `saveTripListAsTemplate` is called with an idempotency key
   **When** the same key is used again within the expiry window
   **Then** the action returns the existing result without creating a duplicate template

## Tasks / Subtasks

- [x] Split packing actions out of `trips/actions.ts` into a colocated file (file is 920 lines — exceeds 250-line limit)
  - [x] Extract `addPackingItem`, `updatePackingItem`, `togglePackingItem`, `removePackingItem`, `reorderPackingItems`, `pullTemplatesOntoTrip`, `saveTripListAsTemplate` and `normalizePackingItemName` into `src/app/(app)/trips/packing-actions.ts`
  - [x] Re-export from `actions.ts` to avoid cascading import changes
- [x] Add `validateLabelId(tripId, labelId)` helper that checks `isLabel=true` and same `tripId` (AC: #1)
  - [x] Apply validation in `addPackingItem` for `input.labelId`
  - [x] Apply validation in `reorderPackingItems` for each entry's `labelId`
  - [x] Apply validation in `updatePackingItem` if labelId is added to `UpdatePackingItemInput`
- [x] Create `sanitizeError()` wrapper and `withErrorHandling()` higher-order function (AC: #2)
  - [x] Apply to all packing actions in `src/app/(app)/trips/packing-actions.ts`
  - [x] Apply to all actions in `src/app/(app)/packing/actions.ts`
  - [x] Apply to all actions in `src/app/(app)/packing/[templateId]/actions.ts`
- [x] Add idempotency key support to `saveTripListAsTemplate` (AC: #3)
  - [x] Create `idempotency_keys` DB table or add `idempotencyKey` column logic
  - [x] Implement key check: return existing result if same key within expiry window
  - [x] Handle expiry (e.g., 24-hour window from first request)

## Dev Notes

### AC #1 — labelId Validation

**File split first:** Before any logic changes, extract the 7 packing actions and `normalizePackingItemName` from `trips/actions.ts` (920 lines) into `src/app/(app)/trips/packing-actions.ts`. Re-export them from `actions.ts` so all existing imports continue to work. Then apply all hardening to the new file.

**Current gap:** `addPackingItem` (currently in trips/actions.ts:479) accepts `input.labelId` and inserts it directly with no validation. A malformed client could pass a `labelId` that:
- Points to a row where `isLabel = false` (regular item, not a label)
- Points to a row in a different trip entirely

**Fix: create `validateLabelId(tripId, labelId): Promise<boolean>` in `trips/actions.ts`**

```ts
async function validateLabelId(tripId: string, labelId: string | null): Promise<void> {
  if (labelId === null) return;
  const [label] = await db
    .select({ id: packingItems.id })
    .from(packingItems)
    .where(
      and(
        eq(packingItems.id, labelId),
        eq(packingItems.isLabel, true),
        eq(packingItems.tripId, tripId)
      )
    );
  if (!label) throw new Error("Invalid labelId: referenced row is not a label or belongs to a different trip");
}
```

**Actions that need validation:**
| Action | File | labelId source | Has validation? |
|--------|------|---------------|-----------------|
| `addPackingItem` | `packing-actions.ts` | `input.labelId` | NO — must add |
| `reorderPackingItems` | `packing-actions.ts` | `ordered[].labelId` | NO — must add |
| `updatePackingItem` | `packing-actions.ts` | N/A (no labelId in input) | No change needed unless `UpdatePackingItemInput` is extended |

**Note on `reorderPackingItems`:** The `labelId` in the ordered array could also reference an invalid label. Validate each entry's `labelId` inside the transaction loop.

### AC #2 — sanitizeError() Wrapper

**Current gap:** All actions throw raw Error objects. Next.js server action serialization sends the full `error.message` to the client, which may leak internal details (DB errors, stack traces, implementation details).

**Fix: create `sanitizeError()` in `src/lib/error-utils.ts`**

```ts
export function sanitizeError(error: unknown): Error {
  if (error instanceof Error) {
    // Pass through known validation errors (user-facing, already sanitized)
    if (
      error.message.startsWith("Invalid labelId") ||
      error.message.startsWith("Template name") ||
      error.message.startsWith("Item text") ||
      error.message.startsWith("Packing item name") ||
      error.message.startsWith("Cannot save") ||
      error.message.startsWith("Target item") ||
      error.message.startsWith("Failed to create") ||
      error.message.startsWith("Template not found") ||
      error.message.startsWith("Item not found")
    ) {
      return error;
    }
    return new Error("An unexpected error occurred. Please try again.");
  }
  return new Error("An unexpected error occurred. Please try again.");
}
```

**Pattern to apply: wrap each public action with error handling.**

Option A — Higher-order function (recommended for consistency):
```ts
function withErrorHandling<T extends (...args: unknown[]) => Promise<unknown>>(fn: T): T {
  return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    try {
      return await fn(...args);
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      throw sanitizeError(error);
    }
  }) as T;
}
```

Then at the bottom of each action file, re-export wrapped versions:
```ts
export const addPackingItemSafe = withErrorHandling(addPackingItem);
// ... or rewrite in-place
```

Option B — Inline try/catch in each action (more explicit, more code). Option A is preferred.

**Actions that need the wrapper (all public packing actions):**

`packing-actions.ts` (all 7 extracted packing actions):
- `addPackingItem`
- `updatePackingItem`
- `togglePackingItem`
- `removePackingItem`
- `reorderPackingItems`
- `pullTemplatesOntoTrip`
- `saveTripListAsTemplate`

`packing/actions.ts`:
- `createTemplate` (line 11)
- `renameTemplate` (line 29)
- `deleteTemplate` (line 41)

`packing/[templateId]/actions.ts`:
- `addTemplateItem` (line 54)
- `updateTemplateItem` (line 157)
- `removeTemplateItem` (line 167)
- `reorderTemplateItems` (line 176)

**Do NOT wrap non-packing actions** (e.g., `createTrip`, `updateTripMetadata`, `deleteTrip`, `addCollaborator`, `removeCollaborator`, `updateCollaboratorRole`) — this story is scoped to packing actions only.

### AC #3 — Idempotency Key for saveTripListAsTemplate

**Current gap:** Calling `saveTripListAsTemplate` twice with the same tripId and name creates duplicate templates. No deduplication exists.

**Fix approach — create `idempotency_keys` table:**

Add to `src/db/schema.ts`:
```ts
export const idempotencyKeys = pgTable("idempotency_keys", {
  key: text("key").primaryKey(),
  result: jsonb("result").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`).notNull(),
});
```

**Then modify `saveTripListAsTemplate` to accept an optional `idempotencyKey` param:**

```ts
export async function saveTripListAsTemplate(
  tripId: string,
  name: string,
  idempotencyKey?: string
): Promise<SaveTripAsTemplateResult> {
  // ...
  if (idempotencyKey) {
    // Check for existing result within 24h window
    const existing = await db
      .select()
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.key, idempotencyKey));
    if (existing.length > 0) {
      const age = Date.now() - existing[0].createdAt.getTime();
      if (age < 24 * 60 * 60 * 1000) {
        return existing[0].result as unknown as SaveTripAsTemplateResult;
      }
    }
  }
  // ... (normal logic)
  if (idempotencyKey) {
    // Store result
    await db
      .insert(idempotencyKeys)
      .values({ key: idempotencyKey, result: { templateId } })
      .onConflictDoNothing();
  }
}
```

**Idempotency key expiry:** 24 hours from creation. After expiry, the key can be reused and a new template is created.

**Key generation is client-side** — the server only checks and stores. The key should be a UUID or similar unique value generated by the client before the mutation.

**Schema migration needed:** Create a new migration with `drizzle-kit generate` after adding the table. Run `db:migrate:e2e` after migration for E2E tests.

### Architecture Compliance

- All new types in `src/data/types.ts` (e.g., `IdempotencyKeyResult` if needed)
- `"use server"` must remain the first line of all action files
- `requireUser()` + `assertTripAccess()` already called in every action — do not remove
- `revalidatePath` calls must be preserved after every mutation
- The `sanitizeError` wrapper must not catch `requireUser()` redirects (they throw `Redirect` errors, not `Error`)
- The higher-order function must re-throw non-`Error` objects — `requireUser()` uses `redirect()` which throws a `RedirectError` that is not an `Error` instance. Add `if (!(error instanceof Error)) throw error;` before calling `sanitizeError`

### Library / Framework Requirements

- `drizzle-orm` — no new imports needed beyond `eq`, `and` already imported
- `next/cache` — `revalidatePath` already imported
- No new npm packages needed
- Drizzle kit for migration generation: `npx drizzle-kit generate`

### File Structure Requirements

| File | Action | Notes |
|------|--------|-------|
| `src/app/(app)/trips/packing-actions.ts` | CREATE | Extract all packing actions from `actions.ts`; add `validateLabelId` and apply; wrap exports with `sanitizeError`; add idempotency to `saveTripListAsTemplate` |
| `src/app/(app)/trips/actions.ts` | MODIFY | Re-export packing actions from `packing-actions.ts`; remove inline packing action definitions |
| `src/app/(app)/packing/actions.ts` | MODIFY | Wrap all 3 actions with `sanitizeError` |
| `src/app/(app)/packing/[templateId]/actions.ts` | MODIFY | Wrap all 4 actions with `sanitizeError` |
| `src/lib/error-utils.ts` | CREATE | `sanitizeError()` and `withErrorHandling()` |
| `src/db/schema.ts` | MODIFY | Add `idempotencyKeys` table |
| `src/data/types.ts` | MODIFY | Add `IdempotencyResult` type if needed |
| `src/db/index.ts` | NO CHANGE | Already exports singleton `db` |

### Testing Requirements

**Unit tests — update existing test files:**

`src/app/(app)/trips/actions.test.ts` (or a new `packing-actions.test.ts`):
- **labelId validation:** add test for `addPackingItem` with invalid labelId → rejects with validation error
- **labelId validation:** add test for `reorderPackingItems` with invalid labelId in ordered entry → rejects
- **labelId validation:** add test for `addPackingItem` with labelId pointing to wrong trip → rejects
- **labelId validation:** add test for `addPackingItem` with labelId pointing to non-label item → rejects
- **labelId validation:** add test for `addPackingItem` with valid labelId → succeeds
- **sanitizeError:** add test that known validation errors pass through unchanged
- **sanitizeError:** add test that unknown errors are replaced with generic message
- **idempotency:** add test that same key within expiry returns cached result
- **idempotency:** add test that different keys create different templates
- **idempotency:** add test that expired key creates new template

`src/app/(app)/packing/actions.test.ts` (if exists) or create:
- **sanitizeError:** test that `createTemplate` errors are sanitized
- **sanitizeError:** test that `renameTemplate` errors are sanitized
- **sanitizeError:** test that `deleteTemplate` errors are sanitized

`src/app/(app)/packing/[templateId]/actions.test.ts` (if exists) or create:
- **sanitizeError:** test that `addTemplateItem` errors are sanitized
- **sanitizeError:** test that `updateTemplateItem` errors are sanitized
- **sanitizeError:** test that `removeTemplateItem` errors are sanitized
- **sanitizeError:** test that `reorderTemplateItems` errors are sanitized

`src/lib/error-utils.test.ts`:
- **sanitizeError:** known validation error → passes through
- **sanitizeError:** generic Error → replaced with sanitized message
- **sanitizeError:** non-Error throw → replaced with sanitized message
- **sanitizeError:** string throw → replaced with sanitized message
- **withErrorHandling:** wraps function result correctly
- **withErrorHandling:** re-throws sanitized errors
- **withErrorHandling:** preserves redirect errors (does not sanitize Next.js redirects)

**Coverage:** maintain ≥95% lines/functions. New code must be fully covered.

**Global mocks:** `next/navigation` and `next/headers` already mocked globally in `vitest.setup.mts` — do not re-mock.

### Previous Story Intelligence (3.1)

From `3-1-packing-sort-utils-bug-fixes.md`:

**Key learnings:**
- `packing-sort-utils.ts` is a pure utility module — no React, no server imports
- The review process found synthetic key collisions in `containerKeyOfItem` — fixed by adding section index to fallback key
- `computeReorder` returns `null` silently (no side-channel for UI feedback) — this is tracked as a pattern to be aware of
- Tests must guard against vacuous assertions (e.g., tests passing because the expected code path was never reached)
- The team uses inline `[Review]` annotations in story files for review findings (Decision, Patch, Defer categories)

**Patterns established:**
- Pure utility fixes go in `packing-sort-utils.test.ts`; component fixes in `packing-list-sortable.test.tsx`
- Code review annotations tracked directly in story file with `[Review]` prefix
- DRY: shared test setup extracted rather than duplicated

### Git Intelligence

Recent commits affecting actions files:
- `79cf39b` — Added `saveTripListAsTemplate` with full test suite
- `f47d87c` — Hardened template pull server behavior (prior hardening work in same area)
- `89d7224` — Added `pullTemplatesOntoTrip` action

**Pattern:** Recent work follows the same file structure — all trip-related packing actions in `trips/actions.ts`, template actions in `packing/actions.ts` and `packing/[templateId]/actions.ts`. New tests in colocated `.test.ts` files.

### Project Context Reference

- **No `any` types** — all types explicit
- **Path alias** `@/*` → `./src/*`
- **No single-letter variable names** (except `for` loop `i`)
- **Server actions** live alongside their route: `src/app/(app)/trips/actions.ts`
- **Every action** must call `requireUser()` then `assertTripAccess()` — already done, do not remove
- **Always call `revalidatePath`** after any mutation — already done, do not remove
- **All domain types** in `src/data/types.ts` — no local type redefinitions
- **Dates:** ISO 8601 strings. **Times:** `"HH:mm"`. **Durations:** minutes as `number`
- **Coverage thresholds:** ≥95% lines/functions, ≥90% branches (enforced in CI)
- **Colocated tests:** `foo.ts` → `foo.test.ts` in same directory

## Dev Agent Record

### Agent Model Used

opencode/big-pickle

### Completion Notes List

- Extracted the trip packing mutations into `src/app/(app)/trips/packing-actions.ts` and kept `src/app/(app)/trips/actions.ts` stable with async wrappers for existing callers.
- Added `validateLabelId()` enforcement for packing item creation and reorder payloads so only same-trip section labels can be referenced.
- Added shared `sanitizeError()` and `withErrorHandling()` helpers and wrapped the packing action surfaces in trips, template library, and template editor routes.
- Added `idempotency_keys` schema support plus 24-hour cached result handling for `saveTripListAsTemplate`.
- Added targeted unit coverage for label validation, sanitization, and idempotency behavior, plus sanitizer coverage for the template action files.
- Validation passed with `npm run lint`, `npx tsc --noEmit`, `npm run test:coverage`, `npm run build`, and `npm run test:e2e` (113 scenarios passed on the final run).

### File List

- `src/app/(app)/trips/packing-actions.ts` — CREATE (extracted packing actions, label validation, sanitization wrappers, idempotent template save)
- `src/app/(app)/trips/actions.ts` — MODIFY (remove inline packing action bodies and forward through async wrappers)
- `src/app/(app)/trips/packing-actions.test.ts` — CREATE (label validation, sanitization, and idempotency tests)
- `src/app/(app)/trips/actions.test.ts` — MODIFY (align reorder fixture with label validation path)
- `src/app/(app)/packing/actions.ts` — MODIFY (apply error-handling wrapper to template library actions)
- `src/app/(app)/packing/actions.test.ts` — MODIFY (add sanitizer coverage for template library actions)
- `src/app/(app)/packing/[templateId]/actions.ts` — MODIFY (apply error-handling wrapper to template item actions)
- `src/app/(app)/packing/[templateId]/actions.test.ts` — MODIFY (add sanitizer coverage for template item actions)
- `src/lib/error-utils.ts` — CREATE (shared sanitizeError and withErrorHandling helpers)
- `src/lib/error-utils.test.ts` — CREATE (unit tests for sanitization and redirect-safe wrapping)
- `src/db/schema.ts` — MODIFY (add `idempotency_keys` table)

## Change Log

- 2026-06-03: Extracted packing actions, added label validation and error sanitization, and implemented idempotent template-save handling with test coverage.

### Review Findings

- [x] [Review][Patch] withErrorHandling sanitizes redirect()/notFound() signals, breaking auth flow [src/lib/error-utils.ts:33-39] — `redirect()` and `notFound()` throw `new Error(...)` instances, not plain objects. The `instanceof Error` check catches them and passes to `sanitizeError()`, which replaces them with the generic message. Fixed: added `isNextJsSignal()` check in `withErrorHandling` to pass through errors with a `digest` property.
- [x] [Review][Patch] Idempotency keys unscoped — no userId/tripId filter, allowing cross-user cache hits [src/app/(app)/trips/packing-actions.ts:292-296] — `idempotencyKeys` table has no `userId` or `tripId` column. Two users (or same user on different trips) with the same idempotency key get each other's cached templateId. Fixed: added `userId` column, composite PK `(key, userId)`, scoped cache lookups.
- [x] [Review][Patch] TOCTOU race: idempotency check outside transaction allows duplicate template creation [src/app/(app)/trips/packing-actions.ts:323-328, 393-407] — Concurrent requests both pass the SELECT cache check before either reaches INSERT. `ON CONFLICT DO UPDATE` only fixes the cache row, not the duplicate template. Fixed: moved cache check+insert into the main transaction.
- [x] [Review][Patch] addPackingItem validates labelId outside transaction (TOCTOU) [src/app/(app)/trips/packing-actions.ts:81, 85-106] — `validateLabelId()` runs before any transaction. A concurrent label deletion between validation and insert causes FK violations. Fixed: moved `validateLabelId` inside transaction for `afterItemId`/`beforeItemId` paths.
- [x] [Review][Patch] saveTripListAsTemplateImpl reads tripItems outside transaction (stale snapshot) [src/app/(app)/trips/packing-actions.ts:298-305, 314] — The trip items snapshot is captured before the transaction. Concurrent adds/deletes between snapshot and commit produce a stale template. Fixed: re-read inside the transaction (resolved as part of Patch 3 refactor).

- [x] [Review][Defer] N+1 query in reorderPackingItemsImpl loop [packing-actions.ts:249-257] — deferred, pre-existing pattern (original also used N updates in a loop)
- [x] [Review][Defer] idempotencyKeys table grows unbounded with no cleanup [db/schema.ts:337-341]
- [x] [Review][Defer] isSaveTripAsTemplateResult type guard has false-positive risk [packing-actions.ts:118-124]
- [x] [Review][Defer] Stale idempotency cache returns deleted-template ID [packing-actions.ts:55-73]
- [x] [Review][Defer] reorderPackingItems does not validate entry IDs exist [packing-actions.ts:198-206] — deferred, pre-existing issue
