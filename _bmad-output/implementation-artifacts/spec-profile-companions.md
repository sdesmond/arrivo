---
title: 'Profile: Saved Companions'
type: 'feature'
created: '2026-05-18'
status: 'done'
baseline_commit: '13689a58f3125c1e065118cf5a4a06b0499ef602'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Packt has no way to store people the user regularly travels with. Family organizers and group travelers need to record companion details (travel docs, age) once and reuse them across trips.

**Approach:** Add a Companions tab to the profile sidebar nav backed by a new `user_companions` DB table. Each companion stores name, age, travel documents (passport number/expiry/nationality, KTN), and an optional Packt username. Full CRUD via server actions, companion rows expand inline for editing.

## Boundaries & Constraints

**Always:**
- New `user_companions` table with FK to `users`, position ordering, and all travel-doc fields mirroring the user's own passport fields
- Packt username stored as plain text — no validation against real user accounts (trip-sharing linkage is future scope)
- Follow existing section conventions: `Section` wrapper, `requireUser()` ownership guard on every server action, `revalidatePath("/profile")` after mutations
- Companions sorted ascending by `position`

**Ask First:**
- If the number of companion fields needs to be trimmed for scope, ask before removing any

**Never:**
- No bulk import/CSV
- No companion-to-collaborator linkage in this spec
- Do not modify or reuse the existing `collaborators` table for companions

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Add companion — happy | name filled, Add clicked | Row appears in list, name form clears | — |
| Add companion — empty name | name blank | Add button disabled | — |
| Delete companion | Remove clicked on row | Row removed; position gaps close via re-query | — |
| Edit companion fields | expand row, change passport/age, save | Saved to DB; row shows updated name/age summary | — |
| No companions yet | empty list | "No companions saved yet" message + add form visible | — |
| Packt username | optional text field | Stored as-is; no existence check | — |

</frozen-after-approval>

## Code Map

- `src/db/schema.ts` — add `userCompanions` table
- `src/data/types.ts` — add `Companion`, `AddCompanionInput`, `UpdateCompanionPatch`; extend `UserProfile`; add `"companions"` to `ProfileSection`
- `src/lib/db-mappers.ts` — add `dbCompanionToType` mapper following existing `dbLoyaltyToType` pattern
- `src/lib/db-mappers.test.ts` — add test cases for `dbCompanionToType`
- `src/lib/queries.ts` — extend `getUserById()` to fetch companions via parallel query
- `src/app/(app)/profile/actions.ts` — add `addCompanion`, `updateCompanion`, `deleteCompanion` server actions
- `src/app/(app)/profile/companion-row.tsx` — new client component: single companion accordion row (collapsed/expanded, field inputs, Save/Cancel, delete)
- `src/app/(app)/profile/companions-section.tsx` — new client component: list shell, empty state, add form, renders `<CompanionRow>` per entry
- `src/app/(app)/profile/page-client.tsx` — add Companions nav item and TabsContent
- `tests/e2e/e2e-seed-data.ts` — add E2E companion seed constant
- `tests/e2e/global-setup.ts` — insert seed companion in E2E setup
- `tests/e2e/features/profile.feature` — Companions tab scenarios
- `tests/e2e/steps/profile.steps.ts` — Companions step definitions

## Tasks & Acceptance

**Execution:**
- [x] `src/db/schema.ts` -- add `userCompanions` table: id (uuid PK), userId (FK→users cascade), name (text not null), age (integer nullable), passportNumber (text nullable), passportExpiry (date nullable), passportNationality (text nullable), knownTravelerNumber (text nullable), packtUsername (text nullable), position (integer not null), createdAt (timestamp) -- data persistence
- [x] `src/data/types.ts` -- add `Companion` interface (id, name, age?: number, passportNumber?, passportExpiry?, passportNationality?, knownTravelerNumber?, packtUsername?, position); add `AddCompanionInput` (name, age?); add `UpdateCompanionPatch` (name?, age?, passportNumber?, passportExpiry?, passportNationality?, knownTravelerNumber?, packtUsername?); extend `UserProfile` with `companions: Companion[]`; add `"companions"` to `ProfileSection` -- type safety
- [x] `src/lib/db-mappers.ts` -- add `dbCompanionToType(row: typeof userCompanions.$inferSelect): Companion` mapper alongside existing mappers -- data mapping
- [x] `src/lib/db-mappers.test.ts` -- add test cases for `dbCompanionToType`: full field mapping and all-nullable fields case -- unit test
- [x] `src/lib/queries.ts` -- add `userCompanions` to `getUserById()` parallel fetch, call `dbCompanionToType` per row, sort by position ascending -- data access
- [x] `src/app/(app)/profile/actions.ts` -- add `addCompanion(input: AddCompanionInput)`, `updateCompanion(id: string, patch: UpdateCompanionPatch)`, `deleteCompanion(id: string)`, each guarded with `requireUser()` ownership check and ending with `revalidatePath("/profile")` -- server mutations
- [x] `src/app/(app)/profile/companion-row.tsx` -- new "use client" component `CompanionRow` with explicit `CompanionRowProps { companion: Companion }` interface; collapsed: shows name + age badge, Edit button (`aria-label="Edit {name}"`), Remove button (`aria-label="Remove {name}"`); Edit activatable via click, Enter, or Space; on expand focus moves to first field; Escape or Cancel collapses and returns focus to Edit button; expanded: 6 labeled inputs with `htmlFor`/`id` pairing (age, passportNumber, passportExpiry as type="date", passportNationality, knownTravelerNumber, packtUsername); packtUsername has visible helper text "Used for future trip sharing"; Save/Cancel at bottom; calls `updateCompanion` on save, `deleteCompanion` on remove -- per-row accordion
- [x] `src/app/(app)/profile/companions-section.tsx` -- new "use client" component `CompanionsSection` with explicit `CompanionsSectionProps { companions: Companion[] }` interface; "No companions saved yet" empty state when list is empty; maps companions to `<CompanionRow>`; add form at bottom with `<label htmlFor="companion-name">Name</label>` + `<input id="companion-name" aria-describedby="companion-name-hint">` + hint `<span id="companion-name-hint">Enter a name to add a companion</span>` + Add button (disabled when name blank); calls `addCompanion` on submit, clears field on success -- list shell + add form
- [x] `src/app/(app)/profile/page-client.tsx` -- add `{ value: "companions", label: "Companions" }` after "traveler" in `NAV_ITEMS`; add `<TabsContent value="companions" className="w-full"><CompanionsSection companions={user.companions} /></TabsContent>`; dirty tracking not required (row-by-row commit model) -- wire-up
- [x] `tests/e2e/e2e-seed-data.ts` -- export `E2E_COMPANION` constant with name "Alex Companion" and age 30 -- test data
- [x] `tests/e2e/global-setup.ts` -- insert `E2E_COMPANION` into `user_companions` for the E2E user after table truncation -- test setup
- [x] `tests/e2e/features/profile.feature` -- add scenarios: navigate to Companions tab and see seeded companion; add a new companion; delete a companion -- E2E coverage
- [x] `tests/e2e/steps/profile.steps.ts` -- implement step definitions for Companions scenarios -- E2E execution

**Acceptance Criteria:**
- Given logged-in user, when Profile page loads, then "Companions" appears in the sidebar nav
- Given no companions, when Companions tab is active, then "No companions saved yet" is visible and the add form is present
- Given the name input is empty, when the Add button is focused, then it is disabled and the hint text is announced to screen readers
- Given a companion name is entered and Add clicked, when action completes, then the new companion row appears in the list
- Given a companion row, when Remove is clicked, then the row is removed from the list
- Given a companion row, when Edit is activated (click or Enter/Space), then the row expands and focus moves to the first field
- Given a companion row is expanded, when Escape or Cancel is activated, then the row collapses and focus returns to the Edit button
- Given a companion row is expanded and fields are saved, then those values persist across a page reload
- Given the Companions tab is active, when navigating to another tab, then no unsaved-changes dialog fires (row-by-row commit model)

## Design Notes

`CompanionRow` owns all per-companion state (isExpanded, local field values, isPending). `CompanionsSection` is a thin list shell — no cross-row state. Multiple rows can be expanded simultaneously. Collapsed row shows name (bold) + age in parentheses if set. Expanded grid is 2-column on sm+, 1-column on mobile, matching PassportSection layout.

## Verification

**Commands:**
- `npm run db:migrate:e2e` -- expected: `user_companions` table created in packt_e2e
- `npm test -- --run` -- expected: all unit tests pass including new db-mapper cases
- `npm run test:e2e` -- expected: new Companions scenarios green
- `npm run build` -- expected: no TypeScript or lint errors

## Suggested Review Order

**Entry point — component split design**

- `CompanionRow`: accordion row owns all per-companion state and mutations
  [`companion-row.tsx:22`](../../src/app/(app)/profile/companion-row.tsx#L22)

- `CompanionsSection`: thin list shell delegates everything to `CompanionRow`
  [`companions-section.tsx:23`](../../src/app/(app)/profile/companions-section.tsx#L23)

**Keyboard & focus management**

- Expand/collapse toggle button with `aria-expanded` and labeled focus return
  [`companion-row.tsx:97`](../../src/app/(app)/profile/companion-row.tsx#L97)

- `useEffect` moves focus to first field on expand; `handleKeyDown` catches Escape
  [`companion-row.tsx:38`](../../src/app/(app)/profile/companion-row.tsx#L38)

**A11y — add form**

- `sr-only` label + `aria-describedby` hint on the add-name input
  [`companions-section.tsx:46`](../../src/app/(app)/profile/companions-section.tsx#L46)

**Server mutations (ownership + revalidation)**

- Three actions: add (count-based position), update (id+userId WHERE), delete (id+userId WHERE)
  [`actions.ts:86`](../../src/app/(app)/profile/actions.ts#L86)

**Schema**

- `userCompanions` table — all travel-doc fields, position index
  [`schema.ts:274`](../../src/db/schema.ts#L274)

**Data layer**

- `dbCompanionToType` mapper — null → undefined for all optional fields
  [`db-mappers.ts:130`](../../src/lib/db-mappers.ts#L130)

- Companion fetch wired into the parallel `Promise.all` in `getUserById`
  [`queries.ts:47`](../../src/lib/queries.ts#L47)

**Nav wiring**

- "Companions" added to `NAV_ITEMS` + `TabsContent` (no dirty tracking — row-by-row model)
  [`page-client.tsx:17`](../../src/app/(app)/profile/page-client.tsx#L17)

**Types**

- `Companion`, `AddCompanionInput`, `UpdateCompanionPatch`, `ProfileSection` extension
  [`types.ts:100`](../../src/data/types.ts#L100)

**Tests**

- `dbCompanionToType` unit tests: null-fields and full-fields cases
  [`db-mappers.test.ts:479`](../../src/lib/db-mappers.test.ts#L479)

- E2E scenarios: view seeded companion, add, delete
  [`profile.feature:63`](../../tests/e2e/features/profile.feature#L63)

## Verification

**Commands:**
- `npm run db:migrate:e2e` -- expected: `user_companions` table created in packt_e2e
- `npm test -- --run` -- expected: all unit tests pass
- `npm run test:e2e` -- expected: new Companions scenarios green
- `npm run build` -- expected: no TypeScript or lint errors
