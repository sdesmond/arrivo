---
story_id: "4.3"
story_key: "4-3-companion-data-integrity"
epic: 4
story: 3
title: "Companion Data Integrity — Position Fix, Input Validation, and Insert Cap"
status: "review"
created: "2026-05-22"
---

# Story 4.3 — Companion Data Integrity: Position Fix, Input Validation, and Insert Cap

## Story

As a **developer**,
I want the companion server actions to enforce position uniqueness, input validity, and a per-user insert cap,
so that the companions section is free of silent data-corruption bugs surfaced during the Story 3.2 code review.

## Acceptance Criteria

**AC1 — Position assignment is gap-safe in all three `add*` profile actions:**
Given a user deletes a companion at position 1 (leaving positions [0, 2]),
When they add a new companion,
Then the new companion receives position 3 (MAX + 1), not position 2 (COUNT) — no duplicate positions are produced.
The same fix applies to `addLoyaltyNumber` and `addWishlistDestination`.

**AC2 — `addCompanion` enforces a 20-companion cap:**
Given a user already has 20 companions,
When `addCompanion` is called,
Then the action returns `{ error: "Companion limit reached (20 maximum)." }` and no row is inserted.
The caller (`CompanionsSection`) shows the error via `toast.error`.

**AC3 — `addCompanion` validates name input:**
Given `addCompanion` is called with an empty/whitespace-only name or a name longer than 100 characters,
When the action runs,
Then it returns `{ error: "Companion name is required." }` or `{ error: "Companion name must be 100 characters or fewer." }` respectively, and no row is inserted.

**AC4 — `updateCompanion` validates name and age:**
Given `updateCompanion` is called with a name longer than 100 characters, or an age outside 0–120,
When the action runs,
Then it returns `{ error: "Companion name must be 100 characters or fewer." }` or `{ error: "Age must be between 0 and 120." }` respectively, and no row is updated.
The caller (`CompanionRow`) shows the error via `toast.error`.

**AC5 — Happy paths are unchanged:**
Given valid input under the cap,
When `addCompanion` or `updateCompanion` is called,
Then both return `{}` and the DB write proceeds as before; the caller discards the result silently on success.

**AC6 — Existing tests pass; companion-row.test.tsx adds a sonner mock:**
Given `companion-row.tsx` now imports `toast` from `sonner`,
When tests run,
Then `companion-row.test.tsx` adds `vi.mock("sonner", ...)` at the top so the import doesn't leak into the test environment; all existing assertions continue to pass (they don't hit the error path because the mock returns `undefined`).

---

## Dev Notes

### Root cause

All three `add*` actions compute the next `position` via `count(*)`. If a delete leaves gaps (e.g., positions [0, 2]), COUNT returns 2, which collides with the existing row at position 2. Fix: use `coalesce(max(position), -1) + 1` instead — always appends past the highest existing position regardless of gaps.

### File changes

| File | Change |
|------|--------|
| `src/app/(app)/profile/actions.ts` | Fix position SQL in `addLoyaltyNumber`, `addWishlistDestination`, `addCompanion`; add max cap + input validation guards to `addCompanion` and `updateCompanion`; update return types |
| `src/app/(app)/profile/companions-section.tsx` | Handle `{ error }` return from `addCompanion`; add `toast.error` on error |
| `src/app/(app)/profile/companion-row.tsx` | Handle `{ error }` return from `updateCompanion`; add `toast.error` on error |
| `src/app/(app)/profile/companion-row.test.tsx` | Add `vi.mock("sonner", ...)` to prevent bare import in test env (AC6) |

No schema changes. No E2E scenarios needed — these are server-side correctness fixes with no new user-facing flow.

### 1. Position fix in `actions.ts`

Import `max` from drizzle-orm alongside the existing imports:
```ts
import { eq, and, not, exists, sql, max } from "drizzle-orm";
```

Replace every `count(*)::int` position query with the gap-safe variant. Pattern (shown for companions — same change applies to loyalty numbers and wishlist destinations):

```ts
// BEFORE
const [{ count }] = await db
  .select({ count: sql<number>`count(*)::int` })
  .from(userCompanions)
  .where(eq(userCompanions.userId, userId));
// ...
position: count,

// AFTER
const [{ nextPos }] = await db
  .select({ nextPos: sql<number>`coalesce(max(${userCompanions.position}), -1) + 1` })
  .from(userCompanions)
  .where(eq(userCompanions.userId, userId));
// ...
position: nextPos,
```

Apply the same pattern to `addLoyaltyNumber` (using `userLoyaltyNumbers.position`) and `addWishlistDestination` (using `userWishlistDestinations.position`).

### 2. `addCompanion` — return type, cap, and validation

```ts
export async function addCompanion(input: AddCompanionInput): Promise<{ error?: string }> {
  const session = await requireUser();
  const userId = session.id!;

  // Input validation
  const trimmedName = input.name?.trim() ?? "";
  if (!trimmedName) return { error: "Companion name is required." };
  if (trimmedName.length > 100) return { error: "Companion name must be 100 characters or fewer." };

  // Cap enforcement
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(userCompanions)
    .where(eq(userCompanions.userId, userId));
  if (count >= 20) return { error: "Companion limit reached (20 maximum)." };

  // Gap-safe position
  const [{ nextPos }] = await db
    .select({ nextPos: sql<number>`coalesce(max(${userCompanions.position}), -1) + 1` })
    .from(userCompanions)
    .where(eq(userCompanions.userId, userId));

  await db.insert(userCompanions).values({
    userId,
    name: trimmedName,
    age: input.age ?? null,
    position: nextPos,
  });
  revalidatePath("/profile");
  return {};
}
```

Note: two queries are now issued (cap check, then max-position). This is acceptable given the low expected row count per user and the infrequent nature of this action. A single CTE combining both is an option but adds complexity not warranted here.

### 3. `updateCompanion` — return type and validation

```ts
export async function updateCompanion(id: string, patch: UpdateCompanionPatch): Promise<{ error?: string }> {
  const session = await requireUser();

  if (patch.name !== undefined) {
    const trimmedName = patch.name.trim();
    if (trimmedName.length > 100) return { error: "Companion name must be 100 characters or fewer." };
  }
  if (patch.age !== undefined && patch.age !== null) {
    if (!Number.isInteger(patch.age) || patch.age < 0 || patch.age > 120) {
      return { error: "Age must be between 0 and 120." };
    }
  }

  await db
    .update(userCompanions)
    .set({
      name: patch.name,
      age: patch.age ?? null,
      passportNumber: patch.passportNumber ?? null,
      passportExpiry: patch.passportExpiry ?? null,
      passportNationality: patch.passportNationality ?? null,
      knownTravelerNumber: patch.knownTravelerNumber ?? null,
      packtUsername: patch.packtUsername ?? null,
    })
    .where(and(eq(userCompanions.id, id), eq(userCompanions.userId, session.id!)));
  revalidatePath("/profile");
  return {};
}
```

### 4. Caller update — `companions-section.tsx`

Add the toast import and check the result in `handleAdd`:

```tsx
import { toast } from "sonner";
// ...
startAdd(async () => {
  const result = await addCompanion({ name: trimmed });
  if (result?.error) {
    toast.error(result.error);
    return;
  }
  setName("");
});
```

### 5. Caller update — `companion-row.tsx`

Add the toast import and check the result in `handleSave`:

```tsx
import { toast } from "sonner";
// ...
startTransition(async () => {
  const patch: UpdateCompanionPatch = { /* ... existing ... */ };
  const result = await updateCompanion(companion.id, patch);
  if (result?.error) {
    toast.error(result.error);
    return;
  }
  setJustSaved(true);
  setTimeout(() => setJustSaved(false), 2000);
  setIsExpanded(false);
  editButtonRef.current?.focus();
});
```

### 6. Test update — `companion-row.test.tsx`

Add the sonner mock at the top of the file (after the existing `vi.mock("./actions", ...)` block):

```ts
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));
```

No existing test assertions need changing — none of them hit the error path because the mocked `updateCompanion` resolves to `undefined` (`result?.error` is `undefined`, falsy).

### Key invariants to preserve

- `deleteCompanion`, `deleteLoyaltyNumber`, `deleteWishlistDestination` are **not modified** — recompaction was explicitly deferred in the original code review. The gap-safe insert fixes the symptom without needing recompaction.
- `addLoyaltyNumber` and `addWishlistDestination` get the position fix only — no cap or validation changes (out of scope; lower risk inputs).
- `revalidatePath("/profile")` remains on all success paths.
- The `requireUser()` call stays as the first line in every action.

### References

- [Source: _bmad-output/implementation-artifacts/deferred-work.md#Follow-ups from companions feature review] — original bug reports
- [Source: src/app/(app)/profile/actions.ts:90-127] — current addCompanion / updateCompanion / deleteCompanion
- [Source: src/app/(app)/profile/companions-section.tsx:26-33] — addCompanion caller
- [Source: src/app/(app)/profile/companion-row.tsx:53-69] — updateCompanion caller
- [Source: src/app/(app)/profile/companion-row.test.tsx:7-9] — actions mock (needs sonner mock added)
- [Source: src/db/schema.ts] — userCompanions, userLoyaltyNumbers, userWishlistDestinations tables
- [Source: _bmad-output/project-context.md#Notifications (Sonner)] — toast pattern and test mock convention

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — implementation was clean on first pass. Removed the `max` drizzle-orm import (story spec suggested it, but inline SQL via `sql\`\`` template literals made it unused — lint would have flagged it).

### Completion Notes List

- AC1: Gap-safe `coalesce(max(position), -1) + 1` applied to all three `add*` actions (`addLoyaltyNumber`, `addWishlistDestination`, `addCompanion`)
- AC2: 20-companion cap enforced in `addCompanion` via count query before insert
- AC3: Name trimming + empty/length validation in `addCompanion`; returns `{ error }` on violation
- AC4: Name length + integer age range (0–120) validation in `updateCompanion`; returns `{ error }` on violation
- AC5: Happy paths return `{}` and proceed as before
- AC6: `vi.mock("sonner", ...)` added to `companion-row.test.tsx`; all 817 unit tests pass, 47 E2E tests pass

### File List

- `src/app/(app)/profile/actions.ts`
- `src/app/(app)/profile/companions-section.tsx`
- `src/app/(app)/profile/companion-row.tsx`
- `src/app/(app)/profile/companion-row.test.tsx`
- `_bmad-output/implementation-artifacts/4-3-companion-data-integrity.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
