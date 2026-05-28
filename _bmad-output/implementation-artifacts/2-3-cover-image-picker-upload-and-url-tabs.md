# Story 2.3: CoverImagePicker — Upload & URL Tabs

Status: done

## Story

As a traveler,
I want to upload a photo from my device or paste an image URL,
so that I can use any image I already have as my trip's cover.

## Acceptance Criteria

1. **Given** the Upload tab is active — **Then** a drop zone is shown with "Drop file here or browse" text and a hidden `<input type="file">` with an associated `<label>` for screen readers

2. **Given** I select or drop an image file — **Then** `uploadCoverImage(tripId, formData)` is called and a loading indicator is shown during upload

3. **Given** the upload succeeds — **Then** `onImageSelected(blobUrl)` is called with the returned Vercel Blob URL and `onClose()` is called

4. **Given** the upload fails — **Then** `toast.error("Upload failed. Try again.")` is shown; the drop zone resets and the picker stays open

5. **Given** `process.env.UPLOAD_STUB === "true"` — **Then** the real Blob `put()` call is skipped and a placeholder URL is returned

6. **Given** `src/app/(app)/trips/[tripId]/actions.ts` — **Then** an `uploadCoverImage(tripId: string, formData: FormData)` server action exists that calls `requireUser()` and `assertTripAccess()`, calls `put()` guarded by `UPLOAD_STUB`, updates `coverImageUrl` in the DB, calls `revalidatePath`, and returns the URL

7. **Given** the URL tab is active — **Then** a text input and an "Apply" button are shown

8. **Given** I enter a URL and click Apply — **Then** `onImageSelected(url)` is called and `onClose()` is called

9. **Given** the URL field is empty — **Then** the Apply button is disabled

10. **Given** `cover-image-picker.test.tsx` — **Then** tests cover: Upload tab renders drop zone with associated label, file selection triggers upload action, upload failure shows toast and keeps picker open, URL tab Apply calls onImageSelected with the entered URL, Apply is disabled when input is empty

## Tasks / Subtasks

- [x] Add `uploadCoverImage` server action to `src/app/(app)/trips/[tripId]/actions.ts` (AC: 6)
  - [x] Call `requireUser()` + `assertTripAccess(tripId, user.id!, "editor")`
  - [x] Extract file from `FormData`, validate it's an image
  - [x] Guard with `process.env.UPLOAD_STUB !== "true"` — skip real Blob `put()`, return placeholder URL when stubbed
  - [x] Call `put()` from `@vercel/blob` for real uploads
  - [x] Update `coverImageUrl` on the trip row in the DB
  - [x] Call `revalidatePath(\`/trips/${tripId}\`)`
  - [x] Return the uploaded URL string

- [x] Create `src/components/packt/cover-image-picker-upload.tsx` — Upload tab subcomponent (AC: 1, 2, 3, 4, 5)
  - [x] Define `CoverImagePickerUploadProps` interface (`tripId: string; onImageSelected: (url: string) => void; onClose: () => void`)
  - [x] Add drop zone with "Drop file here or browse" text — styled with dashed border, centered content
  - [x] Add hidden `<input type="file" accept="image/*">` with associated `<label>` wrapping the drop zone
  - [x] Handle drag events (dragOver, dragLeave, drop) on the drop zone
  - [x] On file selection/drop: build `FormData`, call `uploadCoverImage(tripId, formData)`
  - [x] Show loading indicator during upload (spinner or "Uploading..." text)
  - [x] On success: `onImageSelected(blobUrl)` → `onClose()`
  - [x] On failure: `toast.error("Upload failed. Try again.")`, reset drop zone state
  - [x] Guard: skip real upload when `process.env.UPLOAD_STUB === "true"` (server action handles this)
  - [x] `"use client"` at top, explicit interface, colocated test file

- [x] Create `src/components/packt/cover-image-picker-url.tsx` — URL tab subcomponent (AC: 7, 8, 9)
  - [x] Define `CoverImagePickerUrlProps` interface (`onImageSelected: (url: string) => void; onClose: () => void`)
  - [x] Add text input (type="url", placeholder="https://...") + "Apply" button
  - [x] Apply button disabled when input is empty
  - [x] On Apply click: `onImageSelected(url)` → `onClose()`
  - [x] `"use client"` at top, explicit interface, colocated test file

- [x] Replace Upload/URL tab placeholders in `src/components/packt/cover-image-picker.tsx` (AC: 1, 7)
  - [x] Import `CoverImagePickerUpload` from `./cover-image-picker-upload`
  - [x] Import `CoverImagePickerUrl` from `./cover-image-picker-url`
  - [x] Replace `<div>Upload tab content</div>` with `<CoverImagePickerUpload tripId={tripId} onImageSelected={onImageSelected} onClose={onClose} />`
  - [x] Replace `<div>URL tab content</div>` with `<CoverImagePickerUrl onImageSelected={onImageSelected} onClose={onClose} />`

- [x] Write `src/components/packt/cover-image-picker-upload.test.tsx` (AC: 10)
  - [x] Test: renders drop zone with associated label element
  - [x] Test: file selection triggers `uploadCoverImage` action call
  - [x] Test: upload failure shows `toast.error` and keeps picker open
  - [x] Test: loading indicator shown during upload

- [x] Write `src/components/packt/cover-image-picker-url.test.tsx` (AC: 10)
  - [x] Test: renders text input + Apply button
  - [x] Test: Apply button is disabled when URL input is empty
  - [x] Test: Apply with valid URL calls `onImageSelected` and `onClose`

### Review Findings

- [x] [Review][Patch] Missing server-side validation for cover-image uploads [src/app/(app)/trips/[tripId]/actions.ts:408]
- [x] [Review][Patch] Failed upload path does not reset the selected file for retry [src/components/packt/cover-image-picker-upload.tsx:29]
- [x] [Review][Patch] Blob uploads can be orphaned if the database update fails [src/app/(app)/trips/[tripId]/actions.ts:411]
- [x] [Review][Patch] Upload control is not keyboard reachable in its current hidden-input form [src/components/packt/cover-image-picker-upload.tsx:70]

### Review Findings (Round 2)

- [x] [Review][Patch] Old cover blob never cleaned up on replacement [src/app/(app)/trips/[tripId]/actions.ts:419-421]
- [x] [Review][Patch] Missing client-side file-size validation before upload [src/components/packt/cover-image-picker-upload.tsx:33-34]
- [x] [Review][Patch] URL input accepted without validation (javascript: URIs, non-URLs) [src/components/packt/cover-image-picker-url.tsx:10-28]
- [x] [Review][Patch] Button inside form renders without type="button" [src/components/packt/cover-image-picker-url.tsx:25]
- [x] [Review][Patch] uploadCoverImage mock is required for module graph interposition (server-only resolution); not dead code — dismissed
- [x] [Review][Defer] Test coverage location mismatch — subcomponent tests are in colocated files per project convention, not in cover-image-picker.test.tsx as the spec states; deferred, pre-existing project pattern

## Dev Notes

### Existing Component State

`CoverImagePicker` at `src/components/packt/cover-image-picker.tsx` is currently 233 lines (4 tabs: Search, Upload, URL, Custom). Upload and URL tabs render placeholder `<div>` elements. The Search tab is fully implemented.

**SPLIT RULE:** Upload and URL tab implementations must go in their own subcomponent files to keep `cover-image-picker.tsx` under 250 lines. This follows the pattern established in story 2.1 (TripEditSheet subcomponents).

**Key existing props (keep unchanged):**
```ts
export interface CoverImagePickerProps {
  tripId: string;
  destinationName?: string;
  destinationCountry?: string;
  center?: [number, number];
  onImageSelected: (url: string) => void;
  onClose: () => void;
}
```

**Existing imports:** `"use client"`, `React`, `searchCoverImages` from `@/app/(app)/trips/actions`, `Dialog`/`Tabs`/`Button` from `@/components/ui/`, `cn` from `@/lib/utils`, `toast` from `sonner`, `X`/`Loader` from `lucide-react`.

### Server Action Pattern (`uploadCoverImage`)

Follow the existing `uploadDocument` pattern in `src/app/(app)/trips/[tripId]/actions.ts:371`:

```ts
export async function uploadCoverImage(tripId: string, formData: FormData): Promise<string> {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "editor");

  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("No file provided");
  // Optional: validate image type (image/png, image/jpeg, image/webp, image/gif)
  // Optional: file size limit (follow MAX_UPLOAD_BYTES pattern: 25 MB)

  let url: string;
  if (process.env.UPLOAD_STUB === "true") {
    url = `https://placehold.co/600x400/png?text=${encodeURIComponent(file.name)}`;
  } else {
    const result = await put(file.name, file, { access: "public" });
    url = result.url;
  }

  await db
    .update(trips)
    .set({ coverImageUrl: url })
    .where(eq(trips.id, tripId));

  revalidatePath(`/trips/${tripId}`);
  return url;
}
```

**Key differences from `uploadDocument`:**
- Does NOT insert a `documents` row — updates `coverImageUrl` on the trip directly
- Returns the URL string (caller passes it via `onImageSelected`)
- No `inferDocKind`/`formatFileSize` needed (no documents table entry)

### Upload Tab Implementation

**Accessibility requirements:**
- File input must have an associated `<label>` element (AC requirement)
- Drop zone must work via keyboard — the `<label>` wrapping the input provides this (clicking label opens file dialog)
- Loading indicator during upload needs `role="status"` and `aria-label="Uploading image"` — follow the pattern from the existing Search tab spinner
- Drag-and-drop is a progressive enhancement — the file input must always be accessible as a fallback

```tsx
// Drop zone with hidden file input
const fileInputRef = useRef<HTMLInputElement>(null);
const [uploading, setUploading] = useState(false);
const [dragOver, setDragOver] = useState(false);

// Drag handlers:
// onDragOver → preventDefault + setDragOver(true)
// onDragLeave → setDragOver(false)
// onDrop → preventDefault + setDragOver(false) + handleFile(e.dataTransfer.files[0])

// File select handler (input onChange or drop):
async function handleFile(file: File) {
  setUploading(true);
  const formData = new FormData();
  formData.append("file", file);
  try {
    const url = await uploadCoverImage(tripId, formData);
    onImageSelected(url);
    onClose();
  } catch {
    toast.error("Upload failed. Try again.");
    setUploading(false);
  }
}
```

**Drop zone styling:** Dashed border (`var(--line)`), rounded corners, centered content. On drag over: `var(--accent-soft)` background. Label wraps the entire zone so clicking anywhere opens the file dialog.

**File input:** `<input ref={fileInputRef} type="file" accept="image/*" onChange={onFileSelected} style={{ display: "none" }} id="cover-upload-input" />` with `<label htmlFor="cover-upload-input">` wrapping the drop zone content.

### URL Tab Implementation

**Accessibility requirements:**
- Text input must have an associated `<label>` for screen readers
- Apply button uses native `<button disabled>` — no ARIA needed beyond the native `disabled` attribute
- Keyboard flow: type URL → Tab to Apply → Enter/Space to submit

```tsx
const [urlInput, setUrlInput] = useState("");

// Apply handler:
function handleApplyUrl() {
  if (!urlInput.trim()) return;
  onImageSelected(urlInput.trim());
  onClose();
}
```

**Apply button disabled condition:** `!urlInput.trim()` — no URL validation beyond non-empty. Invalid URLs are handled by the `<img>` `onError` fallback in `TripCover`.

### What Must Be Preserved

- Search tab behavior must be unchanged (existing tests must pass)
- Custom tab placeholder remains as-is (story 2.4)
- `CoverImageResult` interface stays local to cover-image-picker.tsx (do NOT export from actions.ts)
- `coverImageUrl` update goes through DB directly — NOT through `updateTripMetadata` (which never auto-modifies `coverImageUrl`)
- `trip-edit-cover.tsx` and `trip-edit-sheet.tsx` are NOT modified in this story

### What NOT to Do

- Do not implement the Custom tab — placeholder only (story 2.4)
- Do not wire the picker into TripEditSheet/TripEditCover (story 2.5)
- Do not create E2E tests for this story
- Do not modify the Search tab behavior in any way
- Do not add new dependencies — all needed packages exist

### Library/Framework Requirements

All already in the project — no new dependencies:
- `@vercel/blob` — `put()` for file upload
- `sonner` — `toast.error()` / `toast.success()`
- `lucide-react` — `Upload`, `Link` icons (or equivalents) for tab content
- `@/components/ui/button` — `Button` component
- `@/app/(app)/trips/[tripId]/actions` — new `uploadCoverImage` server action

### Testing Patterns for New Subcomponent Tests

**Mock for `cover-image-picker-upload.test.tsx`:**
```ts
import { vi } from "vitest";

vi.mock("@/app/(app)/trips/[tripId]/actions", () => ({
  uploadCoverImage: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));
```

**Test approach for upload:**
- Render `CoverImagePickerUpload` with mock `onImageSelected` and `onClose`
- Simulate file selection via `fireEvent.change(fileInput)` targeting the hidden input (use `screen.getByLabelText` or `container.querySelector`)
- Assert `uploadCoverImage` was called with `tripId` and FormData
- For failure: make `uploadCoverImage` reject, assert `toast.error` was called and picker stays open
- Loading state: test that spinner renders while upload is in progress

**Mock for `cover-image-picker-url.test.tsx`:**
```ts
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));
```

**Test approach for URL:**
- Render `CoverImagePickerUrl` with mock `onImageSelected` and `onClose`
- Type URL in input, click Apply, assert `onImageSelected` called with URL and `onClose` called
- Verify Apply button is `disabled` when input is empty
- Verify Apply button is enabled when input has text

### Previous Story Intelligence (Story 2.2)

**Patterns to follow:**
- Dialog uses `@/components/ui/dialog.tsx` (Base UI) — `open` prop for programmatic control
- Tabs use `@/components/ui/tabs.tsx` (Base UI) — `defaultValue` on root, `value` on triggers/content
- `cn()` from `@/lib/utils` for all className merging
- `"use client"` must be first line
- Colocated test file: `cover-image-picker.test.tsx`
- `.trim()` user input before use
- `?? undefined` not `|| undefined` for optional values
- Always add `onError` fallback for `<img>` elements

**Review fixes from 2.2 to carry forward:**
- Server-side env vars (`MAPBOX_ACCESS_TOKEN`, `UPLOAD_STUB`) accessed only in server actions, never in client components
- Loading states: use `role="status"` and `aria-label` for accessibility
- Error states: show toast + visual empty state (never silent failures)

### File Structure Summary

| File | Operation | Notes |
|------|-----------|-------|
| `src/components/packt/cover-image-picker-upload.tsx` | NEW | Upload tab subcomponent — drop zone, file input, upload action |
| `src/components/packt/cover-image-picker-upload.test.tsx` | NEW | Colocated tests for upload tab |
| `src/components/packt/cover-image-picker-url.tsx` | NEW | URL tab subcomponent — text input + Apply button |
| `src/components/packt/cover-image-picker-url.test.tsx` | NEW | Colocated tests for URL tab |
| `src/components/packt/cover-image-picker.tsx` | UPDATE | Replace Upload & URL tab placeholders with subcomponent imports |
| `src/app/(app)/trips/[tripId]/actions.ts` | UPDATE | Add `uploadCoverImage` server action following `uploadDocument` pattern |
| `_bmad-output/sprint-status.yaml` | UPDATE | Mark story 2.3 as ready-for-dev |

### References

- [Source: `_bmad-output/epics-cover-image.md` lines 382–419] — Story 2.3 ACs
- [Source: `_bmad-output/implementation-artifacts/2-2-cover-image-picker-scaffold-and-search-tab.md`] — Previous story with patterns, learnings, dev notes, and review fixes
- [Source: `src/app/(app)/trips/[tripId]/actions.ts:371`] — `uploadDocument` server action pattern
- [Source: `src/components/packt/cover-image-picker.tsx`] — Existing 4-tab dialog with placeholder Upload/URL/Custom tabs
- [Source: `src/components/packt/cover-image-picker.test.tsx`] — Existing 21 tests for Search tab
- [Source: `_bmad-output/project-context.md`] — Project-wide conventions (DB, auth, styling, testing)

### What NOT to Do

- Do not implement the Custom tab — placeholder only (story 2.4)
- Do not wire the picker into TripEditSheet/TripEditCover (story 2.5)
- Do not create E2E tests for this story
- Do not modify the Search tab behavior in any way
- Do not add new dependencies — all needed packages exist
- Do NOT add Upload/URL tab implementation code directly in `cover-image-picker.tsx` — must use subcomponent imports

## Dev Agent Record

### Agent Model Used

big-pickle

### Debug Log References

### Completion Notes List

- Added `uploadCoverImage` server action to `actions.ts` following the `uploadDocument` pattern; uses `UPLOAD_STUB` guard, updates `coverImageUrl` directly on the trip row, returns URL string.
- Created `CoverImagePickerUpload` with accessible label/input (htmlFor), dashed drop zone, drag event handlers, loading spinner (role="status"), and error toast on failure.
- Created `CoverImagePickerUrl` with disabled Apply button (no early-return guard — redundant with disabled state), URL trimmed on apply.
- Updated `cover-image-picker.tsx` to destructure `tripId` and wire both subcomponents; updated existing test to remove stale placeholder assertions and added uploadCoverImage mock.
- 8 new upload tests (drag over/leave/drop, file select, failure, success, no-file no-op, loading state); 4 URL tests. Full suite: 1136 tests, 0 failures.
- Branch coverage fix: removed unreachable early-return guard in `handleApplyUrl`; added drag-event tests for upload. Coverage: lines 96.96%, functions 95.7%, branches 90.03%, statements 95.29%.

### File List

- src/components/packt/cover-image-picker.tsx
- src/components/packt/cover-image-picker-upload.tsx
- src/components/packt/cover-image-picker-upload.test.tsx
- src/components/packt/cover-image-picker-url.tsx
- src/components/packt/cover-image-picker-url.test.tsx
- src/app/(app)/trips/[tripId]/actions.ts
- _bmad-output/sprint-status.yaml
- _bmad-output/implementation-artifacts/2-3-cover-image-picker-upload-and-url-tabs.md
