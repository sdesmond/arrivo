# Story 3.4: Database Schema Housekeeping

Status: ready-for-dev

## Story

As a developer,
I want to add missing indexes and name anonymous indexes in the packing schema,
So that query performance is predictable and the schema is self-documenting.

## Acceptance Criteria

### AC #1 — LabelId index on packingTemplateItems

**Given** the `packingTemplateItems` table
**When** a query filters by `labelId` alone
**Then** it uses an index (not a full table scan)

### AC #2 — Named index on packingTemplates.userId

**Given** the `packingTemplates.userId` index exists
**When** the schema is inspected
**Then** it has an explicit name (`packing_templates_user_id_idx`)

## Tasks / Subtasks

- [ ] Add named `labelId` index on `packingTemplateItems` (AC: #1)
- [ ] Rename anonymous index on `packingTemplates.userId` to explicit name (AC: #2)

## Dev Notes

### Current Schema State

**`packingTemplates` table** — `src/db/schema.ts:304-317`:

```ts
export const packingTemplates = pgTable(
  "packing_templates",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
  },
  (table) => [index().on(table.userId)]  // ← anonymous index, must be named
);
```

**`packingTemplateItems` table** — `src/db/schema.ts:319-334`:

```ts
export const packingTemplateItems = pgTable(
  "packing_template_items",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    templateId: uuid("template_id").notNull().references(() => packingTemplates.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    isLabel: boolean("is_label").default(false).notNull(),
    position: integer("position").notNull(),
    labelId: uuid("label_id").references((): AnyPgColumn => packingTemplateItems.id, { onDelete: "set null" }),  // ← no index on labelId
  },
  (table) => [index().on(table.templateId, table.position)]  // existing compound index
);
```

### Index Patterns in Schema

Existing named indexes in schema follow the pattern `{table}_{column}_idx`:

| Table | Column | Current Index | Naming |
|-------|--------|--------------|--------|
| `packingTemplates` | `userId` | `index().on(table.userId)` | Anonymous — auto-named `packing_templates_user_id_index` |
| `packingTemplateItems` | `templateId, position` | `index().on(table.templateId, table.position)` | Anonymous |
| `packingTemplateItems` | `labelId` | **None** | Must add |
| `events` | `dayId, position` | `index().on(table.dayId, table.position)` | Anonymous |
| `userLoyaltyNumbers` | `userId, position` | `index().on(table.userId, table.position)` | Anonymous |
| `itineraryChecklists` | `dayId, position` | `index().on(table.dayId, table.position)` | Anonymous |
| `checklistItems` | `checklistId, createdAt` | `index().on(table.checklistId, table.createdAt)` | Anonymous |

Convention for this story: name indexes `{table}_{columns}_idx`.

### Migration Approach

The project currently uses `npm run db:push` (not tracked migrations) — see `docs/drizzle-workflow.md`. Schema changes are applied by pushing the full schema. No migration files to generate or commit.

When renaming the anonymous `userId` index to a named index, Drizzle drops the old auto-named index and creates the new one. With `db:push`, this is transparent.

After schema changes, run `npm run db:push` for dev and `npm run db:migrate:e2e` for E2E database sync.

### Implementation Details

**AC #1** — Add `labelId` index to `packingTemplateItems` table config:

```ts
(table) => [
  index().on(table.templateId, table.position),
  index("packing_template_items_label_id_idx").on(table.labelId),
]
```

**AC #2** — Replace anonymous `userId` index with named index on `packingTemplates` table config:

```ts
// Before:
(table) => [index().on(table.userId)]

// After:
(table) => [index("packing_templates_user_id_idx").on(table.userId)]
```

### Files to Modify

| File | Action | Changes |
|------|--------|---------|
| `src/db/schema.ts` | MODIFY | Rename index on `packingTemplates.userId` to explicit name; add `labelId` index on `packingTemplateItems` |

### What Must NOT Change

- No table columns, data types, defaults, or constraints are modified — indexes only
- No other tables touched (existing anonymous indexes on `events`, `userLoyaltyNumbers`, etc. are not in scope)
- No changes to `packingTemplateItems`'s existing compound index `(templateId, position)`
- No changes to server actions, queries, components, or types
- No behavior changes — purely administrative schema housekeeping

### Testing Requirements

No unit or E2E tests needed for this story — it is a pure schema administration task with zero behavior changes. All existing tests must continue passing.

After making changes, verify:
1. `npm run db:push` succeeds without errors
2. `npm run db:migrate:e2e` succeeds (E2E database sync)
3. `npm run test:e2e` passes (existing E2E flows should work unchanged)

### Library Constraints

- No new npm packages needed
- Drizzle ORM ^0.45.2 — the `index("name")` API is available
- `drizzle-kit` ^0.31.10 handles index rename via push

### Project Context Reference

- **All domain types** in `src/data/types.ts` — not relevant here, no types changed
- **Path alias** `@/*` → `./src/*`
- **No `any` types** — not applicable here
- **Colors:** always via CSS custom properties — not applicable
- **Schema file**: `src/db/schema.ts` — single source of truth, Drizzle-managed

### Previous Story Intelligence (3.3)

From `3-3-optimistic-update-reliability.md`:

- Story 3.3 modified `packing-list-view.tsx`, `use-trip-detail-handlers.ts`, `packing-list-sortable.tsx`, `packing-contextual-add-form.tsx`, and their test files
- None of those files are relevant to this schema-only story
- Story 3.2 created `packing-actions.ts` and added `packing_template_items`, `idempotency_keys` tables to schema
- The `packingTemplateItems` table and its `labelId` column were introduced in story 2.2 (template item management) — the missing index on `labelId` was deferred to this tech debt epic

### Git Intelligence

Recent commits affecting `src/db/schema.ts`:
- `3873bf5` — fix: apply code review patches for story 3.2 (added `idempotency_keys` table)
- `9bdb662` — feat: harden trip packing server actions (schema changes for packing items)
- `ee310b3` — feat: add packing_template_items table, types, and data layer (original introduction of `packingTemplateItems`)

The `packingTemplateItems` table was added without a `labelId` index, which was acknowledged as deferred tech debt. This story closes that gap.

## Dev Agent Record

### Agent Model Used

opencode/big-pickle

### Completion Notes List

- Story 3.4 is the first backlog story in epic 3 (Technical Debt & Polish) — 3.1-3.3 are done
- Only file to modify: `src/db/schema.ts`
- No test changes needed — purely administrative schema housekeeping
- Migration: `npm run db:push` for dev, `npm run db:migrate:e2e` for E2E

### File List

- `src/db/schema.ts` — MODIFY (two index changes)
