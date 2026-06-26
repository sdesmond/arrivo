---
baseline_commit: 2b91353
---

# Story 1.8: Configure Spend Threshold Settings

Status: review

## Story

As a user,
I want to set my own warning and danger spend thresholds,
So that the Budget tab's alerts match my personal risk tolerance.

## Acceptance Criteria

1. **Threshold inputs visible** — On Settings → Preferences → Budget, two number inputs side by side: "Warning %" and "Danger %", each 0–100, defaulting to 80/90 when no thresholds saved. (FR10, UX-DR14)

2. **Save rejected when warning ≥ danger** — Saving with warning ≥ danger shows an inline validation message next to the relevant input — never a toast-only error. Values are not persisted until corrected. (UX-DR16)

3. **Valid pair persists** — Saving with warning < danger persists both values to the user's profile, and they are used by every trip's Budget tab threshold checks. (FR10)

4. **Existing profile fields unchanged** — Adding threshold fields does not break the existing date-format, currency, distance-unit, or cover-type toggles/inputs. Unchanged fields are omitted from the patch.

5. **New DB columns** — `users.warning_threshold` (integer, default 80) and `users.danger_threshold` (integer, default 90) are added to the schema. Default values are set at the column level, not in application code.

## Tasks / Subtasks

- [x] Schema + types (AC: 1, 3, 5)
  - [x] Add `warningThreshold: integer("warning_threshold").default(80).notNull()` to `users` table in `src/db/schema.ts`
  - [x] Add `dangerThreshold: integer("danger_threshold").default(90).notNull()` to `users` table
  - [x] Add `warningThreshold: number` and `dangerThreshold: number` to `UserProfile` in `src/data/types.ts`
  - [x] Add `warningThreshold?: number` and `dangerThreshold?: number` to `UpdateUserProfilePatch` in `src/data/types.ts`

- [x] DB mapper (AC: 1, 3)
  - [x] Update the user row → `UserProfile` mapping (likely in `db-mappers.ts` or wherever user rows are mapped) to include `warningThreshold` and `dangerThreshold` from the new columns
  - [x] Update `src/lib/db-mappers.test.ts` to verify the new threshold fields are mapped correctly

- [x] Server action validation (AC: 2, 3)
  - [x] In `src/app/(app)/profile/actions.ts::updateProfile`, add a guard that rejects `warningThreshold >= dangerThreshold` with an error string returned as `{ error: "Warning threshold must be less than danger threshold." }`
  - [x] Add range validation: `warningThreshold` must be 0–100, `dangerThreshold` must be 0–100
  - [x] Apply threshold fields to `dbPatch` so they persist to DB when included
  - [x] Keep existing `{ error: "Something went wrong." }` catch block — no special error handling for threshold failures

- [x] Component — Settings section (AC: 1, 2, 4)
  - [x] Add "Budget" heading inside `src/app/(app)/profile/preferences-section.tsx`, above the threshold inputs — use the existing `Section` component with `title="Budget"` (matching EXPERIENCE.md's Information Architecture: Settings → Preferences → Budget)
  - [x] Add state: `warningThreshold` (default `user.warningThreshold ?? 80`), `dangerThreshold` (default `user.dangerThreshold ?? 90`)
  - [x] Add two number inputs using the `Field` pattern — `Field label="Warning %" htmlFor="pref-warning"` and `Field label="Danger %" htmlFor="pref-danger"` — side by side in a flex row (`flex gap-3`)
  - [x] Each input: `type="number"`, `min={0}`, `max={100}`, clamped on change (`Math.min(100, Math.max(0, value))`)
  - [x] Validation: compute `thresholdError` — non-null when `warningThreshold >= dangerThreshold`, with message "Warning must be less than danger."
  - [x] Pass `thresholdError` to the Warning input's `Field` via `error` prop when the error applies to the Warning field; for Danger field, show "Must be greater than warning." when `dangerThreshold <= warningThreshold`
  - [x] Disable the Save button when `thresholdError` exists (in addition to the existing `!isDirty` / `isPending` / `currencyError` checks)
  - [x] Include `warningThreshold` and `dangerThreshold` in `computeDirty()` and the save patch when they differ from initial user values
  - [x] No additional `revalidatePath` calls needed — the existing `revalidatePath("/profile")` and `revalidatePath("/trips")` already cover Settings and all trip Budget tabs

- [x] Unit tests (AC: 1, 2, 3, 4, 5)
  - [x] **`preferences-section.test.tsx`**: Verify Budget heading renders, threshold inputs render with defaults (80/90), warning ≥ danger disables save and shows inline error, valid pair enables save, only threshold fields sent in patch when only thresholds change, existing field tests still pass
  - [x] **`profile/actions.test.ts`**: Add `updateProfile` tests for threshold validation — warning ≥ danger rejected, valid pair accepted, out-of-range values rejected, existing field updates still work alongside threshold fields

## Dev Notes

### Story 1.8 scope (what it does and does not do)

Adds per-user warning/danger threshold settings to Settings → Preferences → Budget. This is the **data-entry** part of the threshold feature (FR-10). Story 1.9 (Threshold Status Indicator) reads these persisted values and drives the Budget tab's status badge, progress bar fill, and tab icon.

**This story does NOT add:**
- The status badge or progress bar threshold states on the Budget tab (Story 1.9)
- The `calculateBudgetStatus()` function in `lib/budget.ts` — already built in Story 1.4
- The tab status icon (Story 1.9)
- The `warning`/`warning-soft`/`warning-ink`/`danger-soft`/`danger-ink` CSS tokens (Story 1.9)

### What must be preserved

- **Existing preferences-section.tsx behavior** — the date format, currency, distance unit, and cover type fields must continue working exactly as before. The Budget section is additive; no existing field or save logic changes.
- **Existing `updateProfile` action contract** — returns `{ error?: string }` on failure, `{}` on success. Threshold validation follows the same pattern as existing `currency` validation (return early with error string, don't throw).
- **Existing dirty-checking logic** — `computeDirty` must incorporate threshold fields. The `isDirty` signal and Save button enable/disable must reflect all field changes together.

### Existing code state — read before editing

**`src/db/schema.ts:users` table** — currently has `id`, `name`, `email`, `emailVerified`, `image`, `passwordHash`, `dateFormat`, `currency`, `distanceUnit`, `passportNumber`, `passportExpiry`, `passportNationality`, `knownTravelerNumber`, `defaultCoverType`. No threshold columns exist.

**`src/data/types.ts`** — `UserProfile` has no threshold fields. `UpdateUserProfilePatch` has no threshold fields. Both need additions.

**`src/app/(app)/profile/actions.ts::updateProfile`** — validates individual fields (currency format, date format, etc.) and returns `{ error: "Something went wrong." }` on DB failure. New threshold validation slots into the same function: validate thresholds after existing field validations, before the DB update call.

**`src/app/(app)/profile/preferences-section.tsx`** — renders date format toggle, currency input, distance unit toggle, cover type toggle, and a save-footer. State management uses `useState` per field, with a `computeDirty()` function and `onDirtyChange` callback. The Budget section is additive: a new `<Section title="Budget">` block, two number inputs inside it.

**`src/components/packt/form-section.tsx`** — `Field` component accepts `label`, `htmlFor`, `error`, `children`. The `error` prop renders an inline error message in red under the field when non-null. This is how threshold validation errors should be displayed.

**`src/db-mappers.ts`** — need to verify the exact function that maps user DB rows to `UserProfile` and add threshold field mapping. Search for functions like `dbUserToType` or similar.

### Architecture compliance

- **Pure additive change** — threshold columns use `default()` at the schema level, so existing rows without the column get the default 80/90 on read. No migration script needed (Drizzle is pre-release, uses `db:push`).
- **Scalar fields on the users table** — thresholds are user-level preferences, not per-trip settings. Stored directly on `users`, matching how `currency`, `dateFormat`, and `distanceUnit` are stored.
- **Inline validation, not toast-only** — as specified in UX-DR16. The `Field` component's `error` prop already supports this pattern.
- **DB-push only** — Drizzle is pre-release per `docs/drizzle-workflow.md`; schema changes go through `db:push`, no tracked migration files.
- **Server-side validation with client-side feedback** — client blocks save via disabled button + inline error; server also rejects invalid pairs as defense-in-depth.
- **No extra revalidation needed** — the existing `revalidatePath("/profile")` + `revalidatePath("/trips")` in `updateProfile` already cover the Settings page and all trip Budget tabs. The `/trips` revalidation cascades to all trip sub-routes.

### Previous story intelligence (Story 1.7 — Trip Currency Change Confirmation)

**Dev patterns established:**
- `budget/actions.ts` uses `requireUser()` + `assertTripAccess()` on every action — pattern applies to trip-scoped actions only, not user-profile actions
- `revalidatePath()` after every mutation
- Toast via `sonner`: `toast.error(message)` / `toast.success(message)` — the preferences-section already uses this pattern
- Inline validation via `Field.error` prop — this story uses the same mechanism
- DB defaults at column level for existing rows
- All-or-nothing database updates

**Review findings from Story 1.7 that apply here:**
- Empty/null initial values for optional fields need `?? default` fallback — threshold defaults are 80/90 via the `default()` on the column, but in-memory state still needs `user.warningThreshold ?? 80` in case the row hasn't been re-read since the migration
- Colocated test files: `.test.tsx` next to source, `userEvent` for interactions, `describe`/`it` blocks
- Inline validation error is always passed via `Field.error` prop (UX-DR16) — never toast-only for threshold validation

**Testing patterns established:**
- `vi.mock("./actions", ...)` for action mocking
- `vi.mock("sonner", ...)` for toast mocking
- `mockUser` fixture typed as `UserProfile`
- `userEvent.clear()` then `userEvent.type()` for text inputs
- `userEvent.click()` for buttons
- Asserting both button disabled state and inline error presence
- Selective patch assertions: changing only one field sends only that field in the patch

**Key reuse from existing code:**
- `Field` component from `form-section.tsx` — `error` prop for inline validation
- `Section` component with `title` prop — add `title="Budget"` for the new section
- `Input` from `@/components/ui/input` — already used for currency input
- Existing dirty-checking pattern — extend `computeDirty()` and the save patch

### Git intelligence

Recent commits:
- `2b91353` Merge branch 'main' of https://github.com/sdesmond/packt into feature/budget
- `c65da57` fix: thread currencyChangeMode through date-conflict resolution
- `b44097a` docs: mark story 1.7 (Trip Currency Change Confirmation) ready for review

Takeaways: the project is actively working through Epic 1 stories. Reviews catch edge cases like same-day staleness bugs (Story 1.7). Ensure: every AC has a test, edge cases (out-of-range values, warning ≥ danger, existing fields unchanged) are covered, and existing preferences-section tests still pass.

### File structure requirements

**MODIFIED files:**

| File | Change |
|------|--------|
| `src/db/schema.ts` | Add `warningThreshold`/`dangerThreshold` columns to `users` table |
| `src/data/types.ts` | Add threshold fields to `UserProfile` and `UpdateUserProfilePatch` |
| `src/lib/db-mappers.ts` | Add threshold field mapping to the user row → `UserProfile` mapper |
| `src/app/(app)/profile/actions.ts` | Add threshold validation in `updateProfile()` |
| `src/app/(app)/profile/preferences-section.tsx` | Add Budget section with two number inputs, inline validation |
| `src/app/(app)/profile/preferences-section.test.tsx` | Add threshold input + validation tests |
| `src/app/(app)/profile/actions.test.ts` | Add threshold validation tests |

**No changes needed to:** `src/lib/budget.ts` (Story 1.4 already provides `calculateBudgetStatus()`), `src/components/packt/trip-budget-tab.tsx` (uses thresholds from user profile, handled in Story 1.9), `src/lib/queries.ts` (thresholds are user-level, not fetched via queries).

### Library requirements

- No new npm packages
- `Input` from `@/components/ui/input` — already used by the currency field
- `Field` and `Section` from `@/components/packt/form-section` — already used
- `toast` from `sonner` — already used
- No new UI primitives needed

### Testing requirements

**`preferences-section.test.tsx` additions:**
- "renders Budget section with heading" — Budget heading visible
- "renders threshold inputs with defaults" — Warning % defaults to 80, Danger % defaults to 90
- "renders threshold inputs with saved values" — user with `warningThreshold: 50, dangerThreshold: 75` shows those values
- "Save disabled when warning >= danger" — set warning to 90, danger to 50, warning ≥ danger, Save disabled, inline error visible
- "Save enabled with valid threshold pair" — warning < danger, Save enabled
- "only threshold fields sent in patch when only thresholds change" — change warning value, save, `updateProfile` called with `{ warningThreshold: X, dangerThreshold: 90 }`
- "Existing field functionality preserved" — date format, currency, distance unit toggles still work
- "changing thresholds marks dirty" — after changing threshold, Save becomes enabled

**`src/lib/db-mappers.test.ts` additions:**
- New threshold fields (`warningThreshold`, `dangerThreshold`) mapped correctly in user row → `UserProfile` conversion
- Existing field mappings still present and unchanged

**`profile/actions.test.ts` additions:**
- "rejects warning threshold >= danger threshold" — returns `{ error: "Warning threshold must be less than danger threshold." }`
- "rejects warning threshold out of range" — < 0 or > 100
- "rejects danger threshold out of range" — < 0 or > 100
- "accepts valid threshold pair" — returns `{}`, DB updated
- "threshold fields can be combined with other fields" — patch with `{ currency: "EUR", warningThreshold: 30 }` accepted
- "existing field validation still works when thresholds present" — `{ currency: "INVALID", warningThreshold: 50 }` rejects currency, not threshold

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- `npx vitest run "src/app/(app)/profile/preferences-section.test.tsx" "src/app/(app)/profile/actions.test.ts" "src/lib/db-mappers.test.ts"` — 153 passed
- `npx vitest run "src/components/packt/sidebar-nav.test.tsx" "src/app/(app)/profile/passport-section.test.tsx" "src/app/(app)/profile/page-client.test.tsx" "src/app/(app)/profile/identity-section.test.tsx"` — 31 passed (fixtures updated for new required UserProfile fields)
- `npx tsc --noEmit` — clean
- `npx eslint <changed files>` — clean
- `npm run db:migrate:e2e` / `npm run db:push` — pushed new columns to both E2E and dev databases
- packt-build-validator (full run, since schema.ts is a shared file forcing full E2E scope):
  - LINT: PASS
  - TSC: PASS
  - COVERAGE: PASS — 2582 passed, 0 failed (lines 96.5%, functions 96.19%, branches 90.49%)
  - E2E: PASS — 158 scenarios passed, 0 failed (`npm run test:e2e`)
  - BUILD: PASS

### Completion Notes List

- Implemented threshold columns, types, DB mapper, server validation, and the Budget settings section exactly per story tasks.
- Server-side pair validation (AC2) does not re-fetch the user row: the component always sends `warningThreshold` and `dangerThreshold` together whenever either changes (see `preferences-section.tsx::handleSave`), so `updateProfile` validates the pair using `patch.warningThreshold ?? 80` / `patch.dangerThreshold ?? 90` without a DB round-trip. This matches the testing requirements' expectation that a single-field threshold change still sends both fields in the patch.
- Deviation from Dev Notes: `src/lib/queries.ts::getUserById` *did* need a change despite the story's "No changes needed" note for that file — it builds `UserProfile` via an explicit `db.select({...})` (not `dbUserToType`), so the new columns had to be added to that select list or the Settings page would have rendered `undefined` thresholds for any real signed-in user. `queries.ts` is excluded from coverage so no new test was required there.
- Four other test fixtures (`sidebar-nav.test.tsx`, `passport-section.test.tsx`, `page-client.test.tsx`, `identity-section.test.tsx`) constructed `UserProfile` literals directly and needed `warningThreshold`/`dangerThreshold` added since the fields are now required (non-optional) on the type.
- No E2E `.feature` file was added. The story's Testing Requirements section scoped this story to unit/component tests only (matching the precedent set by the `currency`/`distanceUnit` fields on the same component, which also have no dedicated E2E coverage); only `defaultCoverType` and `dateFormat` have existing dedicated feature files.

### File List

- `_bmad-output/implementation-artifacts/1-8-configure-spend-threshold-settings.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `src/db/schema.ts` — added `warning_threshold` and `danger_threshold` columns to `users` table
- `src/data/types.ts` — added `warningThreshold`/`dangerThreshold` to `UserProfile` and `UpdateUserProfilePatch`
- `src/lib/db-mappers.ts` — added threshold field mapping
- `src/lib/db-mappers.test.ts` — new threshold mapping tests
- `src/lib/queries.ts` — added `warningThreshold`/`dangerThreshold` to `getUserById`'s select (not listed in story's File Structure Requirements, but required for the fields to reach the Settings page)
- `src/app/(app)/profile/actions.ts` — added threshold validation
- `src/app/(app)/profile/actions.test.ts` — new threshold validation tests
- `src/app/(app)/profile/preferences-section.tsx` — new Budget section with threshold inputs
- `src/app/(app)/profile/preferences-section.test.tsx` — new threshold input tests
- `src/components/packt/sidebar-nav.test.tsx` — added required threshold fields to `UserProfile` test fixture
- `src/app/(app)/profile/passport-section.test.tsx` — added required threshold fields to `UserProfile` test fixture
- `src/app/(app)/profile/page-client.test.tsx` — added required threshold fields to `UserProfile` test fixture
- `src/app/(app)/profile/identity-section.test.tsx` — added required threshold fields to `UserProfile` test fixture

## Change Log

- 2026-06-26: Implemented Story 1.8 — schema columns, types, DB mapper, server validation, Budget settings section, and tests. Full build-validator run (lint/tsc/coverage/E2E/build) passed. Status moved to `review`.
