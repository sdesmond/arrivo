---
story_id: "2.2"
story_key: "2-2-render-document-content-in-the-viewer"
epic: 2
story: 2
title: "Render Document Content in the Viewer"
status: "done"
created: "2026-05-20"
---

# Story 2.2 — Render Document Content in the Viewer

## Story

As a **traveler**,
I want the viewer to display my document correctly whether it's an image or a PDF,
so that I can actually read and present the content without downloading it separately.

## Acceptance Criteria

**AC1 — Image rendering:**
Given the open document has `kind: "image"`,
When the viewer renders,
Then an `<img>` element is displayed with `src={doc.url}` and `alt={doc.name}`; the image fits within the viewer with `object-fit: contain` and does not overflow (FR7, NFR6)

**AC2 — PDF rendering (non-mobile-Safari):**
Given the open document has `kind: "pdf"` and the user is NOT on mobile Safari,
When the viewer renders,
Then an `<iframe>` is displayed with `src={doc.url}` and `title={doc.name}` (FR7)

**AC3 — PDF rendering (mobile Safari):**
Given the open document has `kind: "pdf"` and the user IS on mobile Safari (which cannot embed PDFs in iframes),
When the viewer renders,
Then a fallback `<a href={doc.url} target="_blank">Open PDF</a>` link is shown instead of the iframe (FR7)

**AC4 — Doc/unknown kind rendering:**
Given the open document has `kind: "doc"` or any unrecognised kind,
When the viewer renders,
Then a `<a href={doc.url} download={doc.name}>Download</a>` link is shown (FR7)

**AC5 — Component conventions:**
Given the `DocViewer` component is updated,
When inspected,
Then it declares `"use client"` at the top; defines a `DocViewerProps` interface; uses only CSS custom properties for colors (NFR1, NFR2)

**AC6 — Test coverage:**
Given the story implementation is complete,
When tests are run,
Then unit tests for image, PDF, mobile-Safari-fallback, and doc rendering branches pass with ≥95% line coverage (NFR9)

---

## Dev Notes

### Current State (end of Story 2.1)

**`src/components/packt/doc-viewer.tsx`** — 129 lines — the primary file to modify

The component structure is complete from Story 2.1 with one placeholder at the bottom of `<BaseUIDialog.Popup>`:

```tsx
{/* Content area — populated in Story 2.2 */}
<div style={{ flex: 1, overflow: "auto" }} />
```

This empty div is the **only thing being replaced** in Story 2.2. The header, dialog wiring, popup styling, and all focus management are untouched.

Current imports in `doc-viewer.tsx`:
```tsx
import { Dialog as BaseUIDialog } from "@base-ui/react/dialog";
import { Dialog, DialogPortal, DialogOverlay, DialogClose } from "@/components/ui/dialog";
import { useIsMobile } from "@/lib/use-is-mobile";
import { X, Share2 } from "lucide-react";
import type { Document } from "@/data/types";
```

No `useState` or `useEffect` imported — Story 2.2 adds both.

**`src/components/packt/doc-viewer.test.tsx`** — 120 lines, 9 tests from Story 2.1

Existing mock setup (DO NOT modify these):
- `vi.mock("@/lib/use-is-mobile")` — auto-spied, `beforeEach` sets `mockReturnValue(false)`
- `vi.mock("@base-ui/react/dialog")` — `Dialog.Popup` renders as `<div data-testid="doc-viewer-popup">`
- `vi.mock("@/components/ui/dialog")` — `Dialog`, `DialogPortal`, `DialogOverlay`, `DialogClose` mocked

Story 2.2 extends the test file with 4 additional tests covering content rendering branches.

**`Document` type** (`src/data/types.ts` line 172):
```ts
export interface Document {
  id: string;
  name: string;
  kind: DocKind;             // "pdf" | "image" | "doc" | "link"
  size?: string;
  scope: "trip" | "event";
  offline: boolean;
  url?: string;              // ← optional — undefined only for un-uploaded stubs
  previewLines?: DocPreviewLine[];
  addedAt?: string;
}
```

`doc.url` is typed as `string | undefined`. In practice every uploaded document has a URL. React's `<img src>`, `<iframe src>`, and `<a href>` all accept `string | undefined`, so no TypeScript error — just pass `doc.url` directly per the ACs.

**`DocKind` const** (`src/data/types.ts` line 42):
```ts
export const DocKind = {
  PDF: "pdf",
  Image: "image",
  Doc: "doc",
  Link: "link",
} as const;
export type DocKind = (typeof DocKind)[keyof typeof DocKind];
```

The four values are `"pdf"`, `"image"`, `"doc"`, `"link"`. The "doc/unknown" AC applies to both `"doc"` AND `"link"` (both get the Download link). Condition: `doc.kind !== "image" && doc.kind !== "pdf"`.

---

### Task 1: Update `src/components/packt/doc-viewer.tsx`

**Step 1 — Add React hooks import:**
```tsx
import { useState, useEffect } from "react";
```
Insert as the first import line (before the `@base-ui` import), since it's a core React import.

**Step 2 — Add `isMobileSafari` state inside the component function** (after the existing `isMobile` line):
```tsx
const [isMobileSafari, setIsMobileSafari] = useState(false);
useEffect(() => {
  const ua = navigator.userAgent;
  setIsMobileSafari(
    /iPhone|iPad|iPod/i.test(ua) &&
    /Safari/i.test(ua) &&
    !/CriOS|FxiOS|OPiOS|mercury/i.test(ua)
  );
}, []);
```

**Why `useState(false)` + `useEffect`?** Same pattern as `useIsMobile` — `navigator` is not available on the server, so initializing to `false` prevents hydration mismatches. The effect runs immediately after first mount and updates to the correct value before the user can interact with content. This is the established project pattern.

**Why exclude CriOS/FxiOS/OPiOS?** Chrome iOS, Firefox iOS, and Opera iOS all use WebKit and have "Safari" in their UA, but they support PDF embeds via their own fallback mechanisms. Only pure Mobile Safari cannot embed PDFs.

**Step 3 — Replace the empty content div** with the four-branch renderer:

Find and replace this exact block:
```tsx
          {/* Content area — populated in Story 2.2 */}
          <div style={{ flex: 1, overflow: "auto" }} />
```

Replace with:
```tsx
          <div style={{ flex: 1, overflow: "auto", position: "relative" }}>
            {doc.kind === "image" && (
              <img
                src={doc.url}
                alt={doc.name}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  display: "block",
                }}
              />
            )}
            {doc.kind === "pdf" && !isMobileSafari && (
              <iframe
                src={doc.url}
                title={doc.name}
                style={{ width: "100%", height: "100%", border: "none", display: "block" }}
              />
            )}
            {doc.kind === "pdf" && isMobileSafari && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                }}
              >
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    color: "var(--accent-brand)",
                    fontFamily: "var(--font-body, ui-sans-serif)",
                    padding: "12px 24px",
                  }}
                >
                  Open PDF
                </a>
              </div>
            )}
            {doc.kind !== "image" && doc.kind !== "pdf" && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                }}
              >
                <a
                  href={doc.url}
                  download={doc.name}
                  style={{
                    color: "var(--accent-brand)",
                    fontFamily: "var(--font-body, ui-sans-serif)",
                    padding: "12px 24px",
                  }}
                >
                  Download
                </a>
              </div>
            )}
          </div>
```

**Styling rationale:**
- `position: "relative"` on the container allows the img/iframe to fill correctly with `height: "100%"`
- `display: "block"` on img/iframe removes inline baseline gap
- `objectFit: "contain"` shows the full image without cropping (AC1)
- `border: "none"` on iframe removes browser default border (aesthetic, not in ACs but expected)
- Link styling: `var(--accent-brand)` for color (NFR2), `var(--font-body, ui-sans-serif)` for font consistency

---

### Task 2: Update `src/components/packt/doc-viewer.test.tsx`

Add 4 new tests to the existing `describe("DocViewer")` block. Add them after the existing mobile-style test (the last test).

**First**, add `waitFor` to the testing-library import. The current import is:
```ts
import { render, screen } from "@testing-library/react";
```
Change to:
```ts
import { render, screen, waitFor } from "@testing-library/react";
```

**Then add the 4 new tests:**

```tsx
it("renders an img for kind image", () => {
  render(
    <DocViewer
      doc={makeDoc({ kind: "image", url: "https://example.com/photo.jpg" })}
      open={true}
      onClose={vi.fn()}
    />
  );
  const img = screen.getByRole("img", { name: "Boarding Pass.pdf" });
  expect(img).toHaveAttribute("src", "https://example.com/photo.jpg");
  expect(img).toHaveStyle({ objectFit: "contain" });
});

it("renders an iframe for kind pdf on non-mobile-Safari", () => {
  render(
    <DocViewer
      doc={makeDoc({ kind: "pdf", url: "https://example.com/doc.pdf" })}
      open={true}
      onClose={vi.fn()}
    />
  );
  const iframe = document.querySelector("iframe");
  expect(iframe).toBeInTheDocument();
  expect(iframe).toHaveAttribute("src", "https://example.com/doc.pdf");
  expect(iframe).toHaveAttribute("title", "Boarding Pass.pdf");
});

it("renders an Open PDF link for kind pdf on mobile Safari", async () => {
  Object.defineProperty(navigator, "userAgent", {
    value:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    configurable: true,
  });
  render(
    <DocViewer
      doc={makeDoc({ kind: "pdf", url: "https://example.com/doc.pdf" })}
      open={true}
      onClose={vi.fn()}
    />
  );
  await waitFor(() => {
    expect(screen.getByRole("link", { name: "Open PDF" })).toHaveAttribute(
      "href",
      "https://example.com/doc.pdf"
    );
  });
  // Restore default UA so other tests are not affected
  Object.defineProperty(navigator, "userAgent", {
    value: "Mozilla/5.0 (linux) AppleWebKit/537.36",
    configurable: true,
  });
});

it("renders a Download link for kind doc", () => {
  render(
    <DocViewer
      doc={makeDoc({ kind: "doc", url: "https://example.com/file.docx", name: "Itinerary.docx" })}
      open={true}
      onClose={vi.fn()}
    />
  );
  const link = screen.getByRole("link", { name: "Download" });
  expect(link).toHaveAttribute("href", "https://example.com/file.docx");
  expect(link).toHaveAttribute("download", "Itinerary.docx");
});
```

**Gotcha — `iframe` has no ARIA role in jsdom:** `document.querySelector("iframe")` is the correct way to find an iframe in tests — `screen.getByRole("...")` won't work because iframes don't have an implicit ARIA role. This is the established pattern for iframe testing.

**Gotcha — mobile Safari UA state update requires `waitFor`:** `isMobileSafari` is set in a `useEffect`. While testing-library wraps renders in `act()` so most effects flush synchronously, using `waitFor()` is the safe approach for effects that set state based on environment APIs (`navigator.userAgent`). The `waitFor` also makes intent clearer.

**Gotcha — UA property must be `configurable: true`:** jsdom defines `navigator.userAgent` as read-only by default, but `configurable: true` allows us to override it. The restore step at the end of the test is important to prevent bleed-through to other tests.

**Gotcha — no need to mock `isMobileSafari` externally:** The UA override approach tests the actual detection logic, not a mock. This gives higher confidence than mocking a function.

---

### Architecture & Conventions Compliance

| Rule | How Story 2.2 Complies |
|------|------------------------|
| `"use client"` at top | Already in place from Story 2.1; not removed |
| Explicit Props interface | `DocViewerProps` already defined; no change |
| No hardcoded hex/rgb | Link colors via `var(--accent-brand)`, font via `var(--font-body, ui-sans-serif)` |
| `url?: string` is optional | Passed directly to `src`/`href` — React types accept `undefined` for these |
| Image alt text | `alt={doc.name}` (NFR6) |
| iframe title | `title={doc.name}` for accessibility |
| No new files | Both files already exist — UPDATE only |
| No new E2E scenarios | Content rendering is UI-layer logic fully covered by unit tests; viewer open/close E2E was added in Story 2.1 |

---

### File Changes Summary

| File | Change |
|------|--------|
| `src/components/packt/doc-viewer.tsx` | Add `useState`/`useEffect` imports; add `isMobileSafari` state; replace empty body div with 4-branch content renderer |
| `src/components/packt/doc-viewer.test.tsx` | Add `waitFor` to RTL import; add 4 new tests (image, pdf, pdf-mobile-safari, doc/download) |

**Files NOT touched:**
- `src/components/packt/doc-row.tsx` — no changes needed
- `src/components/packt/doc-row.test.tsx` — no changes needed
- `src/data/types.ts` — `Document` and `DocKind` types are complete
- `src/lib/utils.ts` — `shareDoc()` utility comes in Story 2.3
- E2E files — Story 2.1 E2E covers viewer open/close; no new flow to test

---

## Tasks / Subtasks

- [ ] Task 1: Update `src/components/packt/doc-viewer.tsx`
  - [ ] Add `import { useState, useEffect } from "react"` as first import
  - [ ] Add `isMobileSafari` state initialized to `false` (after `isMobile` line)
  - [ ] Add `useEffect` that reads `navigator.userAgent` and sets `isMobileSafari`
  - [ ] Replace empty body div with 4-branch content renderer
  - [ ] Verify `var(--accent-brand)` and `var(--font-body, ui-sans-serif)` used for link styling (NFR2)
- [ ] Task 2: Update `src/components/packt/doc-viewer.test.tsx`
  - [ ] Add `waitFor` to the `@testing-library/react` import
  - [ ] Add test: image kind → `<img>` with correct `src` and `alt`, `objectFit: "contain"`
  - [ ] Add test: pdf kind (non-mobile-Safari) → `<iframe>` with correct `src` and `title`
  - [ ] Add test: pdf kind (mobile Safari UA) → `<a>Open PDF</a>` with correct `href`; restore UA after test
  - [ ] Add test: doc kind → `<a>Download</a>` with correct `href` and `download` attribute
- [ ] Task 3: Run full validation
  - [ ] `npm run test:coverage` — verify ≥95% line/function, ≥90% branch coverage
  - [ ] `npm run build` (via build-validator) — ensure no TypeScript errors

### Review Findings (2026-05-21)

_Implementation landed in the same diff as Story 2.1 — full review context lives in `2-1-open-document-in-the-in-app-viewer.md`. These are the 2.2-specific items._

- [x] [Review][Decision→Patch] **D3: `doc.kind === "link"` falls into the Download branch** — Resolved: remove `DocKind.Link` entirely. `inferDocKind()` already only emits `pdf|image|doc`; no real upload path produces `"link"`. Spawns new patch P16 (remove enum value + add-doc-dialog Link button/URL field + badge entry + tests).
- [x] [Review][Patch] **P1+P13: `isMobileSafari` uses lazy `useState` initializer** — Fixed: switched to `useState(false) + useEffect` per spec 2.2 §Task 1 Step 2. Added `useEffect` import.
- [x] [Review][Patch] **P2: `doc.url` rendered unguarded into `src`/`href`** — Fixed: added `safeHttpUrl()` helper that returns `undefined` for falsy/unsafe values, and an "Document is not available" fallback panel when no safe URL exists.
- [x] [Review][Patch] **P3: `isMobileSafari` misdetects iPad on iPadOS 13+** — Fixed: detection now includes `navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform)`.
- [x] [Review][Patch] **P6: UA spoof test mutates `navigator.userAgent` without `try/finally`** — Fixed: wrapped UA override + render in `try/finally`, captures `ORIGINAL_UA` before mutation and restores in `finally`.
- [x] [Review][Patch] **P9: `doc.url` not validated for safe schemes (javascript:, data:text/html)** — Fixed: `safeHttpUrl()` only returns the URL when protocol is `http:`/`https:` or path-relative.
- [x] [Review][Patch] **P16: Removed `DocKind.Link` entirely** — `Link` removed from `DocKind` enum, AddDocDialog's Link button + URL field gone, badge map entry removed, all Link-related tests removed/updated. `inferDocKind()` was already only producing `pdf|image|doc`, so no production data path was affected.
- [x] [Review][Defer] **PDF on Android Chrome/Firefox — no fallback** — Only mobile Safari is special-cased; other mobile browsers may not render PDFs inline either. Out of spec scope. — deferred, separate UA work
- [x] [Review][Defer] **iOS safe-area inset not applied to full-screen mobile popup** — Close button can hide behind notch/home indicator. UX polish; not in AC. — deferred, polish
- [x] [Review][Defer] **`isMobileSafari` regex misses other iOS browsers (EdgiOS, DuckDuckGo, Brave)** — Spec only listed CriOS/FxiOS/OPiOS/mercury. — deferred, scope

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List
