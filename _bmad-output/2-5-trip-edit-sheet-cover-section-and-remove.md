# Story 2.5: TripEditSheet Cover Section & Remove

Status: done

## Story

As a traveler,
I want to see my current trip cover and open the picker or remove the image from the edit sheet,
so that I can change or clear a trip's cover at any time after creation.

## Acceptance Criteria

1. **Given** the TripEditSheet is open for a trip with a cover image, **then** the Cover Image section shows a thumbnail preview of the current cover **and** "Edit cover image" and "Remove image" buttons are both visible

2. **Given** the TripEditSheet is open for a trip with no cover image, **then** the gradient/icon placeholder is shown as the preview **and** "Edit cover image" is visible; "Remove image" is hidden

3. **Given** I click "Edit cover image", **then** `CoverImagePicker` opens with the trip's `destinationName`, `destinationCountry`, and `center` (always `undefined` — not stored on Trip) passed as props

4. **Given** `onImageSelected(url)` fires from the picker, **then** the draft's `coverImageUrl` updates immediately in local state **and** the preview in the edit sheet reflects the new cover **and** when the user clicks Save, `updateTripMetadata` is called with the new `coverImageUrl`, and `revalidatePath` ensures the trip list and detail page reflect the change

5. **Given** I click "Remove image", **then** the draft's `coverImageUrl` is cleared to `null` in local state **and** the preview reverts to the gradient/icon placeholder **and** "Remove image" is hidden after removal **and** when the user clicks Save, `updateTripMetadata` is called with `coverImageUrl: null`

6. **Given** `src/components/packt/trip-edit-cover.test.tsx`, **then** tests cover: thumbnail preview shown when `coverImageUrl` set; placeholder shown when unset; "Edit cover image" visible always; "Remove image" hidden when no cover; "Remove image" visible when cover exists; clicking "Edit cover image" opens picker; `onImageSelected` updates preview and closes picker; Remove button clears cover and hides the Remove button

## Tasks / Subtasks

- [x] Update `UpdateTripPatch` in `src/data/types.ts` to allow `null` for `coverImageUrl` (AC: 5)
  - [x] Change `coverImageUrl?: string` to `coverImageUrl?: string | null`

- [x] Update `getPatch()` in `src/components/packt/trip-edit-sheet.tsx` (AC: 5)
  - [x] Change `coverImageUrl: currentDraft.coverImageUrl` to `coverImageUrl: currentDraft.coverImageUrl ?? null` so that removing the cover passes `null` (not `undefined`) to Drizzle — Drizzle drops `undefined` from SET but passes `null` correctly

- [x] Redesign `src/components/packt/trip-edit-cover.tsx` (AC: 1, 2, 3, 4, 5)
  - [x] Add props to `TripEditCoverProps`: `tripId: string`, `destinationName?: string`, `destinationCountry?: string`
  - [x] Remove: `imgError` state, `useEffect`, URL `<Input>`, `<Image>` preview
  - [x] Add: `isPickerOpen: boolean` state (default `false`)
  - [x] Render a `TripCover` thumbnail (height 120, full width, `showCity={false}`) as the preview
  - [x] Render "Edit cover image" button — always visible (disabled when `disabled` prop is true)
  - [x] Render "Remove image" button — only visible when `!!coverImageUrl`; calls `onCoverImageUrlChange(null)` (use `null`, not `undefined`, to ensure Drizzle clears the column)
  - [x] Render `<CoverImagePicker>` when `isPickerOpen` — pass `tripId`, `destinationName`, `destinationCountry`, `center={undefined}`, `onImageSelected` closes picker and fires callback, `onClose={() => setIsPickerOpen(false)}`
  - [x] Update prop type: `onCoverImageUrlChange: (url: string | null) => void` (matching new patch type)

- [x] Update `src/components/packt/trip-edit-sheet.tsx` (AC: 3)
  - [x] Pass `tripId={draft.id}` to `TripEditCover`
  - [x] Pass `destinationName={draft.destinationName}` to `TripEditCover`
  - [x] Pass `destinationCountry={draft.destinationCountry}` to `TripEditCover`
  - [x] Update `set("coverImageUrl", ...)` call type compatibility in `onCoverImageUrlChange` if needed

- [x] Rewrite `src/components/packt/trip-edit-cover.test.tsx` (AC: 6)
  - [x] Mock `TripCover` and `CoverImagePicker` — see test guidance below
  - [x] Remove all old tests (URL input, `<Image>` preview, error reset)
  - [x] Add tests listed in AC 6

- [x] Update `src/components/packt/trip-edit-sheet.test.tsx` (AC: 4, 5)
  - [x] Add mock for `TripEditCover` — mirrors the TripEditCollaborators mock pattern
  - [x] Remove tests that poke through TripEditCover internals: "renders cover image URL input" (line 229), "renders cover image preview when coverImageUrl is set" (line 234), "sets coverImageUrl to undefined when input is cleared" (line 274)
  - [x] Add test: TripEditCover mock callback fires → `onSave` patch includes updated `coverImageUrl`
  - [x] Add test: TripEditCover remove callback fires → `onSave` patch has `coverImageUrl: null`

- [x] Add E2E coverage for Remove image flow (AC: 5)
  - [x] Add `coverImageUrl: "graphic:var(--accent-brand)/plane"` to the seed trip in `tests/e2e/e2e-seed-data.ts` so a trip with a cover exists without needing external APIs
  - [x] Create `tests/e2e/features/trip-cover-edit.feature` with at least one scenario: open the edit sheet for a trip that has a cover image, click "Remove image", click Save, verify the cover is cleared in the UI
  - [x] Create `tests/e2e/steps/trip-cover-edit.steps.ts` with step definitions using the playwright-bdd pattern (DB `Before` hook for seeding if needed, no UI-driven setup chains)

### Review Findings

- [x] [Review][Patch] Saving an unchanged no-cover draft now forces a destructive `coverImageUrl: null` update [_src/components/packt/trip-edit-sheet.tsx:126_]
- [x] [Review][Patch] `TripEditCover` tests no longer prove that selecting/removing a cover updates the preview state required by AC 6 [_src/components/packt/trip-edit-cover.test.tsx:22_]
- [x] [Review][Patch] Re-selecting the same failed image URL can leave the preview stuck on the fallback stripes [_src/components/packt/trip-cover.tsx:57_]
- [x] [Review][Patch] The new remove-cover E2E only checks button visibility after reload, not that the visible cover actually cleared [_tests/e2e/steps/trip-cover-edit.steps.ts:34_]

### Round 2 Review Findings

- [x] [Review][Patch] TripCover key doesn't coalesce empty string — switched `??` to `||` [_src/components/packt/trip-edit-cover.tsx:33_]
- [x] [Review][Patch] cover-stripes blur 2px→15px — reverted to 2px [_src/app/globals.css_]
- [x] [Review][Patch] globals.css missing trailing newline — added [_src/app/globals.css_]
- [x] [Review][Patch] disabled prop untested — added test + mock renders disabled attribute [_src/components/packt/trip-edit-cover.test.tsx_, _src/components/packt/trip-edit-sheet.test.tsx_]
- [x] [Review][Patch] No E2E scenario for edit+save flow — added scenario + step definitions [_tests/e2e/features/trip-cover-edit.feature_]
- [x] [Review][Patch] E2E step uses fragile `locator("..")` chain — replaced with direct dialog-scoped queries [_tests/e2e/steps/trip-cover-edit.steps.ts_]
- [x] [Review][Patch] Empty string `""` passes through getPatch uncoalesced — switched `??` to `||` [_src/components/packt/trip-edit-sheet.tsx:123-126_]
- [x] [Review][Defer] `revalidatePath` assertion absent from unit tests — better tested via E2E [_src/components/packt/trip-edit-sheet.test.tsx_]

## Dev Notes

### Type Change: `UpdateTripPatch.coverImageUrl`

Change in `src/data/types.ts` line ~445:
```ts
// Before
coverImageUrl?: string;
// After
coverImageUrl?: string | null;
```

This is the only way to distinguish "don't touch this field" (undefined → Drizzle skips) from "clear this field" (null → Drizzle sets to NULL). Drizzle's behavior is documented in project-context.md: "Drizzle drops undefined from UPDATE."

### `getPatch()` Fix in `trip-edit-sheet.tsx`

In `trip-edit-sheet.tsx` `getPatch()` function:
```ts
// Before
coverImageUrl: currentDraft.coverImageUrl,
// After
coverImageUrl: currentDraft.coverImageUrl ?? null,
```

This ensures a removed cover (draft's `coverImageUrl` is `undefined` after calling `onCoverImageUrlChange(null)`) gets serialized as `null` in the patch, not omitted.

Wait — actually `onCoverImageUrlChange` will receive `null` from the new Remove button. Store it in draft state as `null`. Then `currentDraft.coverImageUrl` is `null`, and `null ?? null = null` — correct.

BUT: the `Trip` type has `coverImageUrl?: string` (no `null`). Storing `null` in the draft requires the draft state to be `Trip & { coverImageUrl?: string | null }` or similar. The simplest fix: have `onCoverImageUrlChange(null)` call `set("coverImageUrl", undefined)` in the sheet — and use `coverImageUrl: currentDraft.coverImageUrl ?? null` in `getPatch()` to convert undefined→null.

**Recommended approach**:
- `onCoverImageUrlChange` in TripEditCover passes `null` to the parent
- In `trip-edit-sheet.tsx`, the `set("coverImageUrl", ...)` call needs to accept `string | null`
- The `Trip` type's `coverImageUrl?: string` field shouldn't store `null` — convert null→undefined when setting draft state
- So in TripEditSheet's handler for TripEditCover: `(url) => set("coverImageUrl", url ?? undefined)`
- In `getPatch()`: `coverImageUrl: currentDraft.coverImageUrl ?? null`

This keeps Trip.coverImageUrl typed as `string | undefined` (no null), while correctly passing `null` in the patch.

### TripEditCover UI Layout

```tsx
<Section title="Cover image">
  {/* Thumbnail preview — always rendered */}
  <TripCover
    name={tripName}
    coverImageUrl={coverImageUrl}
    showCity={false}
    style={{ height: 120, width: "100%", borderRadius: 6, border: "1px solid var(--line)" }}
  />
  {/* Action buttons */}
  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
    <Button
      variant="outline"
      size="sm"
      disabled={disabled}
      onClick={() => setIsPickerOpen(true)}
    >
      Edit cover image
    </Button>
    {coverImageUrl ? (
      <Button
        variant="ghost"
        size="sm"
        disabled={disabled}
        onClick={() => onCoverImageUrlChange(null)}
      >
        Remove image
      </Button>
    ) : null}
  </div>
  {/* Picker — rendered inline when open */}
  {isPickerOpen ? (
    <CoverImagePicker
      tripId={tripId}
      destinationName={destinationName}
      destinationCountry={destinationCountry}
      center={undefined}
      onImageSelected={onCoverImageUrlChange}
      onClose={() => setIsPickerOpen(false)}
    />
  ) : null}
</Section>
```

### Props Interface

```ts
export interface TripEditCoverProps {
  tripId: string;
  tripName: string;
  coverImageUrl?: string;
  onCoverImageUrlChange: (url: string | null) => void;
  disabled?: boolean;
  destinationName?: string;
  destinationCountry?: string;
}
```

### Focus Management

The CoverImagePicker dialog is backed by `@base-ui/react/dialog` (via `src/components/ui/dialog.tsx`). Base UI's Dialog handles focus trapping inside the dialog while open and restores focus to the previously focused element — the "Edit cover image" button — when the dialog closes. Do NOT add manual `ref`-based focus restoration; it conflicts with Base UI's built-in behavior.

### `center` Coordinates

The `Trip` type does not store `destinationCenter`. Only `CreateTripInput` and `NewTripDraft` have it. Pass `center={undefined}` to `CoverImagePicker` — the picker handles this gracefully (no map tile slot shown when center is absent). This is a known limitation documented in the deferred-work.

### TripEditSheet Wiring

In `trip-edit-sheet.tsx`, update the `TripEditCover` call:
```tsx
<TripEditCover
  tripId={draft.id}
  tripName={draft.name}
  coverImageUrl={draft.coverImageUrl}
  onCoverImageUrlChange={(url) => set("coverImageUrl", url ?? undefined)}
  disabled={isBusy}
  destinationName={draft.destinationName}
  destinationCountry={draft.destinationCountry}
/>
```

The `url ?? undefined` conversion keeps `Trip.coverImageUrl` as `string | undefined` in draft state while receiving `null` from the Remove button.

### TripCover Props for Thumbnail

`TripCover` signature (from `src/components/packt/trip-cover.tsx`):
```ts
interface TripCoverProps {
  name: string;
  country?: string;
  metaTag?: string;
  showCity?: boolean;
  className?: string;
  style?: React.CSSProperties;
  coverImageUrl?: string;
  destinationCountry?: string;
}
```

Use `showCity={false}` to suppress the name/country overlay in the thumbnail. Pass `name={tripName}` (used for gradient tint calculation). Pass `coverImageUrl` and `destinationCountry` for accurate rendering.

### Test Guidance

**`trip-edit-cover.test.tsx`** — Full rewrite:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TripEditCover } from "./trip-edit-cover";

// Mock TripCover — it uses next-themes and lucide-react which are heavy
vi.mock("./trip-cover", () => ({
  TripCover: ({ coverImageUrl }: { coverImageUrl?: string }) => (
    <div data-testid="trip-cover-preview" data-url={coverImageUrl ?? ""} />
  ),
}));

// Mock CoverImagePicker — heavy dialog with real API calls
vi.mock("./cover-image-picker", () => ({
  CoverImagePicker: ({
    onImageSelected,
    onClose,
  }: {
    onImageSelected: (url: string) => void;
    onClose: () => void;
  }) => (
    <div data-testid="cover-image-picker">
      <button onClick={() => onImageSelected("https://example.com/new.jpg")}>select-image</button>
      <button onClick={onClose}>close-picker</button>
    </div>
  ),
}));
```

Tests to add:
- `TripCover` is rendered (via `getByTestId("trip-cover-preview")`)
- When `coverImageUrl` is set, TripCover receives it via `data-url`
- When `coverImageUrl` is absent, TripCover renders with no url
- "Edit cover image" button is always present
- "Remove image" not in DOM when `coverImageUrl` is absent
- "Remove image" in DOM when `coverImageUrl` is set
- Clicking "Edit cover image" renders the picker (`getByTestId("cover-image-picker")`)
- Clicking "select-image" in picker calls `onCoverImageUrlChange` with the URL and closes the picker
- Clicking "Remove image" calls `onCoverImageUrlChange(null)` and hides Remove button

**`trip-edit-sheet.test.tsx`** — Updates:

Add mock for `TripEditCover` (alongside existing `TripEditCollaborators` mock):
```tsx
vi.mock("./trip-edit-cover", () => ({
  TripEditCover: ({
    coverImageUrl,
    onCoverImageUrlChange,
  }: {
    tripId: string;
    tripName: string;
    coverImageUrl?: string;
    onCoverImageUrlChange: (url: string | null) => void;
    disabled?: boolean;
  }) => (
    <div>
      <span data-testid="cover-url">{coverImageUrl ?? ""}</span>
      <button onClick={() => onCoverImageUrlChange("https://example.com/new.jpg")}>set-cover</button>
      <button onClick={() => onCoverImageUrlChange(null)}>remove-cover</button>
    </div>
  ),
}));
```

Remove these three tests (they test through TripEditCover internals that no longer exist):
- `"renders cover image URL input"` (line 229)
- `"renders cover image preview when coverImageUrl is set"` (line 234)
- `"sets coverImageUrl to undefined when input is cleared"` (line 274)

Add these new tests:
```tsx
it("onSave includes updated coverImageUrl after TripEditCover callback fires", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn();
  render(<TripEditSheet trip={baseTrip} open onClose={vi.fn()} onSave={onSave} />);
  await user.click(screen.getByRole("button", { name: "set-cover" }));
  await user.click(screen.getByRole("button", { name: /save changes/i }));
  expect(onSave).toHaveBeenCalledWith(
    expect.objectContaining({ coverImageUrl: "https://example.com/new.jpg" })
  );
});

it("onSave includes coverImageUrl: null after TripEditCover remove fires", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn();
  const trip = { ...baseTrip, coverImageUrl: "https://example.com/img.jpg" };
  render(<TripEditSheet trip={trip} open onClose={vi.fn()} onSave={onSave} />);
  await user.click(screen.getByRole("button", { name: "remove-cover" }));
  await user.click(screen.getByRole("button", { name: /save changes/i }));
  expect(onSave).toHaveBeenCalledWith(
    expect.objectContaining({ coverImageUrl: null })
  );
});
```

Also: remove the `vi.mock("next/image", ...)` in trip-edit-sheet.test.tsx at line 31 — it was only needed for TripEditCover's old `<Image>` usage.

### Coverage Requirements

`trip-edit-cover.tsx` is in `src/components/packt/**` — ≥95% lines/functions, ≥90% branches enforced. The isPickerOpen boolean creates a branch; test both open and closed states. The `!!coverImageUrl` conditional for Remove button creates a branch; test with and without url.

### Project Structure Notes

- Subcomponents `trip-cover.tsx` and `cover-image-picker.tsx` are already fully implemented — do NOT rewrite them
- `TripEditCover` stays in `src/components/packt/trip-edit-cover.tsx` — same file, redesigned
- Tests stay in `src/components/packt/trip-edit-cover.test.tsx` — colocated, no `__tests__/` dir
- No new server actions, routes, or DB changes required for this story (cover URL is saved via existing `updateTripMetadata` on the Save button)
- The `destinationCenter` coords are intentionally absent from `Trip` (not stored in DB) — `center={undefined}` is the correct value to pass to CoverImagePicker

### Regression Risks

1. **trip-edit-sheet.test.tsx** — three existing tests reference the old URL input and will fail without the mock + test updates
2. **trip-edit-cover.test.tsx** — all existing tests reference the old URL input and will fail without a full rewrite
3. **`UpdateTripPatch` type change** — search for all callers of `updateTripMetadata` or anything that constructs `UpdateTripPatch` to verify `string | null` is handled correctly. Key locations:
   - `src/app/(app)/trips/actions.ts` line 363: `coverImageUrl: patch.coverImageUrl` — Drizzle accepts `null` ✓
   - `src/app/(app)/trips/page-client.tsx` (uses `onSave` → `updateTripMetadata`) — no change needed
   - `src/app/(app)/trips/[tripId]/page-client.tsx` — no change needed
4. **`onCoverImageUrlChange` type** — change from `(url: string | undefined) => void` to `(url: string | null) => void`. The TripEditSheet sets draft via `set("coverImageUrl", url ?? undefined)` which keeps the Trip type clean.

### References

- `TripEditCover` current implementation: [src/components/packt/trip-edit-cover.tsx](src/components/packt/trip-edit-cover.tsx)
- `TripEditCover` tests to rewrite: [src/components/packt/trip-edit-cover.test.tsx](src/components/packt/trip-edit-cover.test.tsx)
- `TripEditSheet` — update TripEditCover call: [src/components/packt/trip-edit-sheet.tsx:173-178](src/components/packt/trip-edit-sheet.tsx#L173-L178)
- `TripEditSheet` — `getPatch()` to update: [src/components/packt/trip-edit-sheet.tsx:117-132](src/components/packt/trip-edit-sheet.tsx#L117-L132)
- `TripEditSheet` tests to update: [src/components/packt/trip-edit-sheet.test.tsx:229-282](src/components/packt/trip-edit-sheet.test.tsx#L229-L282)
- `UpdateTripPatch` type to update: [src/data/types.ts:441-454](src/data/types.ts#L441-L454)
- `CoverImagePicker` (already complete): [src/components/packt/cover-image-picker.tsx](src/components/packt/cover-image-picker.tsx)
- `TripCover` (for thumbnail reuse): [src/components/packt/trip-cover.tsx](src/components/packt/trip-cover.tsx)
- AC source: [_bmad-output/epics-cover-image.md — Story 2.5](_bmad-output/epics-cover-image.md)
- `Section`/`Field` pattern: [src/components/packt/cover-image-picker-custom.tsx](src/components/packt/cover-image-picker-custom.tsx)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Picker `onImageSelected` didn't close the picker: the mock only calls `onImageSelected`, not `onClose`. Fixed by having `TripEditCover` call `setIsPickerOpen(false)` inside the `onImageSelected` wrapper.
- E2E "Remove image" button still visible after save: Next.js router revalidation is asynchronous; fixed by doing `page.reload()` in the Then step to force a fresh server render before asserting.

### Completion Notes List

- `UpdateTripPatch.coverImageUrl` widened to `string | null` so Drizzle can clear the column (null → SET NULL, undefined → skip field).
- `getPatch()` now uses `?? null` to convert `undefined` draft cover to `null` in the patch.
- `TripEditCover` fully redesigned: URL input replaced with `TripCover` thumbnail preview + "Edit cover image" / conditional "Remove image" buttons + inline `CoverImagePicker` dialog.
- `TripEditSheet` passes `tripId`, `destinationName`, `destinationCountry` to `TripEditCover`; handler converts `null → undefined` to keep `Trip.coverImageUrl` typed as `string | undefined`.
- `trip-edit-cover.test.tsx` fully rewritten — 9 tests, all green; mocks `TripCover` and `CoverImagePicker`.
- `trip-edit-sheet.test.tsx` updated: `next/image` mock removed, `TripEditCover` mock added, 3 old URL-input tests removed, 2 new patch-propagation tests added.
- E2E: `E2E_TRIP` seeded with `coverImageUrl`; `@reseed-cover-image` Before hook restores it before each run; `page.reload()` in Then step ensures fresh server data before assertion.
- All validators green: Lint ✓ TSC ✓ Coverage ✓ (96.98% lines, 95.61% funcs, 90.24% branches) E2E 70/70 ✓ Build ✓

### File List

- `src/data/types.ts`
- `src/components/packt/trip-edit-cover.tsx`
- `src/components/packt/trip-edit-cover.test.tsx`
- `src/components/packt/trip-edit-sheet.tsx`
- `src/components/packt/trip-edit-sheet.test.tsx`
- `tests/e2e/e2e-seed-data.ts`
- `tests/e2e/features/trip-cover-edit.feature`
- `tests/e2e/steps/trip-cover-edit.steps.ts`
