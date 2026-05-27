---
stepsCompleted: [1, 2, 3, 4]
session_topic: "Trip cover image sourcing — generating, validating, displaying, and customizing trip cover images"
session_goals: "Finalize implementation plan covering destination validation (Mapbox), image search (Unsplash), upload (Vercel Blob), UI flows (create vs edit), and image display in components"
selected_approach: "ai-recommended"
techniques_used: ["Reverse Brainstorming", "Question Storming", "Six Thinking Hats (convergent)"]
ideas_generated: 50
facilitation_notes: "User arrived with well-formed decisions; session focused on stress-testing and surfacing edge cases rather than divergent generation"
---

# Brainstorming Session Results

**Facilitator:** Spencer
**Date:** 2026-05-27

## Session Overview

**Topic:** Trip cover image sourcing — how to source, validate, display, and allow users to customize trip cover images from the internet

**Goals:**
- Determine whether a destination field is needed for image relevance
- Choose geocoding API for location validation
- Choose image source API
- Design UI flows for create (auto) vs edit (manual)
- Plan file upload mechanism
- Surface edge cases, failure modes, and error handling

### Context Guidance

Packt is a Next.js/TypeScript travel itinerary app with existing `coverImageUrl` field on trips (stored but never displayed), Vercel Blob for file storage, and gradient-based `TripCover` component.

---

## Technique Execution Results

### Reverse Brainstorming — "How could this fail?"

**Failure modes surfaced:**
1. API blackouts (Mapbox/Unsplash/Blob) blocking the create flow — optional fields shouldn't be hard blockers
2. No error/success feedback to the user when things go wrong — must show error messages
3. Unrelated images when searching by trip title instead of validated location
4. Free-text bypass of autocomplete leads to unwanted/random images — must enforce selection from dropdown
5. Premature image fetching on keystroke wastes resources — only fetch after explicit selection
6. Dynamic dialog resize from image results pushing inputs around — results go below controls, not above
7. Wrong location accidentally selected from autocomplete — user just searches again, no permanence
8. No crop function for uploaded images (accepted as future feature)
9. Stale images requiring refresh hints (rejected — once set, never changes unless user initiates)
10. Empty state visual quality — plain gradient among photo covers makes trip look "incomplete"

### Question Storming — Decision resolution

Key questions raised and resolved:
- **Cover type tagging in DB?** No — edit dialog starts fresh every time
- **Preference scope (new vs existing)?** New trips only
- **Color picker design?** Pre-defined palette (8-12 colors), not free-form hex
- **Server-side vs client-side fetch on create?** Server-side, with loading indicator on create button
- **API failure behavior?** Silently skip image, trip created without cover — never block

### Convergent Structuring — Final plan assembly

All decisions consolidated into the implementation plan below.

---

## Final Implementation Plan

### A — Setup & Environment

1. Register Mapbox account at mapbox.com, create access token
2. Add to `.env.example`:
   ```
   MAPBOX_ACCESS_TOKEN=
   UNSPLASH_ACCESS_KEY=
   ```
3. `BLOB_READ_WRITE_TOKEN` already exists
4. Add user preference field to `users` table: `defaultCoverType: "unsplash" | "mapbox"`
5. Add `destinationName`, `destinationCountry`, `destinationCountryCode` columns to `trips` table (`src/db/schema.ts`)
6. Add corresponding fields to `Trip`, `CreateTripInput`, `UpdateTripPatch`, `NewTripDraft` (`src/data/types.ts`)
7. Map new columns in `src/lib/db-mappers.ts`

### B — New Server Actions

**`src/app/(app)/trips/actions.ts`:**
- `searchLocations(query)` → Mapbox Geocoding Autocomplete → returns `{ placeName, country, countryCode, center }[]`
- `searchCoverImages(query)` → Unsplash `/search/photos?query={}+travel&orientation=landscape&per_page=12` → returns `{ id, url, photographer, alt }[]`

**`src/app/(app)/trips/[tripId]/actions.ts`:**
- `uploadCoverImage(tripId, formData)` — mirrors `uploadDocument()`: file → Vercel Blob `put()` (or stub) → `UPDATE trips SET cover_image_url = ...`

**Modify existing:**
- `createTrip()` — after insert, if destination set: fetch Unsplash/map tile based on user pref, store in `coverImageUrl`. API failures silently skipped. Loading indicator on create button.
- `updateTripMetadata()` — accept destination fields in patch, never auto-modify `coverImageUrl`

### C — NewTripDialog Changes

- Add "Destination" autocomplete field (below title)
- Debounced 300ms → `searchLocations` → dropdown (must pick from list, free-text not accepted)
- Submit button shows loading spinner while `createTrip` fetches image server-side

### D — CoverImagePicker (New Component)

**File:** `src/components/packt/cover-image-picker.tsx`
**Interface:** `CoverImagePickerProps { tripId: string; destinationName?: string; destinationCountry?: string; center?: [number, number]; onImageSelected: (url: string) => void; onClose: () => void; }`

Opened from edit sheet, single grid view:
- **Position 0**: Mapbox static map tile (generated from destination coordinates)
- **Positions 1–12**: Unsplash search results
- User picks any of the 13 options
- No tabs, no mode switching
- Static layout — results appear below controls (no resize shifting)

Additional controls in the picker:
- "Upload from computer" → hidden `<input type="file">` → `uploadCoverImage()`
- "Custom background" → color swatch picker (8-12 pre-defined, selected state shown with check overlay not just border color) + icon selector (~19 Lucide travel icons) + real-time preview
- "Paste URL" → collapsible text input (existing behavior)
- "Remove image" → clears `coverImageUrl`

**Accessibility:**
- Dialog opens via keyboard (button focus)
- Escape key dismisses
- Focus trapped inside dialog while open (standard dialog behavior)
- Focus returns to trigger button on close
- All icon-only buttons include `title` attributes
- Color swatch selection communicated via check/outline indicator + color change (not color-only)
- Hidden `<label>` associated with file input for screen readers

### E — TripEditSheet Changes

**Pre-work — split file first:** `src/components/packt/trip-edit-sheet.tsx` is 300 lines (exceeds 250 limit). Before adding cover image work, extract the Cover Image section, Destination section, and Budget section into separate subcomponents (e.g., `trip-edit-sections.tsx` grouped by panel area). This keeps each file under the limit.

Then:
- "Cover image" section redesign:
  - Current image preview (or gradient/icon if none)
  - "Edit cover image" button → opens `CoverImagePicker`
  - "Remove image" button
- "Destination" section with autocomplete (re-initialized from saved destination)

### F — TripCover & Display Wiring

- `TripCover` accepts `imageUrl?: string` prop
- If set: renders `<img>` as background (`objectFit: "cover"`), gradient as loading placeholder
- `onError` handler: clear `coverImageUrl` locally → fall back to gradient/icon
- If unset: current gradient behavior
- **Cover stripes CSS** (`globals.css`): widen 14px → 28px stripes, 28px gaps, add `filter: blur(2px)`
- Thread `coverImageUrl` + `destinationCountry` through all 9 call sites
- **Test:** Create `src/components/packt/trip-cover.test.tsx` covering: renders gradient when no imageUrl, renders image when imageUrl set, onError fallback to gradient, stripes overlay present

### G — Error Handling & Edge Cases

| Scenario | Behavior |
|---|---|
| Mapbox API down | "Could not search locations" toast, field still usable but unvalidated |
| Unsplash API down | Image silently skipped, trip created without cover |
| Upload fails | Toast "Upload failed. Try again." |
| User types free text (not from autocomplete) | Image search blocked — must pick validated location |
| Image URL fails to load | `onError` → fallback to gradient/icon SVG |
| Wrong location selected | User searches again in edit sheet |
| Slow creation | Loading spinner on submit while server-side fetch runs |

### H — User Preference

- User settings: "Default trip cover type" → Unsplash or Map view
- New trips only — existing covers never auto-updated

### I — E2E Tests

**New feature files needed:**
- `tests/e2e/features/trip-cover-image.feature` — covers:
  - Trip creation with destination → cover image auto-fetched
  - Trip edit → open cover image picker → search Unsplash → select image
  - Trip edit → upload from computer → image shows
  - Trip edit → remove cover image → reverts to gradient
  - Trip edit → URL paste → image shows

**Implementation:**
- Reuse `UPLOAD_STUB=true` for file upload tests
- Mock `searchLocations` and `searchCoverImages` server actions to return fixed data in E2E
- Update `e2e-seed-data.ts` with destination fields as needed
- Step definitions in `tests/e2e/steps/trip-cover-image.ts`

**Colocated unit test updates:**
- `src/components/packt/trip-cover.test.tsx` — **NEW** (component is modified, no test exists)
- `src/components/packt/new-trip-dialog.test.tsx` — update for destination field + autocomplete
- `src/components/packt/trip-edit-sheet.test.tsx` — update for cover image section redesign
- `src/components/packt/cover-image-picker.test.tsx` — **NEW** (new component)
- `src/lib/db-mappers.test.ts` — update for new destination columns

### J — Cover Image Picker Options Detail

| Source | Implementation |
|---|---|
| **Mapbox static map** (position 0) | `GET /styles/v1/mapbox/{style}/static/{lng},{lat},{zoom}/{width}x{height}` using coordinates from geocoding |
| **Unsplash search** (positions 1-12) | `GET /search/photos?query={destination}+travel&orientation=landscape&per_page=12` |
| **Upload from computer** | `<input type="file">` → `uploadCoverImage()` via Vercel Blob `put()` — mirrors `uploadDocument()` |
| **Custom SVG** | Color picker (8-12 swatches) + icon selector (~19 Lucide icons: backpack, luggage, map, caravan, compass, plane, map-pin, hotel, ship, tent-tree, van, map-pinned, car, bus, road, tree-palm, camera, mountain, trees) |
| **Paste URL** | Existing text input (collapsible) |

---

## Plan Review Results

**Reviewer:** packt-plan-reviewer
**Artifact:** `_bmad-output/brainstorming/brainstorming-session-2026-05-27-1145.md`

| Check | Result |
|---|---|
| Scope | ✓ PASS — all items within scope |
| Architecture | ✓ PASS — no issues |
| Component | ✗ 1 BLOCKING — trip-edit-sheet.tsx (300 lines, split needed) |
| Accessibility | ✗ 1 BLOCKING (keyboard nav for picker) + 2 WARNINGS |
| Test Coverage | ✗ 2 BLOCKING — trip-cover no test file, missing E2E flows |

**Findings applied to plan above:**
- Section E: Added pre-work split step for trip-edit-sheet.tsx
- Section D: Added explicit `CoverImagePickerProps` interface + accessibility requirements
- Section F: Added trip-cover.test.tsx creation step
- Section I: Expanded E2E with specific feature files + updated unit test list
