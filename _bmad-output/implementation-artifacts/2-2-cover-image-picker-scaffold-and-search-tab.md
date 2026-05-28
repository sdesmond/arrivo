# Story 2.2: CoverImagePicker — Scaffold & Search Tab

Status: done

## Story

As a traveler,
I want to open a cover image picker and browse destination photos and a map view,
so that I can select a professionally sourced cover image for my trip.

## Acceptance Criteria

1. **Given** `src/components/packt/cover-image-picker.tsx` (new file) — **Then** the component accepts a `CoverImagePickerProps` interface with `tripId`, `destinationName?`, `destinationCountry?`, `center?`, `onImageSelected`, and `onClose`

2. **Given** the picker opens — **Then** it renders as a dialog with 4 tabs: Search, Upload, URL, Custom — Search is active by default

3. **Given** the Search tab is active and `destinationName` is provided — **Then** `searchCoverImages(destinationName)` is called on mount and a loading state is shown while fetching

4. **Given** the Unsplash results load — **Then** a grid renders with the Mapbox static map tile at position 0, followed by up to 19 Unsplash photo thumbnails

5. **Given** `center` coordinates are provided — **Then** the Mapbox tile URL is constructed as `GET /styles/v1/mapbox/outdoors-v12/static/{lng},{lat},10/600x400@2x`

6. **Given** `center` is not provided — **Then** the map tile slot is not shown; only Unsplash results appear

7. **Given** I click any grid item — **Then** `onImageSelected(url)` is called with the selected URL and `onClose()` is called

8. **Given** the Unsplash API fails — **Then** `toast.error("Could not load images")` is shown and the grid shows an empty state

9. **Given** keyboard navigation — **Then** the dialog opens via keyboard, Escape closes it, focus is trapped inside while open, and focus returns to the trigger button on close

10. **Given** `src/components/packt/cover-image-picker.test.tsx` (new file) — **Then** tests cover: renders 4 tabs, Search tab calls searchCoverImages on mount, grid renders map tile at position 0, clicking an image calls onImageSelected, API failure shows empty state and toast, Escape closes the dialog

## Tasks / Subtasks

- [x] Create `src/components/packt/cover-image-picker.tsx` (AC: 1, 2, 3, 4, 5, 6, 7, 8, 9)
  - [x] Define `CoverImagePickerProps` interface (AC: 1)
  - [x] Dialog wrapper: use `<Dialog>` from `@/components/ui/dialog` with `showCloseButton={false}` (custom close via X button in header) (AC: 2, 9)
  - [x] 4-tab layout using `<Tabs>` from `@/components/ui/tabs` — Search, Upload, URL, Custom (AC: 2)
  - [x] Search tab: call `searchCoverImages(destinationName)` on mount via `useEffect`, show loading spinner while fetching (AC: 3)
  - [x] Search results grid: Mapbox tile at position 0 (when `center` provided), Unsplash results 1–19 (AC: 4, 5, 6)
  - [x] Click handler on each grid item: calls `onImageSelected(url)` then `onClose()` (AC: 7)
  - [x] Error state: `toast.error("Could not load images")` and empty grid when API fails (AC: 8)
  - [x] Keyboard handling: Escape → `onClose()`, focus trapped by Dialog primitive (AC: 9)
  - [x] Search tab renders placeholder tabs for Upload, URL, Custom — `<div>Upload tab content</div>` etc. (will be replaced in stories 2.3, 2.4)

- [x] Write `src/components/packt/cover-image-picker.test.tsx` (AC: 10)
  - [x] Mock `searchCoverImages` from `@/app/(app)/trips/actions`
  - [x] Mock `import { toast } from "sonner"` — `vi.mock("sonner", ...)`
  - [x] Test: renders 4 tabs with Search active
  - [x] Test: Search tab calls searchCoverImages on mount when destinationName provided
  - [x] Test: grid renders map tile at position 0 when center provided
  - [x] Test: grid does NOT render map tile when center absent
  - [x] Test: clicking an Unsplash result calls onImageSelected and onClose
  - [x] Test: API failure shows empty state and toast.error
  - [x] Test: Escape key closes the dialog

### Review Findings

- [x] [Review][Patch] Mapbox tile URL is built from a server-only env var inside a client component [src/components/packt/cover-image-picker.tsx:48]
- [x] [Review][Patch] Unsplash failures still leave a visible/selectable map result instead of an actually empty Search grid [src/components/packt/cover-image-picker.tsx:57]
- [x] [Review][Patch] Search results can go stale when the destination changes because requests are not cancelled and previous images are not reset [src/components/packt/cover-image-picker.tsx:32]
- [x] [Review][Patch] The unit tests mock away the dialog and tabs primitives, so they do not verify the real Escape/default-tab/map-order behavior or the failed-map path required by the story [src/components/packt/cover-image-picker.test.tsx:6]
- [x] [Review][Patch] `_bmad-output/sprint-status.yaml` uses `review` instead of the documented `ready-for-review` state [_bmad-output/sprint-status.yaml:32]

## Dev Notes

### Component Architecture

The `CoverImagePicker` is a tabbed dialog launched from `TripEditSheet` (via `TripEditCover` in story 2.5). For this story, only the Search tab has real content; the other three tabs render placeholder divs.

**Props interface:**
```ts
interface CoverImagePickerProps {
  tripId: string;
  destinationName?: string;
  destinationCountry?: string;
  center?: [number, number];
  onImageSelected: (url: string) => void;
  onClose: () => void;
}
```

### Existing Server Actions Available

- `searchCoverImages(query: string): Promise<{ id, url, photographer, description, alt }[]>` — defined in `src/app/(app)/trips/actions.ts:642`. Calls Unsplash `/search/photos?query={query}+travel&orientation=landscape&per_page=19`. Throws on API errors. Returns `alt` as `alt_description ?? description ?? ""` per the API response shape.
- `retrieveLocation(mapboxId, sessionToken): Promise<{ placeName, country, countryCode, center }>` — defined in `src/app/(app)/trips/actions.ts:582`. Provides coordinates from a Mapbox `mapboxId`.
- **Note:** `searchCoverImages` is already used by `createTrip` (line 219). `CoverImageResult` interface is NOT exported from actions.ts — it's file-private (line 502). The dev must either export it or define it in types.ts.

### Mapbox Static Tile URL

Constructed as:
```
https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/static/{lng},{lat},10/600x400@2x?access_token={token}
```
- `{lng}` and `{lat}` come from `center[0]`, `center[1]`
- Zoom level 10
- Size: 600x400 @2x
- `MAPBOX_ACCESS_TOKEN` env var is already used by `searchLocations` in actions.ts:542 — read from `process.env.MAPBOX_ACCESS_TOKEN`

### Dialog Pattern

Use `<Dialog>` from `@/components/ui/dialog.tsx` (Base UI `Dialog` primitive). Key props:
- `Dialog` — wraps the root
- `DialogTrigger` — the button that opens the picker (not used in this story — the picker is opened programmatically from TripEditSheet)
- `DialogContent` — the popup panel; pass `showCloseButton={false}` and add a custom close X in the header
- `DialogTitle` — "Cover Image"
- `DialogHeader`, `DialogFooter` — layout helpers

For programmatic open (not trigger-based): render `CoverImagePicker` inside the parent with `open` prop. Use:
```tsx
<Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
  <DialogContent>...</DialogContent>
</Dialog>
```

### Tab Pattern

Use `<Tabs>` from `@/components/ui/tabs.tsx` (Base UI `Tabs`):
```tsx
<Tabs defaultValue="search">
  <TabsList>
    <TabsTrigger value="search">Search</TabsTrigger>
    <TabsTrigger value="upload">Upload</TabsTrigger>
    <TabsTrigger value="url">URL</TabsTrigger>
    <TabsTrigger value="custom">Custom</TabsTrigger>
  </TabsList>
  <TabsContent value="search">...</TabsContent>
  <TabsContent value="upload"><div>Upload tab content</div></TabsContent>
  <TabsContent value="url"><div>URL tab content</div></TabsContent>
  <TabsContent value="custom"><div>Custom tab content</div></TabsContent>
</Tabs>
```

### Search Tab Layout

The search results grid is a responsive flex-wrap layout:
- **Position 0** (when `center` is set): Mapbox static map `<img>` — 600x400@2x tile rendered at ~200px wide in the grid. Labeled "Map view" with a small text overlay. Surrounded by a thin border (`var(--line)`).
- **Positions 1–19**: Unsplash thumbnails — square aspect ratio, `objectFit: "cover"`, ~100px wide each.
- Grid: `display: "flex", flexWrap: "wrap", gap: 8px` — items wrap naturally.

Each grid item is a `<button>` (not a `<div>` with onClick) — this gives native keyboard activation via Enter/Space and screen reader focusability.

**Accessibility for grid items:**
- Each Unsplash grid item button must have `title={item.photographer}` and `aria-label={item.alt || item.photographer}` to identify the image for screen readers.
- The Mapbox tile `<img>` needs `alt={`Map view of ${destinationName}`}` — never empty or missing `alt`.
- Each Unsplash thumbnail `<img>` uses the `alt` field from `CoverImageResult` (mapped from `alt_description ?? description ?? ""` in the API response — both fields are available on the raw response, but `alt` on the result type is the coalesced value ready for use as image `alt` text).
- All icon-only buttons (close X) must have `title` and `aria-label` attributes — use `<XIcon />` wrapped with accessible labeling.

### Loading & Error States

- **Loading**: Show `<div>Loading images…</div>` or spinner with `role="status"` and `aria-label="Loading images"`.
- **API Error**: `toast.error("Could not load images")` + empty state: `<div className="p-4 text-center text-fg-3">No images found</div>`
- **No destinationName**: When `destinationName` is not provided, skip API call entirely and show empty state immediately.

### What Must Be Preserved (Existing Behaviors)

- `searchCoverImages` is already used by `createTrip` in `actions.ts:219` — the existing call must not be affected.
- The `CoverImageResult` type is local to actions.ts (not exported) — either export it or define a parallel interface in the picker file.
- `trip-edit-cover.tsx` is NOT modified in this story — it remains the current URL-input + preview component. Story 2.5 replaces its section in the edit sheet with the new picker-triggered flow.
- Story 2.3 will add the `uploadCoverImage` server action following the `uploadDocument` pattern in `[tripId]/actions.ts:371` — not implemented here.

### Things NOT to Do

- Do not implement Upload, URL, or Custom tab content — placeholder divs only.
- Do not wire the picker into `TripEditSheet` or `TripEditCover` — that's story 2.5.
- Do not modify `trip-edit-sheet.tsx` or `trip-edit-cover.tsx` in this story.
- Do not add new types to `src/data/types.ts` unless `CoverImageResult` is moved there (optional, not required).
- Do not create E2E tests for this story — cover image picker E2E is scoped to a later story.
- Do not implement `uploadCoverImage` server action — belongs to story 2.3.

### Test Patterns

**Mocks needed for `cover-image-picker.test.tsx`:**
```ts
vi.mock("@/app/(app)/trips/actions", () => ({
  searchCoverImages: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("next/image", () => ({
  default: (props: any) => <img {...props} />,
}));
```

**Testing approach:**
- Render `CoverImagePicker` with `open={true}` (simulating programmatic open)
- Use `fireEvent.click` for grid item interaction
- Use `fireEvent.keyDown(document, { key: "Escape" })` for Escape test
- Use `waitFor` for async searchCoverImages resolution
- Test map tile presence when `center` provided; absence when not

### Previous Story Intelligence (Story 2.1)

**Key learnings that apply here:**

1. **Dialog pattern**: `@/components/ui/dialog.tsx` uses `@base-ui/react/dialog` — the `DialogContent` component accepts `showCloseButton` prop
2. **Tabs pattern**: `@/components/ui/tabs.tsx` uses `@base-ui/react/tabs` — `defaultValue` on `Tabs` root, `value` on `TabsTrigger`/`TabsContent`
3. **Accessibility**: Escape closes dialogs via Base UI `Dialog` primitive; focus trapping is built-in
4. **Error handling**: `toast.error()` from `sonner` is the established pattern
5. **`cn()`** from `@/lib/utils` — always use for className merging
6. **`"use client"`** must be the very first line
7. **Colocated test files**: `*.test.tsx` next to source
8. **Form Section pattern**: `Section`/`Field` from `@/components/packt/form-section` for consistent layout

**Review fixes from 2.1 to carry forward:**
- Always `.trim()` user input
- Always add `onError` fallback for `<img>` elements
- Always use `?? undefined` not `|| undefined` for optional values
- Always clamp numeric inputs with `Math.max(0, ...)`

### Git Intelligence

Recent commits for related work:
```
21fd9e4 refactor(trip-edit): replace inline cover/budget sections with subcomponents
0a86971 feat(trip-edit): extract TripEditCover, TripEditDestination, TripEditBudget subcomponents
1384e53 Merge pull request #38 from sdesmond/trip-cover-image-wiring
```

**Patterns established:**
- Subcomponent extraction: each section in its own file with colocated tests
- Consistent import structure: `"use client"` → React imports → UI imports → domain imports
- Server actions in `[tripId]/actions.ts` follow: `requireUser()` → `assertTripAccess()` → mutation → `revalidatePath()`

### Architecture Compliance

**Stack alignment:**
- React 19.2.4, Next.js 16.2.4 (App Router) — `"use client"` components
- TypeScript strict mode — no `any`, explicit prop interfaces
- Tailwind CSS v4 — no arbitrary values, use inline styles for dynamic values
- All domain types from `src/data/types.ts` (unless local interface appropriate)
- Colors via CSS custom properties only (`var(--fg)`, `var(--line)`, etc.)
- Lucide icons: `strokeWidth={1.5}` always
- `cn()` from `@/lib/utils` for className merging

**Testing requirements:**
- Colocated test file: `cover-image-picker.test.tsx`
- Coverage enforced: `src/components/packt/**` requires ≥95% lines/functions, ≥90% branches
- Do NOT re-mock `next/navigation` or `next/headers` — already in `vitest.setup.mts`
- Mock `sonner` (toast), `next/image`, and server actions per test file

### Library/Framework Requirements

All libraries already in the project:
- `@/components/ui/dialog` — Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose
- `@/components/ui/tabs` — Tabs, TabsList, TabsTrigger, TabsContent
- `@/components/ui/button` — Button for X close button
- `@/lib/utils` — cn()
- `@/app/(app)/trips/actions` — searchCoverImages (import with `import { searchCoverImages } from "@/app/(app)/trips/actions"`)
- `sonner` — toast.error()
- `lucide-react` — XIcon for close button, LoaderIcon for loading state
- `process.env.MAPBOX_ACCESS_TOKEN` — for Mapbox static tile URL
- `process.env.UPLOAD_STUB` — for E2E blob bypass

No new dependencies needed.

### File Structure Summary

| File | Operation | Notes |
|------|-----------|-------|
| `src/components/packt/cover-image-picker.tsx` | NEW | Tabbed dialog with Search tab content, placeholder tabs for Upload/URL/Custom |
| `src/components/packt/cover-image-picker.test.tsx` | NEW | Unit tests for Search tab and dialog behavior |
| `_bmad-output/sprint-status.yaml` | UPDATE | Mark story as ready-for-dev |

### References

- [Source: `_bmad-output/epics-cover-image.md` lines 332–379] — Story 2.2 acceptance criteria
- [Source: `src/app/(app)/trips/actions.ts:642`] — `searchCoverImages` server action
- [Source: `src/app/(app)/trips/actions.ts:488-507`] — `LocationSuggestion`, `RetrievedLocation`, `CoverImageResult` types (note: not exported)
- [Source: `src/components/ui/dialog.tsx`] — Dialog primitive from Base UI
- [Source: `src/components/ui/tabs.tsx`] — Tabs primitive from Base UI
- [Source: `src/components/packt/trip-edit-cover.tsx`] — Existing cover subcomponent (NOT modified in this story)
- [Source: `_bmad-output/implementation-artifacts/2-1-split-trip-edit-sheet-into-subcomponents.md`] — Previous story learnings
- [Source: `_bmad-output/project-context.md`] — Project-wide conventions

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- `npx vitest run src/components/packt/cover-image-picker.test.tsx` — PASS (17/17)
- `npx vitest run src/components/packt/` — PASS (755/755, no regressions)
- `npm run lint` — PASS (0 errors, 0 warnings)
- `npx tsc --noEmit` — PASS
- `npm run test:coverage` — PASS (95.17% statements, 90.18% branches, 95.58% functions, 96.91% lines)
- `npm run build` — PASS

### Completion Notes List

- Implemented `CoverImagePicker` as a controlled dialog (always-open when mounted; parent unmounts to close). `onOpenChange` translates Base UI dismiss events to `onClose()`.
- `CoverImageResult` interface defined locally — not exported from actions.ts and not required in types.ts per story spec.
- Map tiles now load through `src/app/api/mapbox/static/route.ts`, keeping the Mapbox access token server-side while still returning a selectable URL to the picker.
- Search requests reset stale results and ignore superseded responses so destination changes cannot repopulate the grid with older images.
- Error handling now produces a true empty state: Unsplash failures suppress the map option, failed map loads remove the tile button, and failed thumbnails are removed from the grid.
- 21 unit tests cover active-tab state, map-first ordering, stale-request handling, failed-map behavior, image selection, error states, and real Escape-key dismissal.

### File List

- src/components/packt/cover-image-picker.tsx
- src/components/packt/cover-image-picker.test.tsx
- src/app/api/mapbox/static/route.ts
- _bmad-output/implementation-artifacts/2-2-cover-image-picker-scaffold-and-search-tab.md
- _bmad-output/sprint-status.yaml

## Change Log

- 2026-05-28: Story created from epics-cover-image.md Epic 2, Story 2.2. Scaffold covers Search tab with Mapbox tile + Unsplash grid, placeholder tabs for Upload/URL/Custom. `uploadCoverImage` deferred to story 2.3.
- 2026-05-28: Implementation complete. New files: cover-image-picker.tsx, cover-image-picker.test.tsx. 17 tests passing; all lint/TS/coverage/build checks green.
- 2026-05-28: Review patches applied. Map tiles are proxied through a server route, stale search responses are ignored, empty-state handling is corrected, tests use the real dialog/tabs primitives, and full lint/type/coverage/E2E/build validation passed.
