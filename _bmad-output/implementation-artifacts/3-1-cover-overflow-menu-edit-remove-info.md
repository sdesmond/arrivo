---
baseline_commit: 6e5365095e062a2e1909829c9d918566d9f7ca07
---

# Story 3.1: Cover Overflow Menu — Edit/Remove/Info

Status: done

## Story

As a trip planner,
I want a "⋯" menu on my trip's cover image with quick actions to edit, remove, or see photo credit,
so that I can manage my cover image without opening the full trip edit sheet.

## Acceptance Criteria

1. **Schema: photographer columns** — `trips` table in `src/db/schema.ts` gains two nullable text columns: `coverPhotographer` and `coverPhotographerUrl`. `Trip` in `src/data/types.ts` gains optional `coverPhotographer?: string` and `coverPhotographerUrl?: string` fields. `dbTripToType()` in `src/lib/db-mappers.ts` maps both (null→undefined).

2. **CoverImageSearchResult extended with photographerUrl** — `CoverImageSearchResult` in `src/data/types.ts` gains `photographerUrl?: string`. `searchCoverImages()` in `src/app/(app)/trips/cover-image-search-actions.ts` maps `result.user.links.html` as `photographerUrl` (the `UnsplashSearchResponse` internal interface gains `user: { name: string; links: { html: string } }`). The E2E stub builder (search function's mock-data fallback) produces a stub profile URL per result.

3. **Search tab onImageSelected passes photographer info** — `CoverImagePickerSearchTabProps.onImageSelected` changes from `(url: string) => void` to `(image: { url: string; photographer: string; photographerUrl?: string }) => void`. The search tab's photo-button `onClick` changes from `() => onImageSelected(item.url)` to `() => onImageSelected({ url: item.url, photographer: item.photographer, photographerUrl: item.photographerUrl })`. The map tile button stays on the old URL-only path since Map tiles have no photographer — `onImageSelected(mapTileUrl)`.

4. **CoverImagePicker.onImageSelected accepts image object** — `CoverImagePickerProps.onImageSelected` changes from `(url: string) => void` to `(image: { url: string; photographer?: string; photographerUrl?: string }) => void`. `handleSelect` changes to pass the full object. All 4 tab callers (`handleSelect` from Upload/URL/Custom calling `onImageSelected(...)`) pass `{ url }` without photographer info (or pass it from the search tab when available). `trip-edit-cover.tsx` (being removed in Story 3.2) updates to `onCoverImageUrlChange(image.url)` — discarding the photographer fields — so it continues to work until deletion.

5. **Unsplash photo selection persists both photographer fields** — When a user selects an Unsplash search result as their cover, the `CoverImagePicker`'s parent saves `coverImageUrl`, `coverPhotographer`, and `coverPhotographerUrl` together on the trip. Selecting a Map, Graphic, custom upload, or URL-based Photo cover saves `coverImageUrl` with `coverPhotographer`/`coverPhotographerUrl` set to cleared.

6. **Cover Overflow Menu renders on trip-detail-hero.tsx** — `trip-detail-hero.tsx` shows a "⋯" overflow trigger at `absolute top-2 right-2` inside the `TripCover` wrapper div, `MoreHorizontal` icon (`18px`, `strokeWidth={1.5}`), `bg-black/25 text-white backdrop-blur-sm` (hover: `bg-black/45`), `6px` radius, `title="Cover options"`. Opens a `DropdownMenuContent` (`side="bottom" align="end"`, `var(--bg)`/`1px solid var(--line)`/`xl` radius/`shadow-3`). This is a **new menu instance** — not a modification of `now-card.tsx`'s trip-list overflow menu.

7. **Edit Cover (always present)** — Opens the existing `CoverImagePicker` dialog directly. When an image is selected with photographer info, persists `coverImageUrl`, `coverPhotographer`, `coverPhotographerUrl` via `setTripCoverWithAttribution` server action. When an image is selected without photographer info, saves with `coverPhotographer`/`coverPhotographerUrl` cleared.

8. **Remove Cover (only when CoverType is Photo or Map)** — `Trash2` icon, destructive-icon convention matching "Remove day". Selecting it sets the cover to a random Graphic (via existing `deriveGraphicCover` helper) with no confirmation dialog — reversible via Edit Cover. `coverPhotographer`/`coverPhotographerUrl` are cleared.

9. **Info (only when cover is an Unsplash photo — `CoverType === "photo"` AND `coverPhotographer` is set)** — `Info` icon. Opens a dialog showing the photographer's name and a link to their Unsplash profile (`coverPhotographerUrl`).

10. **Dependent menu item visibility** — After any action that changes `CoverType` or attribution fields, the menu's available items (Remove Cover, Info) immediately reflect the new state on next open — no stale conditional items.

11. **Server action `removeTripCover`** — Added to `src/app/(app)/trips/[tripId]/actions.ts`: `requireUser()` → `assertTripAccess(tripId, user.id!, "editor")` → fetch trip name → update `trips` row setting `coverImageUrl` to a random Graphic cover URL (`deriveGraphicCover(trip.name)`) and `coverPhotographer`/`coverPhotographerUrl` to `null` → `revalidatePath(/trips/${tripId})`. Returns `Promise<void>`, throws `Error(...)` on failure.

12. **Attribution dialog for Unsplash photographer credit** — New component or inline Dialog: shows photographer name as heading, a link to `coverPhotographerUrl` (opens in new tab), styled per existing `add-doc-dialog.tsx`/`delete-*-alert-dialog.tsx` pattern. One `<Button>` to close.

13. **Unit/component tests** — `trip-detail-hero.test.tsx` (overflow trigger renders, conditional Edit/Remove/Info items per `CoverType`/`coverPhotographer` combinations, Edit opens `CoverImagePicker`, Remove calls the new server action with correct params, Info opens the attribution dialog with correct name/link), `actions.test.ts` extended (`removeTripCover` sets Graphic cover + clears attribution), `cover-image-search-actions.test.ts` extended (`photographerUrl` mapping, E2E stub), `db-mappers.test.ts` extended (new Trip fields), `cover-image-picker.test.tsx` extended (`onImageSelected` callback with new shape including photographer info from search tab).

14. **E2E** — New file `tests/e2e/features/trip-cover-overflow.feature` with scenarios for (1) selecting an Unsplash photo cover then viewing its Info dialog, and (2) removing a Photo cover and verifying it becomes a Graphic and "Remove Cover"/"Info" are no longer shown on next open.

## Tasks / Subtasks

- [x] **Task 1: Schema — photographer columns** (AC: 1)
  - [x] Add `coverPhotographer` (nullable text) and `coverPhotographerUrl` (nullable text) to `trips` table in `src/db/schema.ts`
  - [x] Run `npm run db:migrate:e2e` to push schema to E2E database

- [x] **Task 2: Types — extend Trip, CoverImageSearchResult** (AC: 1, 2)
  - [x] Add `coverPhotographer?: string` and `coverPhotographerUrl?: string` to `Trip` in `src/data/types.ts`
  - [x] Add `photographerUrl?: string` to `CoverImageSearchResult` in `src/data/types.ts`
  - [x] No changes to `UpdateTripPatch` — cover attribution is handled by a dedicated server action, not the general metadata patch

- [x] **Task 3: DB mapper — coverPhotographer/coverPhotographerUrl** (AC: 1)
  - [x] Extend `dbTripToType()` in `src/lib/db-mappers.ts`: add `coverPhotographer: row.coverPhotographer ?? undefined`, `coverPhotographerUrl: row.coverPhotographerUrl ?? undefined`
  - [x] Add/extend `src/lib/db-mappers.test.ts` mapping assertions for the new fields

- [x] **Task 4: Cover image search — photographerUrl mapping** (AC: 2)
  - [x] Extend `UnsplashSearchResponse` internal interface: add `user: { name: string; links: { html: string } }`
  - [x] Extend `searchCoverImages()` return mapping: add `photographerUrl: result.user.links.html`
  - [x] Update E2E stub builder in the search function to produce a stub `photographerUrl` per result (e.g. `photographerUrl: "https://unsplash.com/@stub"`)
  - [x] Extend `cover-image-search-actions.test.ts` coverage in `src/app/(app)/trips/actions.test.ts` to assert the `photographerUrl` mapping and E2E stub output

- [x] **Task 5: CoverImagePickerSearchTab — extended onImageSelected** (AC: 3)
  - [x] Change `CoverImagePickerSearchTabProps.onImageSelected` signature from `(url: string) => void` to `(image: { url: string; photographer: string; photographerUrl?: string }) => void`
  - [x] Update photo button `onClick` from `() => onImageSelected(item.url)` to `() => onImageSelected({ url: item.url, photographer: item.photographer, photographerUrl: item.photographerUrl })`
  - [x] Keep map tile `onClick` as `() => onImageSelected(mapTileUrl)` — Map tiles have no photographer (pass just the string for backward compat; `CoverImagePicker.handleSelect` handles both string and object)

  **Architecture note**: The `onImageSelected` now accepts `string | { url: string; photographer?: string; photographerUrl?: string }` — the map tile passes a bare string (no photographer), the photo button passes a full object. `CoverImagePicker.handleSelect` normalizes: if the argument is a string, wraps it as `{ url }` before passing up.

- [x] **Task 6: CoverImagePicker — accept image object onImageSelected** (AC: 4)
  - [x] Change `CoverImagePickerProps.onImageSelected` from `(url: string) => void` to `(image: { url: string; photographer?: string; photographerUrl?: string }) => void`
  - [x] Update `handleSelect` to accept `string | { url: string; photographer?: string; photographerUrl?: string }`: if `typeof selected === "string"`, normalize to `{ url: selected }`, then call `onImageSelected(normalized)`
  - [x] Update Upload/URL/Custom tab callers — they currently call `onImageSelected(url)`, which maps through `handleSelect` and normalizes

- [x] **Task 7a: setTripCoverWithAttribution server action** (AC: 5, 7)
  - [x] Add `setTripCoverWithAttribution(tripId: string, coverImageUrl: string, coverPhotographer?: string | null, coverPhotographerUrl?: string | null): Promise<void>` to `src/app/(app)/trips/[tripId]/actions.ts`
  - [x] Pattern: `"use server"` → `const user = await requireUser()` → `await assertTripAccess(tripId, user.id!, "editor")` → `db.update(trips).set({ coverImageUrl, coverPhotographer, coverPhotographerUrl })` → `revalidatePath(/trips/${tripId})`
  - [x] Import `trips` from `@/db/schema`, `db` from `@/db`, `eq` from `drizzle-orm`
  - [x] Add/extend tests in `src/app/(app)/trips/[tripId]/actions.test.ts`

- [x] **Task 7b: removeTripCover server action** (AC: 8, 11)
  - [x] Add `removeTripCover(tripId: string): Promise<void>` to `src/app/(app)/trips/[tripId]/actions.ts`
  - [x] Pattern: `"use server"` → `const user = await requireUser()` → `await assertTripAccess(tripId, user.id!, "editor")` → fetch trip name: `const [trip] = await db.select({ name: trips.name }).from(trips).where(eq(trips.id, tripId)).limit(1)` → `deriveGraphicCover(trip.name)` → `db.update(trips).set({ coverImageUrl: graphicUrl, coverPhotographer: null, coverPhotographerUrl: null })` → `revalidatePath(/trips/${tripId})`
  - [x] Import `deriveGraphicCover` from `@/lib/utils`
  - [x] Add/extend `src/app/(app)/trips/[tripId]/actions.test.ts` with `removeTripCover` tests: sets Graphic cover, clears photographer fields, calls `assertTripAccess` with `"editor"`, `revalidatePath` called

- [x] **Task 8: trip-detail-hero.tsx — Cover Overflow Menu + image selection handler** (AC: 5, 6, 7, 8, 9, 10)
  - [x] The `TripDetailHero` component already receives `detail: TripDetailPayload` — `detail.trip` will contain `coverPhotographer` and `coverPhotographerUrl` after Task 2 type extension. These and `detail.trip.id` (as `tripId`) are available without new props.
  - [x] Wrap the existing `TripCover` element and its scrim overlay in a relative container with the overflow trigger (`MoreHorizontal` icon, `absolute top-2 right-2`, `bg-black/25 text-white backdrop-blur-sm`, `title="Cover options"`)
  - [x] Place `DropdownMenu` as parent of the trigger and content, wrapping the cover area — pattern mirrors `now-card.tsx` lines 100–140
  - [x] Three conditional `DropdownMenuItem`s:
    - [x] **Edit Cover** (always): opens `CoverImagePicker` directly via `{isPickerOpen && <CoverImagePicker ... />}`
    - [x] **Remove Cover** (only when current `CoverType` is Photo or Map): calls `removeTripCover` server action via `startTransition`, shows pending state
    - [x] **Info** (only when `CoverType === "photo"` AND `coverPhotographer` is set): opens attribution dialog with photographer name + link
  - [x] `CoverType` determination: use `parseGraphicCover()` from `@/lib/utils`. If `coverImageUrl` is undefined → `Graphic` (no Remove). If `parseGraphicCover(coverImageUrl)` returns a parsed graphic → `Graphic` (no Remove). If `coverImageUrl` starts with `/api/mapbox/static` → `Map` (Remove shown, no Info). If `coverImageUrl` is set and not a graphic/not a map tile → `Photo` (Remove shown). Unsplash = `Photo` AND `coverPhotographer` is set (Info shown).
  - [x] Image selection handler: when `CoverImagePicker.onImageSelected` fires, call `setTripCoverWithAttribution(detail.trip.id, image.url, image.photographer ?? null, image.photographerUrl ?? null)` via `startTransition` + `toast.error` on failure.
  - [x] Attribution dialog (Info action): renders a `Dialog` with photographer name and a link to `coverPhotographerUrl` (opens in new tab with `<a>`), single "Close" button. Reuse `add-doc-dialog.tsx`'s container pattern.

- [x] **Task 9: Attribution dialog component** (AC: 9)
  - [x] Create `src/components/packt/cover-attribution-dialog.tsx` ({`photographer: string; photographerUrl?: string; open: boolean; onClose: () => void`})
  - [x] Uses `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogFooter` from `@/components/ui/dialog`
  - [x] Shows photographer name in heading, link to Unsplash profile ("View on Unsplash", opens new tab), close button
  - [x] Create `src/components/packt/cover-attribution-dialog.test.tsx`

- [x] **Task 10: Update trip-edit-cover.tsx for breaking onImageSelected change** (AC: 4 bridge)
  - [x] `trip-edit-cover.tsx` currently calls `onCoverImageUrlChange(url)` from `onImageSelected(url)`. Change to `onCoverImageUrlChange(image.url)` to work with the new object-based callback. This is a temporary bridge — `trip-edit-cover.tsx` is fully removed in Story 3.2.

- [x] **Task 11: Unit/component tests** (AC: 13)
  - [x] `trip-detail-hero.test.tsx`: render with various `CoverType`/`coverPhotographer` combos, assert correct items visible, assert Edit opens picker, assert Remove calls action, assert Info opens dialog
  - [x] `actions.test.ts` extended: `removeTripCover` tests
  - [x] `cover-image-search-actions.test.ts` coverage added in `src/app/(app)/trips/actions.test.ts`: `photographerUrl` in mapping + E2E stub
  - [x] `db-mappers.test.ts` extended: new Trip fields
  - [x] `cover-image-picker.test.tsx` extended: `onImageSelected` receives object shape
  - [x] `cover-image-picker-search-tab.test.tsx` extended: photo button calls `onImageSelected` with full object including `photographer`/`photographerUrl`

- [x] **Task 12: E2E** (AC: 14)
  - [x] New `tests/e2e/features/trip-cover-overflow.feature`:
    - [x] Scenario: select an Unsplash photo as cover, then view Info dialog
    - [x] Scenario: remove Photo cover, verify it becomes Graphic and menu items update
  - [x] New `tests/e2e/steps/trip-cover-overflow.steps.ts`

## Dev Notes

### Scope boundary — read first

This story delivers the **Cover Overflow Menu + server action + attribution dialog + extended image selection flow**. Explicitly OUT of scope:

- Removing cover controls from `trip-edit-sheet.tsx` / deleting `trip-edit-cover.tsx` — **Story 3.2** owns that. This story only updates `trip-edit-cover.tsx` enough to compile with the changed `onImageSelected` signature (bridge change).
- The Cover Overflow Menu's interaction with `now-card.tsx` — this is a **new** menu instance on `trip-detail-hero.tsx`, not a modification of the trip-list card's overflow menu.
- Any changes to how the cover is rendered (trip-cover.tsx, TripCover) — only the overflow trigger and conditional items are new.
- Reservations feature — Epics 1 and 2 are independent; this story touches only cover-related code.

### CoverType determination logic

There is no separate `CoverType` DB column — it's derived from `coverImageUrl`:

| Condition | CoverType |
|---|---|
| `coverImageUrl` is undefined/null | Graphic (default) |
| `parseGraphicCover(coverImageUrl)` returns a parsed graphic | Graphic |
| `coverImageUrl` starts with `/api/mapbox/static` | Map |
| Anything else | Photo |

Unsplash photo = `CoverType === "photo"` AND `coverPhotographer` is non-null.

Use `parseGraphicCover()` from `@/lib/utils` to detect graphic covers. Map tiles are identified by checking if `coverImageUrl` includes `/api/mapbox/static`.

### Server action naming and location

Add `removeTripCover` to the **existing** `src/app/(app)/trips/[tripId]/actions.ts` (not a separate file — this is a single trip-scoped action, not a full feature module like `reservations/actions.ts`). Follow the existing pattern:

```ts
export async function removeTripCover(tripId: string): Promise<void> {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "editor");
  const [trip] = await db.select({ name: trips.name }).from(trips).where(eq(trips.id, tripId)).limit(1);
  if (!trip) throw new Error("Trip not found");
  const graphicUrl = deriveGraphicCover(trip.name);
  await db.update(trips).set({
    coverImageUrl: graphicUrl,
    coverPhotographer: null,
    coverPhotographerUrl: null,
  }).where(eq(trips.id, tripId));
  revalidatePath(`/trips/${tripId}`);
}
```

Return `Promise<void>`, throw `Error(...)` on failure — no `{ success, error }` wrapper.

For persisting cover+attribution when a user selects a new cover image via the `CoverImagePicker`, use a **dedicated `setTripCoverWithAttribution` action** in `src/app/(app)/trips/[tripId]/actions.ts` — this avoids touching the shared `UpdateTripPatch` type and the existing `updateTripMetadata` flow. The action accepts `tripId`, `coverImageUrl`, and optional `coverPhotographer`/`coverPhotographerUrl`, performs a direct `db.update(trips).set(...)` call, and revalidates the trip path.

### onImageSelected contract — normalization pattern

The `CoverImagePickerSearchTab` calls `onImageSelected` with both a bare string (map tiles — no photographer) and a full object (photos with photographer info). Normalize at `CoverImagePicker.handleSelect`:

```ts
function handleSelect(selected: string | { url: string; photographer?: string; photographerUrl?: string }) {
  const image = typeof selected === "string" ? { url: selected } : selected;
  onImageSelected(image);
  onClose();
}
```

This keeps the 4 tabs' `onImageSelected` props unchanged (they all call a single callback) while letting the search tab pass photographer info.

### TripDetailHero — no new props needed

`TripDetailHero` already receives a `detail: TripDetailPayload` prop. After Task 2 adds `coverPhotographer` and `coverPhotographerUrl` to `Trip`, these fields become available via `detail.trip.coverPhotographer` and `detail.trip.coverPhotographerUrl`. The `tripId` is already `detail.trip.id`. No prop interface changes are needed — all cover-related data flows through the existing `detail` payload.

The overflow menu, `CoverImagePicker`, and attribution dialog state are added directly inside `TripDetailHero` as local component state, not lifted to a parent.

### Attribution dialog — pattern reference

Create `src/components/packt/cover-attribution-dialog.tsx` modeled on `add-doc-dialog.tsx`'s Dialog pattern:

```tsx
interface CoverAttributionDialogProps {
  photographer: string;
  photographerUrl?: string;
  open: boolean;
  onClose: () => void;
}
```

Content: photographer name as heading, paragraph "Photo by {name} on Unsplash", link to `photographerUrl` with `<a>` (opens new tab, `rel="noopener noreferrer"`), close button. Minimal — this is a utility dialog.

### DropdownMenu pattern — trip-detail-hero.tsx

Mirror `now-card.tsx` lines 100–140 exactly for the menu plumbing. The trigger goes inside the cover container div (the `relative shrink-0` wrapper around `TripCover`), `absolute top-2 right-2` positioned.

```tsx
<DropdownMenu>
  <DropdownMenuTrigger
    title="Cover options"
    className="rounded-[6px] p-2 bg-black/25 text-white backdrop-blur-sm transition-colors hover:bg-black/45"
  >
    <MoreHorizontal size={18} strokeWidth={1.5} />
  </DropdownMenuTrigger>
  <DropdownMenuContent side="bottom" align="end">
    {<DropdownMenuItem onClick={...}>...</DropdownMenuItem>}
    {/* conditional items */}
  </DropdownMenuContent>
</DropdownMenu>
```

Import from `@/components/ui/dropdown-menu`: `DropdownMenu`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuTrigger`. Import `MoreHorizontal`, `Pencil`, `Trash2`, `Info` from `lucide-react`. All icons `strokeWidth={1.5}`.

### cover-image-search-actions.ts — UnsplashResponse interface update

The current `UnsplashSearchResponse` (line ~34):
```ts
interface UnsplashSearchResponse {
  results: Array<{
    id: string;
    urls: { regular: string; };
    user: { name: string; };
    alt_description: string | null;
    description: string | null;
  }>;
}
```

Extended:
```ts
interface UnsplashSearchResponse {
  results: Array<{
    id: string;
    urls: { regular: string; };
    user: { name: string; links: { html: string } };
    alt_description: string | null;
    description: string | null;
  }>;
}
```

Return mapping extended:
```ts
photographerUrl: result.user.links.html,
```

The E2E stub in `searchCoverImages` should also include `photographerUrl` in its fallback results (when `process.env.E2E_STUB === "true"` or the API key is missing). Look for the existing stub block at the bottom of the function.

### E2E Object Mother

No changes needed to the E2E Object Mother — cover fields are on the `trips` table, and the existing trip mothers (`THREE_DAY_TRIP_MOTHER`, etc.) can remain unchanged. If E2E scenarios need specific cover states (Unsplash photo with attribution), add overrides to `cloneTripMother()` — but the ACs for this story's E2E scenarios work through the UI rather than pre-seeded data.

### Testing standards summary (NFR2/NFR3)

- Coverage ≥95% lines/functions, ≥90% branches on `src/lib/**` and `src/components/packt/**` applies to all new/modified files
- `src/components/ui/**` (Dialog, DropdownMenu) excluded from coverage
- Action tests use `// @vitest-environment node` with mocked auth-helpers, db, schema, next/cache
- Component tests use Vitest + `@testing-library/react` + `userEvent`; mock `@/components/ui/dialog` similar to existing tests
- E2E uses `playwright-bdd`; E2E DB wiped/reseeded by `global-setup.ts` before each run

### Files to create
- `src/components/packt/cover-attribution-dialog.tsx`
- `src/components/packt/cover-attribution-dialog.test.tsx`
- `tests/e2e/features/trip-cover-overflow.feature`
- `tests/e2e/steps/trip-cover-overflow.steps.ts`

### Files to modify
- `src/db/schema.ts` — add `coverPhotographer`/`coverPhotographerUrl` columns to `trips`
- `src/data/types.ts` — extend `Trip`, `CoverImageSearchResult`
- `src/lib/db-mappers.ts` — extend `dbTripToType()`
- `src/lib/db-mappers.test.ts` — test new mapping
- `src/app/(app)/trips/cover-image-search-actions.ts` — extend `UnsplashSearchResponse`, return mapping, E2E stub
- `src/app/(app)/trips/cover-image-search-actions.test.ts` — test `photographerUrl`
- `src/components/packt/cover-image-picker-search-tab.tsx` — extend `onImageSelected` signature + callers
- `src/components/packt/cover-image-picker.tsx` — extend `onImageSelected` signature + `handleSelect` normalization
- `src/app/(app)/trips/[tripId]/trip-detail-hero.tsx` — add overflow menu, `CoverImagePicker` integration, image selection handler, attribution dialog (no new props needed — data from existing `detail.trip`)
- `src/components/packt/trip-edit-cover.tsx` — bridge: update `onImageSelected` caller
- `src/app/(app)/trips/[tripId]/actions.ts` — add `setTripCoverWithAttribution` and `removeTripCover`
- `src/app/(app)/trips/[tripId]/actions.test.ts` — tests for both new actions

### References

- [Source: _bmad-output/epics.md#Story 3.1: Cover Overflow Menu (Edit/Remove/Info)] — full AC text, FR-12
- [Source: _bmad-output/ux-designs/ux-packt-2026-06-13/DESIGN.md#Cover Overflow Menu (FR-12)] — trigger styling, menu items, conditional rules
- [Source: _bmad-output/ux-designs/ux-packt-2026-06-13/DESIGN.md#Cover Overflow Menu] — visual specs (lines 275–288)
- [Source: _bmad-output/ux-designs/ux-packt-2026-06-13/EXPERIENCE.md#Flow 3 — UJ-3: Ashley manages the trip's cover image] — user flow
- [Source: _bmad-output/architecture.md#Frontend Architecture] — Cover Overflow Menu pattern
- [Source: src/components/packt/now-card.tsx#DropdownMenu] — DropdownMenu pattern reference (lines 102–140)
- [Source: src/app/(app)/trips/[tripId]/trip-detail-hero.tsx] — current hero component (138 lines, renders TripCover directly, no overflow menu)
- [Source: src/components/packt/cover-image-picker.tsx] — current picker (93 lines, `onImageSelected: (url: string) => void`)
- [Source: src/components/packt/cover-image-picker-search-tab.tsx] — current search tab (372 lines, `onImageSelected: (url: string) => void`)
- [Source: src/app/(app)/trips/cover-image-search-actions.ts] — current search actions (170 lines, `CoverImageSearchResult` mapping)
- [Source: src/app/(app)/trips/[tripId]/actions.ts] — existing server actions (751 lines, `uploadCoverImage`, `updateTripMetadata`)
- [Source: src/db/schema.ts#trips] — current `trips` table definition
- [Source: src/data/types.ts#Trip, CoverImageSearchResult] — current type definitions
- [Source: src/lib/db-mappers.ts#dbTripToType] — current mapper (lines 48–69)

## Dev Agent Record

### Agent Model Used

- Codex GPT-5 as Amelia via `bmad-agent-dev` and `bmad-dev-story`

### Debug Log References

- `npm run db:migrate:e2e`
- `npx tsc --noEmit`
- `npm run test:coverage`
- `npx bddgen`
- `npx playwright test .features-gen/tests/e2e/features/trip-cover-overflow.feature.spec.js`
- `npm run lint`
- `npm run test:e2e`
- `npm run build`

### Completion Notes List

- Added cover attribution persistence across schema, canonical types, DB mapping, image-search mapping, and trip-scoped cover actions.
- Added trip-detail hero overflow menu with direct edit, remove, and attribution-info flows plus new Unsplash credit dialog.
- Normalized picker selection payloads so search photos can persist attribution while map, upload, URL, and custom covers still flow through one contract.
- Added unit/component coverage for mapper, picker, hero, dialog, and actions plus E2E coverage for attributed cover selection and photo-cover removal.
- `npm run test:coverage` passed at 94.54% statements, 90.63% branches, 95.1% functions, and 96.26% lines.
- Full validator passed lint, TypeScript, coverage, and production build.
- Full `npm run test:e2e` remains blocked by unrelated existing failure in `.features-gen/tests/e2e/features/linked-events.feature.spec.js` at `tests/e2e/steps/linked-events.steps.ts:315` where highlighted reservation row never becomes focused.
- Targeted story E2E passed: `.features-gen/tests/e2e/features/trip-cover-overflow.feature.spec.js`.

### File List

**New files:**
- `_bmad-output/implementation-artifacts/3-1-cover-overflow-menu-edit-remove-info.md`
- `src/components/packt/cover-attribution-dialog.tsx`
- `src/components/packt/cover-attribution-dialog.test.tsx`
- `tests/e2e/features/trip-cover-overflow.feature`
- `tests/e2e/steps/trip-cover-overflow.steps.ts`
- `tests/support/next-server.ts`

**Modified files:**
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `playwright.config.ts`
- `src/app/(app)/trips/[tripId]/actions.ts`
- `src/app/(app)/trips/[tripId]/actions.test.ts`
- `src/app/(app)/trips/[tripId]/page-client.test.tsx`
- `src/app/(app)/trips/[tripId]/trip-detail-hero.tsx`
- `src/app/(app)/trips/[tripId]/trip-detail-hero.test.tsx`
- `src/app/(app)/trips/actions.test.ts`
- `src/app/(app)/trips/cover-image-search-actions.ts`
- `src/components/packt/cover-image-picker-search-tab.tsx`
- `src/components/packt/cover-image-picker-search-tab.test.tsx`
- `src/components/packt/cover-image-picker.tsx`
- `src/components/packt/cover-image-picker.test.tsx`
- `src/components/packt/trip-edit-cover.tsx`
- `src/components/packt/trip-edit-cover.test.tsx`
- `src/db/schema.ts`
- `src/data/types.ts`
- `src/lib/db-mappers.ts`
- `src/lib/db-mappers.test.ts`
- `vitest.config.mts`
- `vitest.setup.mts`

### Review Findings

- [x] [Review][Patch] Upload tab double DB write — `uploadCoverImage` already updates the DB, then `handleSelect`→`handleCoverSelection` calls `setTripCoverWithAttribution` doing a second identical write [src/components/packt/cover-image-picker.tsx]
- [x] [Review][Patch] DropdownMenuTrigger preventDefault suppresses menu toggle — `event.preventDefault()` on trigger click can inhibit Radix dropdown toggle [src/app/(app)/trips/[tripId]/trip-detail-hero.tsx:142-146]
- [x] [Review][Patch] Picker closes before async save settles — `handleSelect` calls `onClose()` synchronously before `startTransition` async work completes; error toasts fire after dialog is invisible [src/components/packt/cover-image-picker.tsx, src/app/(app)/trips/[tripId]/trip-detail-hero.tsx]
- [x] [Review][Patch] DropdownMenuTrigger not disabled during `isPending` — menu items disabled but trigger isn't, enabling double-submit [src/app/(app)/trips/[tripId]/trip-detail-hero.tsx]
- [x] [Review][Patch] Redundant `next/server` mock — both `vitest.config.mts` alias and `vitest.setup.mts` `vi.mock` define `NextResponse` [vitest.config.mts, vitest.setup.mts]
- [x] [Review][Patch] No test for photo cover without attribution — only graphic/map/photo-with-attribution combos tested; uploaded cover (photo, no attribution) missing [src/app/(app)/trips/[tripId]/trip-detail-hero.test.tsx]
- [x] [Review][Patch] Empty-string photographer persists as `""` instead of `null` — `image.photographer ?? null` keeps `""` when DB should receive `null` [src/app/(app)/trips/[tripId]/trip-detail-hero.tsx:82]
- [x] [Review][Patch] No test for `CoverAttributionDialog` without `photographerUrl` — link visibility not tested when URL is absent [src/components/packt/cover-attribution-dialog.test.tsx]
- [x] [Review][Patch] No test for server-action failure toast in hero — `mockRemoveTripCover`/`mockSetTripCoverWithAttribution` rejection paths untested [src/app/(app)/trips/[tripId]/trip-detail-hero.test.tsx]
- [x] [Review][Defer] `user.id!` non-null assertion — existing pattern in codebase, not introduced by this change — deferred, pre-existing
- [x] [Review][Defer] `uploadCoverImage` discards previous attribution — pre-existing behavior, not introduced by this change — deferred, pre-existing
- [x] [Review][Defer] TOCTOU race in `removeTripCover` — pre-existing race condition across all server actions, not specific to this change — deferred, pre-existing

### Change Log

- 2026-06-19: Added cover attribution persistence, hero overflow menu actions, attribution dialog, and automated coverage for cover edit/remove flows.
