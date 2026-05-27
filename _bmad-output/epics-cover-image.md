---
stepsCompleted: [1, 2, 3, 4]
workflow_completed: true
inputDocuments:
  - _bmad-output/brainstorming/brainstorming-session-2026-05-27-1145.md
  - _bmad-output/project-context.md
---

# Packt - Epic Breakdown: Trip Cover Image

## Overview

This document provides the complete epic and story breakdown for the **Trip Cover Image** feature in Packt, decomposing requirements from the brainstorming session (2026-05-27) into implementable stories. The feature covers destination validation, automatic cover image sourcing, a tabbed cover image picker, and display wiring.

## Requirements Inventory

### Functional Requirements

FR1: Destination autocomplete field added to NewTripDialog (below title) — debounced 300ms, queries `searchLocations` server action, requires selection from dropdown (free-text not accepted)
FR2: On new trip creation, if a destination is selected, a cover image is auto-fetched server-side (Unsplash or Mapbox based on user preference) and stored in `coverImageUrl`
FR3: API failures during auto-fetch (Mapbox/Unsplash) silently skip the image — trip is created without a cover; creation is never blocked
FR4: `CoverImagePicker` is a tabbed dialog with 4 tabs: Search, Upload, URL, Custom — opened from TripEditSheet's Cover Image section
FR5: Search tab — position 0 is Mapbox static map tile generated from destination coordinates, positions 1–19 are Unsplash results; total 20 selectable options in a grid
FR6: Unsplash search queries `per_page=19`, `query={destination}+travel&orientation=landscape`
FR7: Upload tab — drop zone / browse button → hidden `<input type="file">` → `uploadCoverImage()` → Vercel Blob `put()` → updates `coverImageUrl`
FR8: Custom tab — 8–12 pre-defined color swatches + ~19 Lucide travel icon selector + live preview card showing selected combination; color selection indicated by check overlay (not border color alone)
FR9: URL tab — text input with Apply button; sets `coverImageUrl` directly from pasted URL
FR10: Remove image control in TripEditSheet (outside the picker) clears `coverImageUrl`
FR11: `TripCover` component renders `<img>` as background (`objectFit: "cover"`) when `coverImageUrl` is set; `onError` handler clears URL locally and falls back to gradient/icon
FR12: `destinationName`, `destinationCountry`, `destinationCountryCode` fields added to `trips` DB table and propagated through types, mappers, and all input types
FR13: User settings gains "Default cover type" preference: Unsplash or Map view — applies to new trips only, never auto-updates existing covers
FR14: TripEditSheet Cover Image section redesigned: current image preview (or gradient/icon placeholder) + "Edit cover image" button (opens picker) + "Remove image" button

### NonFunctional Requirements

NFR1: All API failures (Mapbox, Unsplash, Vercel Blob) degrade gracefully with toast error messages — creation and editing are never blocked
NFR2: Destination field enforces validated autocomplete selection — free-text bypass blocked; image search gated on a validated location
NFR3: Location search debounced 300ms to avoid wasteful API calls on every keystroke
NFR4: Cover image fetch on trip create runs server-side with a loading indicator on the Create button
NFR5: `onError` on the `<img>` tag falls back to gradient/icon; no broken image icons are ever shown
NFR6: CoverImagePicker dialog fully keyboard accessible: Escape dismisses, focus trapped inside while open, focus returns to trigger button on close
NFR7: All icon-only buttons include `title` attributes; color swatch selection communicated via check/outline overlay (not color alone) for WCAG compliance
NFR8: File input in Upload tab has an associated `<label>` element for screen readers

### Additional Requirements

- New `searchLocations(query)` server action → Mapbox Geocoding Autocomplete → returns `{ placeName, country, countryCode, center }[]`
- New `searchCoverImages(query)` server action → Unsplash search → returns `{ id, url, photographer, alt }[]`
- New `uploadCoverImage(tripId, formData)` server action → mirrors `uploadDocument()` pattern; guarded with `UPLOAD_STUB !== "true"` for E2E
- Modified `createTrip()`: after insert, if destination is set, fetches image based on user preference, stores in `coverImageUrl`; API failures silently skipped
- Modified `updateTripMetadata()`: accepts destination fields in patch, never auto-modifies `coverImageUrl`
- Add `defaultCoverType: "unsplash" | "mapbox"` user preference field to `users` table
- Pre-work: split `trip-edit-sheet.tsx` (300 lines) into subcomponents before cover image work (file-length limit enforcement)
- Cover stripes CSS (`globals.css`): widen 14px → 28px stripes, 28px gaps, add `filter: blur(2px)`
- Thread `coverImageUrl` + `destinationCountry` through all 9 `TripCover` call sites
- All Vercel Blob `put()` calls guarded with `process.env.UPLOAD_STUB !== "true"` for E2E compatibility

### UX Design Requirements

UX-DR1: CoverImagePicker is a 4-tab dialog — tabs: Search, Upload, URL, Custom — no content bleed between tabs
UX-DR2: Search tab grid layout: map tile in position 0 (visually distinct / labeled), then 19 Unsplash results; selecting any option immediately calls `onImageSelected` and closes the picker
UX-DR3: Upload tab shows a drop zone with "Drop file here or browse" affordance; selecting a file triggers upload and closes the picker on success
UX-DR4: URL tab has a single text input and an Apply button; invalid/unreachable URLs surface an error below the input before closing
UX-DR5: Custom tab shows: color swatches section → icon grid section → live preview card; preview updates in real time as color and icon are changed; selecting the combination closes the picker
UX-DR6: Color swatch selection indicated by check overlay on the selected swatch (not border color alone)
UX-DR7: Submit button on NewTripDialog shows loading spinner during server-side image fetch
UX-DR8: TripEditSheet Cover Image section shows the current cover as a preview thumbnail; "Edit cover image" button opens the picker, "Remove image" button is separate and always visible when a cover exists
UX-DR9: Cover stripes CSS updated: 28px stripes, 28px gaps, `blur(2px)` filter

### FR Coverage Map

FR1: Epic 1 — Destination autocomplete in NewTripDialog
FR2: Epic 1 — Auto-fetch cover on create
FR3: Epic 1 — Silent API failure on create
FR12: Epic 1 — DB + type + mapper updates for destination fields
FR13: Epic 1 — User preference for default cover type
FR4: Epic 2 — CoverImagePicker tabbed dialog
FR5: Epic 2 — Search tab (map tile + Unsplash grid)
FR6: Epic 2 — Unsplash query parameters
FR7: Epic 2 — Upload tab
FR8: Epic 2 — Custom tab
FR9: Epic 2 — URL tab
FR10: Epic 2 — Remove image
FR11: Epic 3 — TripCover display wiring + onError fallback
FR14: Epic 3 — TripEditSheet Cover Image section redesign

## Epic List

### Epic 1: Automatic Trip Cover Images
Users can add a destination when creating a trip and receive a cover image sourced automatically — visible on trip cards and the trip detail page immediately after creation.
**FRs covered:** FR1, FR2, FR3, FR11, FR12, FR13

### Epic 2: Cover Image Picker & Management
Users can manually browse photos, upload a file, paste a URL, or design a custom color+icon cover — replacing or removing any trip's cover image from the edit sheet.
**FRs covered:** FR4, FR5, FR6, FR7, FR8, FR9, FR10, FR14

---

## Epic 1: Automatic Trip Cover Images

Users can add a destination when creating a trip and receive a cover image sourced automatically — visible on trip cards and the trip detail page immediately after creation.

### Story 1.1: Trip Destination Data Layer

As a developer,
I want destination fields and a cover type preference persisted in the database with proper types and mapper coverage,
So that all subsequent cover image features have a stable data foundation to build on.

**Acceptance Criteria:**

**Given** the `trips` table in `src/db/schema.ts`
**When** the migration runs
**Then** three new nullable text columns exist: `destination_name`, `destination_country`, `destination_country_code`

**Given** the `users` table in `src/db/schema.ts`
**When** the migration runs
**Then** a new `default_cover_type` nullable text column exists with no default

**Given** `src/data/types.ts`
**Then** `Trip` has optional fields `destinationName?: string`, `destinationCountry?: string`, `destinationCountryCode?: string`
**And** `CreateTripInput`, `UpdateTripPatch`, and `NewTripDraft` include the three destination fields as optional
**And** a `CoverType` const object `{ Unsplash: "unsplash", Mapbox: "mapbox", Graphic: "graphic" }` plus union type is defined (never the `enum` keyword)
**And** the `User` type gains `defaultCoverType?: CoverType`

**Given** `src/lib/db-mappers.ts`
**Then** `dbTripToType()` maps all three destination columns to their camelCase type fields
**And** a user mapper maps `default_cover_type` to `defaultCoverType` as a `CoverType` value

**Given** a `parseGraphicCover(url: string): { color: string; icon: string } | null` utility in `src/lib/utils.ts`
**Then** it returns `{ color, icon }` when the string matches `graphic:{color}/{icon}`
**And** returns `null` for any other string or falsy input

**Given** `src/lib/db-mappers.test.ts`
**Then** tests verify destination fields map correctly when present and when null
**And** `defaultCoverType` maps correctly for `"unsplash"`, `"mapbox"`, `"graphic"`, and null

**Given** `src/lib/utils.test.ts` (or equivalent)
**Then** `parseGraphicCover` is tested for valid graphic URLs, non-graphic URLs, null, and malformed strings

---

### Story 1.2: Location & Image Search Server Actions

As a developer,
I want server actions for searching locations and cover images,
So that NewTripDialog and CoverImagePicker can retrieve validated location data and candidate photos.

**Acceptance Criteria:**

**Given** `src/app/(app)/trips/actions.ts`
**Then** a `searchLocations(query: string)` server action exists that calls the Mapbox Geocoding Autocomplete API and returns `{ placeName: string; country: string; countryCode: string; center: [number, number] }[]`

**Given** `searchLocations` is called with a valid query
**When** the Mapbox API returns results
**Then** results are mapped to the return type and returned (maximum 5 suggestions)

**Given** `searchLocations` is called
**When** the Mapbox API throws or returns an error
**Then** the action throws with a descriptive message (caller handles the toast)

**Given** `src/app/(app)/trips/actions.ts`
**Then** a `searchCoverImages(query: string)` server action exists that calls Unsplash `/search/photos?query={query}+travel&orientation=landscape&per_page=19` and returns `{ id: string; url: string; photographer: string; alt: string }[]`

**Given** `searchCoverImages` is called with a valid query
**When** the Unsplash API returns results
**Then** the mapped result array is returned

**Given** `searchCoverImages` is called
**When** the Unsplash API throws or returns an error
**Then** the action throws with a descriptive message

**Given** `MAPBOX_ACCESS_TOKEN` or `UNSPLASH_ACCESS_KEY` are missing from the environment
**Then** the respective action throws a clear "missing env var" error on first call

---

### Story 1.3: Destination Autocomplete & Auto-Cover on Create

As a traveler,
I want to type a destination when creating a trip and have a cover automatically applied based on my preference,
So that my new trip immediately has a relevant visual identity without any extra steps.

**Acceptance Criteria:**

**Given** the NewTripDialog is open
**Then** a "Destination" autocomplete field appears below the title field

**Given** I type at least 2 characters in the destination field
**When** 300ms have elapsed since the last keystroke
**Then** `searchLocations` is called and a dropdown of up to 5 location suggestions appears below the field

**Given** the dropdown is open and I click a suggestion
**Then** the field shows the selected `placeName`, the dropdown closes, and destination data (name, country, countryCode, center coordinates) is held in component state

**Given** I type in the destination field but do not select from the dropdown
**Then** the destination is treated as unset — no image will be fetched on create

**Given** the Mapbox API returns an error during autocomplete
**Then** a `toast.error("Could not search locations")` is shown and the field remains usable

**Given** I click Create with a destination selected
**Then** the Create button shows a loading spinner and is not clickable a second time

**Given** `createTrip` runs server-side with a destination and `defaultCoverType` is `"unsplash"` or null
**Then** `searchCoverImages(destinationName)` is called; the first result URL is stored as `coverImageUrl`

**Given** `createTrip` runs server-side with a destination and `defaultCoverType` is `"mapbox"`
**Then** a Mapbox static map tile URL is constructed from the destination coordinates and stored as `coverImageUrl`

**Given** `createTrip` runs server-side with a destination and `defaultCoverType` is `"graphic"`
**Then** a color and icon are derived by hashing the trip title against the palette and icon arrays
**And** the result is encoded as `graphic:{color}/{icon}` and stored as `coverImageUrl`
**And** no external API call is made

**Given** `createTrip` runs server-side with a destination
**When** any API call fails (Unsplash or Mapbox)
**Then** the trip is created without a cover image; no error is surfaced and creation succeeds

**Given** `createTrip` runs with no destination selected
**Then** no image fetch is attempted; `coverImageUrl` remains null

**Given** `updateTripMetadata` receives destination fields in the patch
**Then** the three destination columns are updated in the DB
**And** `coverImageUrl` is never auto-modified by `updateTripMetadata`

**Given** `src/components/packt/new-trip-dialog.test.tsx`
**Then** tests verify: destination field renders, debounced search fires after 300ms, selecting a suggestion populates the field, typing without selecting does not set destination, loading state shows on submit, Mapbox API error shows toast

---

### Story 1.4: TripCover Image Display Wiring

As a traveler,
I want my trip's cover to display on trip cards and the trip detail page,
So that trips with photos or graphics look rich and visually distinct from gradient-only trips.

**Acceptance Criteria:**

**Given** `src/components/packt/trip-cover.tsx`
**Then** the component accepts `coverImageUrl?: string` and `destinationCountry?: string` props

**Given** `coverImageUrl` starts with `graphic:`
**Then** `parseGraphicCover(coverImageUrl)` is called and the component renders the SVG color+icon graphic using the returned color and icon values
**And** no `<img>` element is rendered

**Given** `coverImageUrl` is a standard URL (not a graphic)
**Then** the component renders an `<img>` as a full-bleed background with `objectFit: "cover"`
**And** the gradient renders behind it as a loading placeholder

**Given** the `<img>` fails to load (`onError`)
**Then** `coverImageUrl` is cleared from local state and the gradient/icon fallback renders
**And** no broken image icon is ever visible

**Given** `coverImageUrl` is null or empty
**Then** the current gradient + icon fallback behavior is unchanged

**Given** `src/app/globals.css` cover stripes
**Then** stripe width is 28px, gap is 28px, and `filter: blur(2px)` is applied

**Given** all 9 call sites of `TripCover` across the codebase
**Then** each passes `coverImageUrl` (and `destinationCountry` where available) from the trip data

**Given** `src/components/packt/trip-cover.test.tsx` (new file)
**Then** tests cover: renders gradient when no imageUrl, renders `<img>` when imageUrl is a URL, renders SVG graphic when imageUrl is a `graphic:` string, `onError` triggers gradient fallback, stripes overlay is present in DOM

---

### Story 1.5: Default Cover Type User Preference

As a traveler,
I want to choose whether new trip covers default to a photo, a map, or a graphic,
So that my cover images always match my preferred visual style without extra steps after creation.

**Acceptance Criteria:**

**Given** the user settings page
**Then** a "Default trip cover type" control is present with three options: **Photo**, **Map**, and **Graphic**

**Given** I select **Photo** and save
**Then** `defaultCoverType` is updated to `"unsplash"` in the database

**Given** I select **Map** and save
**Then** `defaultCoverType` is updated to `"mapbox"` in the database

**Given** I select **Graphic** and save
**Then** `defaultCoverType` is updated to `"graphic"` in the database

**Given** I create a new trip with a destination
**Then** the cover type used matches my saved preference

**Given** my preference is **Graphic**
**And** I create a new trip with or without a destination
**Then** the graphic is always generated (no coordinates needed)

**Given** my preference is **Photo** or **Map**
**And** I create a new trip without a destination
**Then** no cover is applied (coordinates required for both)

**Given** no preference is saved
**Then** `"unsplash"` is used as the default

**Given** this setting
**Then** it applies to newly created trips only — existing covers are never auto-updated

---

## Epic 2: Cover Image Picker & Management

Users can manually browse photos, upload a file, paste a URL, or design a custom color+icon cover — replacing or removing any trip's cover image from the edit sheet.

### Story 2.1: Split TripEditSheet into Subcomponents

As a developer,
I want `trip-edit-sheet.tsx` split into focused subcomponents before cover image work begins,
So that the file stays within the 250-line limit and each section remains independently maintainable.

**Acceptance Criteria:**

**Given** `src/components/packt/trip-edit-sheet.tsx` at ~300 lines
**When** this story is complete
**Then** the file is under 250 lines

**Given** the Cover Image, Destination, and Budget sections
**Then** each is extracted into its own subcomponent file in `src/components/packt/`

**Given** the refactor
**Then** all existing functionality is preserved — no behavioral changes
**And** all existing `trip-edit-sheet.test.tsx` tests pass with no modifications

---

### Story 2.2: CoverImagePicker — Scaffold & Search Tab

As a traveler,
I want to open a cover image picker and browse destination photos and a map view,
So that I can select a professionally sourced cover image for my trip.

**Acceptance Criteria:**

**Given** `src/components/packt/cover-image-picker.tsx` (new file)
**Then** the component accepts a `CoverImagePickerProps` interface:
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

**Given** the picker opens
**Then** it renders as a dialog with 4 tabs: **Search**, **Upload**, **URL**, **Custom** — Search is active by default

**Given** the Search tab is active and `destinationName` is provided
**Then** `searchCoverImages(destinationName)` is called on mount and a loading state is shown while fetching

**Given** the Unsplash results load
**Then** a grid renders with the Mapbox static map tile at position 0, followed by up to 19 Unsplash photo thumbnails

**Given** `center` coordinates are provided
**Then** the Mapbox tile URL is constructed as `GET /styles/v1/mapbox/outdoors-v12/static/{lng},{lat},10/600x400@2x`

**Given** `center` is not provided
**Then** the map tile slot is not shown; only Unsplash results appear

**Given** I click any grid item
**Then** `onImageSelected(url)` is called with the selected URL and `onClose()` is called

**Given** the Unsplash API fails
**Then** `toast.error("Could not load images")` is shown and the grid shows an empty state

**Given** keyboard navigation
**Then** the dialog opens via keyboard, Escape closes it, focus is trapped inside while open, and focus returns to the trigger button on close

**Given** `src/components/packt/cover-image-picker.test.tsx` (new file)
**Then** tests cover: renders 4 tabs, Search tab calls searchCoverImages on mount, grid renders map tile at position 0, clicking an image calls onImageSelected, API failure shows empty state and toast, Escape closes the dialog

---

### Story 2.3: CoverImagePicker — Upload & URL Tabs

As a traveler,
I want to upload a photo from my device or paste an image URL,
So that I can use any image I already have as my trip's cover.

**Acceptance Criteria:**

**Given** the Upload tab is active
**Then** a drop zone is shown with "Drop file here or browse" text and a hidden `<input type="file">` with an associated `<label>` for screen readers

**Given** I select or drop an image file
**Then** `uploadCoverImage(tripId, formData)` is called and a loading indicator is shown during upload

**Given** the upload succeeds
**Then** `onImageSelected(blobUrl)` is called with the returned Vercel Blob URL and `onClose()` is called

**Given** the upload fails
**Then** `toast.error("Upload failed. Try again.")` is shown; the drop zone resets and the picker stays open

**Given** `process.env.UPLOAD_STUB === "true"`
**Then** the real Blob `put()` call is skipped and a placeholder URL is returned

**Given** `src/app/(app)/trips/[tripId]/actions.ts`
**Then** an `uploadCoverImage(tripId: string, formData: FormData)` server action exists that calls `requireUser()` and `assertTripAccess()`, calls `put()` guarded by `UPLOAD_STUB`, updates `coverImageUrl` in the DB, calls `revalidatePath`, and returns the URL

**Given** the URL tab is active
**Then** a text input and an "Apply" button are shown

**Given** I enter a URL and click Apply
**Then** `onImageSelected(url)` is called and `onClose()` is called

**Given** the URL field is empty
**Then** the Apply button is disabled

**Given** `cover-image-picker.test.tsx`
**Then** tests cover: Upload tab renders drop zone with associated label, file selection triggers upload action, upload failure shows toast and keeps picker open, URL tab Apply calls onImageSelected with the entered URL, Apply is disabled when input is empty

---

### Story 2.4: CoverImagePicker — Custom Tab

As a traveler,
I want to design a custom color and icon cover for my trip,
So that trips without a destination photo still have a polished, personalised cover.

**Acceptance Criteria:**

**Given** the Custom tab is active
**Then** it shows three sections: **Background color**, **Icon**, and **Preview**

**Given** the Background color section
**Then** 8–12 pre-defined color swatches are displayed; the currently selected swatch has a check overlay (not border color alone)

**Given** the Icon section
**Then** ~19 Lucide travel icons are displayed in a grid (backpack, luggage, map, caravan, compass, plane, map-pin, hotel, ship, tent-tree, van, map-pinned, car, bus, road, tree-palm, camera, mountain, trees); all rendered at `strokeWidth={1.5}`; each icon button has a `title` attribute

**Given** I select a color or icon
**Then** the Preview card updates in real time to show the selected combination

**Given** I click Apply
**Then** the combination is encoded as `graphic:{color}/{icon}` and `onImageSelected("graphic:{color}/{icon}")` is called, followed by `onClose()`

**Given** the tab mounts
**Then** the first color and first icon are pre-selected as defaults so an Apply-able state always exists

**Given** `cover-image-picker.test.tsx`
**Then** tests cover: Custom tab renders swatches, icon grid, and preview; selecting a color updates the preview; selecting an icon updates the preview; Apply emits the correct `graphic:` URL; check overlay is present on the selected swatch

---

### Story 2.5: TripEditSheet Cover Section & Remove

As a traveler,
I want to see my current trip cover and open the picker or remove the image from the edit sheet,
So that I can change or clear a trip's cover at any time after creation.

**Acceptance Criteria:**

**Given** the TripEditSheet is open for a trip with a cover image
**Then** the Cover Image section shows a thumbnail preview of the current cover
**And** "Edit cover image" and "Remove image" buttons are both visible

**Given** the TripEditSheet is open for a trip with no cover image
**Then** the gradient/icon placeholder is shown as the preview
**And** "Edit cover image" is visible; "Remove image" is hidden

**Given** I click "Edit cover image"
**Then** `CoverImagePicker` opens with the trip's `destinationName`, `destinationCountry`, and `center` passed as props

**Given** `onImageSelected(url)` fires from the picker
**Then** `updateTripMetadata` is called with the new `coverImageUrl`
**And** the preview in the edit sheet updates immediately
**And** `revalidatePath` ensures trip list and detail page reflect the change

**Given** I click "Remove image"
**Then** `updateTripMetadata` is called with `coverImageUrl: null`
**And** the preview reverts to the gradient/icon placeholder
**And** "Remove image" is hidden after removal

**Given** `src/components/packt/trip-edit-sheet.test.tsx`
**Then** tests cover: preview shown when coverImageUrl set, placeholder shown when unset, "Remove image" hidden when no cover, clicking "Edit cover image" opens picker, onImageSelected updates cover, remove clears cover and hides the remove button

