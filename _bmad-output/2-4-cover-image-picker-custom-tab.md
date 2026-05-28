# Story 2.4: CoverImagePicker — Custom Tab

Status: done

## Story

As a traveler,
I want to design a custom color and icon cover for my trip,
so that trips without a destination photo still have a polished, personalised cover.

## Acceptance Criteria

1. **Given** the Custom tab is active, **then** it shows a row of two `<select>` controls (Background color on the left, Icon on the right), a live preview card below the row, and an Apply button below the preview

2. **Given** the Background color select, **then** it contains one `<option>` per entry in `GRAPHIC_COVER_COLORS` (10 options); each option displays a human-readable label (e.g., "Brand", "Indigo", "Pink"); the select is associated with a visible `<label>` via `htmlFor`

3. **Given** the Icon select, **then** it contains one `<option>` per entry in `GRAPHIC_COVER_ICONS` (19 options); each option displays the icon name in title case (e.g., "Tent Tree", "Map Pin"); the select is associated with a visible `<label>` via `htmlFor`

4. **Given** I change either select, **then** the preview card updates immediately (on `onChange`) — no Apply click required — showing the current color as the card background and the current icon centered inside it

5. **Given** I click Apply, **then** the combination is encoded as `graphic:{color}/{icon}` and `onImageSelected("graphic:{color}/{icon}")` is called, followed by `onClose()`

6. **Given** the tab mounts, **then** the first color (`GRAPHIC_COVER_COLORS[0]`) and first icon (`GRAPHIC_COVER_ICONS[0]`) are pre-selected so an Apply-able state always exists

7. **Given** `cover-image-picker.test.tsx`, **then** the existing placeholder assertion for Custom tab (`"Custom tab content"`) is updated to verify the real Custom tab content (e.g., presence of the Background color label or color select)

8. **Given** `src/components/packt/cover-image-picker-custom.test.tsx` (new file), **then** tests cover: color select renders correct number of options; icon select renders correct number of options; preview is present; changing color select updates preview background; changing icon select updates preview icon; Apply emits the correct `graphic:` URL and calls `onClose`

## Tasks / Subtasks

- [x] Create `src/components/packt/cover-image-picker-custom.tsx` (AC: 1, 2, 3, 4, 5, 6)
  - [x] Define `CoverImagePickerCustomProps` interface with `onImageSelected` and `onClose`
  - [x] Initialize state: `selectedColor = GRAPHIC_COVER_COLORS[0]`, `selectedIcon = GRAPHIC_COVER_ICONS[0]`
  - [x] Render a row with two `<select>` controls: color select (left) from `GRAPHIC_COVER_COLORS` with human-readable labels via `COLOR_LABELS` map, icon select (right) from `GRAPHIC_COVER_ICONS` with title-cased labels via `toIconLabel`; each select paired with a `<label htmlFor>`
  - [x] Render preview card below the row: `background: selectedColor` inline style, selected icon centered via dynamic Lucide lookup (`strokeWidth={1.5}`), updates on every `onChange` (no Apply needed)
  - [x] Apply button calls `onImageSelected(\`graphic:${selectedColor}/${selectedIcon}\`)` then `onClose()`

- [x] Update `src/components/packt/cover-image-picker.tsx` (AC: 1)
  - [x] Import `CoverImagePickerCustom` from `./cover-image-picker-custom`
  - [x] Replace `<div>Custom tab content</div>` placeholder with `<CoverImagePickerCustom onImageSelected={onImageSelected} onClose={onClose} />`

- [x] Create `src/components/packt/cover-image-picker-custom.test.tsx` (AC: 8)
  - [x] Verify color select renders `GRAPHIC_COVER_COLORS.length` options
  - [x] Verify icon select renders `GRAPHIC_COVER_ICONS.length` options
  - [x] Verify preview card is present in DOM
  - [x] Verify changing color select updates preview background immediately (without clicking Apply)
  - [x] Verify changing icon select updates preview icon immediately (without clicking Apply)
  - [x] Verify Apply calls `onImageSelected` with correct `graphic:{color}/{icon}` string and calls `onClose`

- [x] Update `src/components/packt/cover-image-picker.test.tsx` (AC: 7)
  - [x] Replace assertion `expect(screen.getByText("Custom tab content")).toBeInTheDocument()` with `expect(screen.getByLabelText(/background color/i)).toBeInTheDocument()`

### Review Findings

- [x] [Review][Defer] Lucide mock: static explicit list vs Proxy pattern [src/components/packt/cover-image-picker-custom.test.tsx] — deferred; Vitest 4.x validates named exports from mock factories, making `new Proxy({}, {get:...})` incompatible; static list is the only supported approach
- [x] [Review][Patch] `cn()` used with single static string on preview div — removed `cn()` wrapper, now uses plain className string [src/components/packt/cover-image-picker-custom.tsx]
- [x] [Review][Patch] Preview uses `minHeight: 120` instead of fixed `height: 120` — fixed to `height: 120` per spec [src/components/packt/cover-image-picker-custom.tsx]
- [x] [Review][Defer] `import * as LucideIcons` imports entire icon bundle [src/components/packt/cover-image-picker-custom.tsx] — deferred, pre-existing; spec explicitly mandates this pattern ("do NOT import icons individually")

- [x] [Review][Patch] `handleApply` not wrapped in try/finally — `onClose` is skipped if `onImageSelected` throws [src/components/packt/cover-image-picker-custom.tsx:63-66]
- [x] [Review][Patch] Mock `FakeIcon` spreads unknown HTML props (`size`, `strokeWidth`) onto `<span>` causing React DOM warnings [src/components/packt/cover-image-picker-custom.test.tsx:10]

## Dev Notes

### Files to Create

| File | Action |
|------|--------|
| `src/components/packt/cover-image-picker-custom.tsx` | NEW — the Custom tab subcomponent |
| `src/components/packt/cover-image-picker-custom.test.tsx` | NEW — unit tests for the custom tab |

### Files to Modify

| File | Change |
|------|--------|
| `src/components/packt/cover-image-picker.tsx:229` | Replace placeholder div with `<CoverImagePickerCustom>` |
| `src/components/packt/cover-image-picker.test.tsx:68` | Update the "Custom tab content" assertion |

### Reuse — Do Not Reinvent

**`GRAPHIC_COVER_COLORS` and `GRAPHIC_COVER_ICONS`** are already exported from `@/lib/utils`:
```ts
import { GRAPHIC_COVER_COLORS, GRAPHIC_COVER_ICONS } from "@/lib/utils";
```
- `GRAPHIC_COVER_COLORS`: 10 CSS custom property strings (e.g., `"var(--accent-brand)"`, `"var(--color-indigo-500)"`)
- `GRAPHIC_COVER_ICONS`: 19 kebab-case icon name strings (e.g., `"plane"`, `"map"`, `"tent-tree"`)

**Dynamic Lucide icon lookup** — `TripCover` (`src/components/packt/trip-cover.tsx:10–13`) already shows the established pattern for rendering icons by name:
```ts
import * as LucideIcons from "lucide-react";
const graphicIconLookup = LucideIcons as unknown as Record<
  string,
  React.ComponentType<{ size?: number; strokeWidth?: number; style?: React.CSSProperties }>
>;

function toGraphicIconKey(iconName: string): string {
  return iconName
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}
// Usage: graphicIconLookup[toGraphicIconKey("tent-tree")] → TentTree component
```
Copy this exact approach in the custom tab — do NOT import icons individually.

**Subcomponent pattern** — follow the same file/export pattern as `cover-image-picker-upload.tsx` and `cover-image-picker-url.tsx`:
- `"use client"` at top
- Named `CoverImagePickerCustomProps` interface before function
- Named export `CoverImagePickerCustom`
- Props destructured in function signature

### Color and Icon Labels

Define a `COLOR_LABELS` map keyed by the CSS var string, valued by a short human-readable name:
```ts
const COLOR_LABELS: Record<string, string> = {
  "var(--accent-brand)": "Brand",
  "var(--color-indigo-500)": "Indigo",
  "var(--color-pink-500)": "Pink",
  "var(--color-teal-500)": "Teal",
  "var(--color-amber-500)": "Amber",
  "var(--color-red-500)": "Red",
  "var(--color-emerald-500)": "Emerald",
  "var(--color-slate-500)": "Slate",
  "var(--color-violet-500)": "Violet",
  "var(--color-orange-500)": "Orange",
};
```

Define a `toIconLabel` helper that converts kebab-case to title case:
```ts
function toIconLabel(iconName: string): string {
  return iconName.split("-").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}
// "tent-tree" → "Tent Tree", "map-pin" → "Map Pin"
```

### Styling Constraints

- **Colors always via CSS custom properties** — `GRAPHIC_COVER_COLORS` values are already CSS var strings; use them directly as `style={{ background: selectedColor }}` on the preview card
- **No hardcoded hex/rgb** — never
- **No arbitrary Tailwind values** — use inline `style` for dynamic/theme-aware values; Tailwind for static layout
- **Lucide icons**: `strokeWidth={1.5}` always; the preview icon is decorative — no `title` needed on it
- **Font variable fallbacks**: `var(--font-body, ui-sans-serif)`
- **`cn()` from `@/lib/utils`** for className merging (not string concatenation)
- **`<select>` styling**: use inline `style` matching the URL tab's `<input>` style (`border: 1px solid var(--line)`, `borderRadius: 6`, `padding: 8px 12px`, `background: var(--surface)`, `color: var(--fg)`)

### Preview Card

Render a fixed-height card (`~120px tall`, full width) below the select row:
- `background: selectedColor` as inline style
- Selected icon centered via dynamic Lucide lookup (`strokeWidth={1.5}`, `style={{ color: "white" }}` for contrast)
- Updates on every select `onChange` — the preview is purely derived from `selectedColor`/`selectedIcon` state, no user action required beyond changing a select
- Add `data-testid="cover-preview"` for reliable test querying

### Current Placeholder to Replace

In `cover-image-picker.tsx`, line 229:
```tsx
<TabsContent value="custom">
  <div>Custom tab content</div>
</TabsContent>
```
Replace the inner div with `<CoverImagePickerCustom onImageSelected={onImageSelected} onClose={onClose} />` and add the import at the top.

### Test Guidance

**`cover-image-picker-custom.test.tsx`**:
- Add `// @vitest-environment jsdom` at top
- No need to mock `next/navigation` or `next/headers` (global mocks in `vitest.setup.mts` handle it)
- Mock Lucide with a simple stub to avoid heavy import overhead:
  ```ts
  vi.mock("lucide-react", () => new Proxy({}, {
    get: (_target, prop: string) => {
      const FakeIcon = ({ title, ...rest }: { title?: string; [k: string]: unknown }) =>
        <span data-testid={`icon-${String(prop)}`} title={title} {...rest} />;
      FakeIcon.displayName = String(prop);
      return FakeIcon;
    }
  }));
  ```
  This lets you query by `data-testid` or `title` in tests without the full Lucide bundle.
- Verify Apply button emits the correct `graphic:` string using `vi.fn()` for `onImageSelected`.
- Verify check overlay: after initial render, `getByTestId` or `getByRole("img")` on the first swatch should show a check indicator; after clicking a different swatch, it should move.

**`cover-image-picker.test.tsx` update** (line 68 area):
```ts
// Before:
expect(screen.getByText("Custom tab content")).toBeInTheDocument();
// After — verify real content; swatch count is a reliable signal:
expect(screen.getAllByRole("button", { name: /Apply/i })[0]).toBeInTheDocument();
// OR: expect(screen.getAllByTitle(/plane|map|compass/i).length).toBeGreaterThan(0);
```
Pick the simplest assertion that proves the real tab loaded without duplicating `cover-image-picker-custom.test.tsx` coverage.

### Coverage Requirements

- Unit tests in `cover-image-picker-custom.test.tsx` must maintain ≥95% lines/functions, ≥90% branches
- The file is in `src/components/packt/**` so it IS in coverage scope
- `src/components/ui/**` is excluded — do not put logic there

### Project Structure Notes

- Subcomponent files: `src/components/packt/cover-image-picker-custom.tsx` and `.test.tsx` — colocated, no separate `__tests__/` directory
- Import path in `cover-image-picker.tsx`: `import { CoverImagePickerCustom } from "./cover-image-picker-custom"`
- No new routes, server actions, or DB changes required for this story

### References

- GRAPHIC_COVER_COLORS / GRAPHIC_COVER_ICONS constants: [src/lib/utils.ts:119–152](src/lib/utils.ts#L119-L152)
- Lucide dynamic icon lookup pattern: [src/components/packt/trip-cover.tsx:10–38](src/components/packt/trip-cover.tsx#L10-L38)
- parseGraphicCover utility: [src/lib/utils.ts:105–117](src/lib/utils.ts#L105-L117)
- Upload tab subcomponent (pattern to follow): [src/components/packt/cover-image-picker-upload.tsx](src/components/packt/cover-image-picker-upload.tsx)
- URL tab subcomponent (pattern to follow): [src/components/packt/cover-image-picker-url.tsx](src/components/packt/cover-image-picker-url.tsx)
- Placeholder to replace: [src/components/packt/cover-image-picker.tsx:228–230](src/components/packt/cover-image-picker.tsx#L228-L230)
- Existing test needing update: [src/components/packt/cover-image-picker.test.tsx:68](src/components/packt/cover-image-picker.test.tsx#L68)
- AC source: [_bmad-output/epics-cover-image.md — Story 2.4](\_bmad-output/epics-cover-image.md)

## Dev Agent Record

### Agent Model Used

gpt-5 (Codex)

### Debug Log References

- `npx vitest run src/components/packt/cover-image-picker-custom.test.tsx src/components/packt/cover-image-picker.test.tsx`
- `npm run lint 2>&1`
- `npx tsc --noEmit 2>&1`
- `npm run test:coverage 2>&1`
- `npm run test:e2e 2>&1`
- `npm run build 2>&1`

### Completion Notes List

- Added `CoverImagePickerCustom` with preselected color and icon state, visible labels, styled `<select>` controls, a live preview card, and `graphic:{color}/{icon}` Apply behavior.
- Replaced the Custom tab placeholder in `cover-image-picker.tsx` with the new subcomponent so the picker renders real controls in the dialog.
- Added a colocated custom-tab test suite covering option counts, preview rendering, live preview updates, and Apply callback behavior, and updated the parent picker test to assert the real tab content.
- Full validation passed: lint, TypeScript, Vitest coverage (95.42% statements, 90.12% branches, 95.8% functions, 97.05% lines), Playwright E2E (69 passed), and production build.

### File List

- src/components/packt/cover-image-picker-custom.tsx
- src/components/packt/cover-image-picker-custom.test.tsx
- src/components/packt/cover-image-picker.tsx
- src/components/packt/cover-image-picker.test.tsx
- _bmad-output/2-4-cover-image-picker-custom-tab.md
- _bmad-output/sprint-status.yaml

### Change Log

- 2026-05-28: Implemented the CoverImagePicker Custom tab UI, added colocated tests, wired the tab into the picker, and validated the full app suite.
