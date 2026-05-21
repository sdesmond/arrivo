---
story_id: "2.1"
story_key: "2-1-open-document-in-the-in-app-viewer"
epic: 2
story: 1
title: "Open Document in the In-App Viewer"
status: "done"
created: "2026-05-20"
---

# Story 2.1 — Open Document in the In-App Viewer

## User Story

As a **traveler**,
I want to tap a document to open it in a full-screen viewer without leaving the app,
So that I can present my boarding pass or ticket at a checkpoint without switching apps.

## Acceptance Criteria

**Given** I am on the Documents tab
**When** I tap the "View" button on a document row
**Then** the `DocViewer` component opens with that document; on mobile it is full-screen; on desktop it is a reasonably sized centered modal — not edge-to-edge on desktop (FR6, UX-DR3)

**Given** the viewer opens
**When** focus is managed
**Then** focus moves to the viewer's first interactive element (close button) on open; focus is trapped inside the viewer while it is open; pressing Escape closes the viewer and returns focus to the triggering row button (NFR7)

**Given** the viewer header renders
**When** I view it
**Then** it shows the document name, a share button, and a close button (UX-DR4)

**Given** the "View" button in a `DocRow` is icon-only
**When** it renders
**Then** it has `title="View [doc name]"` and `aria-label="View [doc name]"` (NFR3); tap target is minimum 44×44px (NFR8)

**Given** the viewer is open
**When** I tap the close button or press Escape
**Then** the viewer closes and focus returns to the "View" button that triggered it (NFR7)

**Given** the story implementation is complete
**When** tests are run
**Then** unit tests for `DocViewer` open/close and focus management pass with ≥95% line coverage (NFR9); a Playwright BDD scenario covering document viewing exists in `tests/e2e/features/documents.feature` and passes (NFR10)

---

## Dev Notes

### Current State (end of Story 1.5)

All stories 1.1–1.5 are complete. The relevant files now:

**`src/components/packt/doc-row.tsx`** — 193 lines

Current layout per row:
```
[DocKindBadge] [offline dot/tooltip] [name span or rename input] [Trash2 delete button] [confirm Dialog]
```

Current state:
- Imports: `useRef, useState, useTransition` | `Trash2, Download` | `DocKindBadge` | `Document` | `removeDocument, renameDocument` | Dialog components | `Button` | `Tooltip` components
- Has `isPending`, `confirmOpen`, `error`, `inFlightRef`, `isEditing`, `editName`, `displayName`, `cancelRef` state/refs
- **Does not yet have a View button or DocViewer**

**`src/components/packt/doc-row.test.tsx`** — 262 lines, 24 tests

Has mocks for: `@/app/(app)/trips/[tripId]/actions`, `@/components/ui/tooltip`, `@/components/ui/dialog`

`makeDoc` factory:
```ts
const makeDoc = (overrides: Partial<Document> = {}): Document => ({
  id: "doc-1",
  name: "Boarding Pass.pdf",
  kind: "pdf",
  scope: "trip",
  offline: false,
  ...overrides,
});
```

**`tests/e2e/features/documents.feature`** — 4 scenarios (Search, Delete, Upload, Rename)
**`tests/e2e/steps/documents.steps.ts`** — step defs for all 4 scenarios

**Dialog component: `src/components/ui/dialog.tsx`** — key facts:
- Uses `@base-ui/react/dialog` under the hood (`import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"`)
- `Dialog` wrapper = `DialogPrimitive.Root` — provides context for all children
- `DialogPortal` = `DialogPrimitive.Portal`
- `DialogOverlay` = `DialogPrimitive.Backdrop` (has backdrop blur styling already)
- `DialogClose` = `DialogPrimitive.Close` — when clicked, calls `onOpenChange(false)` AND returns focus to whatever element was focused before the dialog opened (ARIA behavior)
- `DialogContent` uses bottom-sheet layout on mobile (`inset-x-0 bottom-0 rounded-t-xl`) — **NOT suitable for DocViewer** which needs true full-screen on mobile

**`useIsMobile` hook: `src/lib/use-is-mobile.ts`**
- Returns `true` when viewport `max-width: 639px`, `false` otherwise
- Uses `useEffect` + `matchMedia` — hydration-safe (starts as `false`, updates after mount)

---

### Architecture for DocViewer

`DocViewer` needs CUSTOM popup sizing:
- Mobile: `position: fixed; inset: 0` (true full-screen — different from DialogContent's bottom sheet)
- Desktop: centered modal (`position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%)`) with constrained dimensions (not edge-to-edge)

Because `DialogContent` hardcodes the bottom-sheet layout for mobile (not overrideable via className), `DocViewer` MUST use `@base-ui/react/dialog`'s `Dialog.Popup` directly for the popup container.

**Import pattern for DocViewer:**
```tsx
import { Dialog as BaseUIDialog } from "@base-ui/react/dialog";
import { Dialog, DialogPortal, DialogOverlay, DialogClose } from "@/components/ui/dialog";
```

**Compatibility:** `<Dialog>` (from `@/components/ui/dialog`) wraps `BaseUIDialog.Root`. Since `BaseUIDialog.Popup` consumes the context provided by `BaseUIDialog.Root`, nesting `<BaseUIDialog.Popup>` inside `<Dialog>` works correctly — they share the same Base UI context.

**Focus management — how it works:**
1. `<Dialog onOpenChange={(o) => { if (!o) onClose(); }}>` tracks `open` state
2. Base UI's Dialog.Root tracks `document.activeElement` when `open` transitions to `true`
3. When a `<DialogClose>` is clicked (or Escape pressed), `onOpenChange(false)` fires → viewer closes → Base UI restores focus to the tracked element (the View button that was clicked)
4. `autoFocus` on the close button ensures it gets focus when the popup renders

**Do NOT call `onClose()` directly from the close button's `onClick`** — use `<DialogClose>` instead. `DialogClose` handles both the state change (via Dialog context) AND focus restoration.

---

### Task 1: Add View Button + Viewer State to `doc-row.tsx`

**File:** `src/components/packt/doc-row.tsx`

**Step 1** — Add `Eye` to lucide imports and add `DocViewer` import:
```tsx
import { Trash2, Download, Eye } from "lucide-react";
import { DocViewer } from "./doc-viewer";
```

**Step 2** — Add viewer state inside the component body (add after `cancelRef`):
```tsx
const [viewerOpen, setViewerOpen] = useState(false);
```

**Step 3** — Add the View button and DocViewer to the return JSX.

Current layout: `[DocKindBadge] [offline tooltip] [name/input] [delete button] [Dialog]`

New layout: `[DocKindBadge] [offline tooltip] [name/input] [view button] [delete button] [Dialog] [DocViewer]`

Insert the View button BETWEEN the name/input conditional and the delete button:
```tsx
<button
  onClick={() => setViewerOpen(true)}
  title={`View ${doc.name}`}
  aria-label={`View ${doc.name}`}
  style={{
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 44,
    minHeight: 44,
    background: "transparent",
    border: "none",
    cursor: "pointer",
    color: "var(--fg-3)",
    padding: 0,
  }}
>
  <Eye size={15} strokeWidth={1.5} />
</button>
```

Add `<DocViewer>` AFTER the closing `</Dialog>` tag (the delete confirm dialog), before the closing `</div>`:
```tsx
<DocViewer doc={doc} open={viewerOpen} onClose={() => setViewerOpen(false)} />
```

**Gotcha — `aria-label` uses `doc.name` not `displayName`:** The button's accessible label should always reference the stable document name (`doc.name`), not the locally-tracked `displayName`. If the user has just renamed the doc, the `displayName` may differ from `doc.name` until the server refreshes. Use `doc.name` for ARIA consistency (same pattern as the delete button uses `doc.name`).

---

### Task 2: Create `src/components/packt/doc-viewer.tsx` (NEW FILE)

This is the primary deliverable for Story 2.1. Story 2.2 will add content rendering inside the body div.

```tsx
"use client";

import { Dialog as BaseUIDialog } from "@base-ui/react/dialog";
import { Dialog, DialogPortal, DialogOverlay, DialogClose } from "@/components/ui/dialog";
import { useIsMobile } from "@/lib/use-is-mobile";
import { X, Share2 } from "lucide-react";
import type { Document } from "@/data/types";

export interface DocViewerProps {
  doc: Document;
  open: boolean;
  onClose: () => void;
}

export function DocViewer({ doc, open, onClose }: DocViewerProps) {
  const isMobile = useIsMobile();

  const popupStyle: React.CSSProperties = isMobile
    ? {
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        background: "var(--bg)",
        zIndex: 50,
        outline: "none",
      }
    : {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: "min(90vw, 640px)",
        height: "min(90vh, 800px)",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg)",
        borderRadius: "var(--radius-xl)",
        border: "1px solid var(--line)",
        zIndex: 50,
        overflow: "hidden",
        outline: "none",
      };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogPortal>
        <DialogOverlay />
        <BaseUIDialog.Popup style={popupStyle}>
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "6px 4px 6px 12px",
              borderBottom: "1px solid var(--line)",
              flexShrink: 0,
            }}
          >
            <DialogClose
              render={
                <button
                  autoFocus
                  title="Close viewer"
                  aria-label="Close viewer"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: 44,
                    minHeight: 44,
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--fg-3)",
                    padding: 0,
                    flexShrink: 0,
                  }}
                />
              }
            >
              <X size={15} strokeWidth={1.5} />
            </DialogClose>
            <span
              style={{
                flex: 1,
                fontFamily: "var(--font-body, ui-sans-serif)",
                fontSize: "calc(14px * var(--font-scale, 1))",
                fontWeight: 500,
                color: "var(--fg)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {doc.name}
            </span>
            <button
              title={`Share ${doc.name}`}
              aria-label={`Share ${doc.name}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 44,
                minHeight: 44,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "var(--fg-3)",
                padding: 0,
                flexShrink: 0,
              }}
            >
              <Share2 size={15} strokeWidth={1.5} />
            </button>
          </div>
          {/* Content area — populated in Story 2.2 */}
          <div style={{ flex: 1, overflow: "auto" }} />
        </BaseUIDialog.Popup>
      </DialogPortal>
    </Dialog>
  );
}
```

**Why `DialogClose` with `render=` prop?** Base UI's `Close` component uses a `render` prop to customize the underlying DOM element while keeping Base UI's close behavior. When clicked, `DialogClose` calls `onOpenChange(false)` which flows to our `onClose()`. It also handles focus restoration back to the View button automatically.

**Why `autoFocus` on the close button?** NFR7 requires focus moves to the viewer's first interactive element (the close button) on open. The close button is placed first in DOM order (`[close] [name] [share]`) so it's both the first DOM element and explicitly `autoFocus`ed.

**Why close button FIRST in DOM order?** Placing close on the left (`[X] [title] [share]`) is a common viewer/modal pattern (like iOS share sheet, Google Drive viewer). It puts the close button before share in tab order, satisfying the AC that close button is the "first interactive element."

**Share button has NO onClick handler in Story 2.1.** Story 2.3 implements `shareDoc()` and wires it up. Leave the share button without an `onClick` — it will be a no-op button for now. Do NOT add a placeholder `onClick`, a TODO comment, or stub implementation.

**Do NOT add aria-modal attribute manually** — Base UI's `Dialog.Popup` handles this automatically.

**Gotcha — `font-scale` variable:** Use `var(--font-scale, 1)` with a fallback of `1` (not `var(--font-scale)` alone) — seen in the existing codebase patterns to prevent `calc()` from breaking if the variable is undefined.

---

### Task 3: Update `src/components/packt/doc-row.test.tsx`

**Step 1** — Add DocViewer mock at the TOP of the file (after existing mocks):
```ts
vi.mock("./doc-viewer", () => ({
  DocViewer: ({ open, doc }: { open: boolean; doc: { name: string } }) =>
    open ? <div data-testid="doc-viewer">{doc.name}</div> : null,
}));
```

**Step 2** — Add 3 new tests to the `describe("DocRow")` block:

```ts
it("renders a view button with correct title and aria-label", () => {
  render(<DocRow doc={makeDoc()} />);
  const btn = screen.getByRole("button", { name: "View Boarding Pass.pdf" });
  expect(btn).toHaveAttribute("title", "View Boarding Pass.pdf");
  expect(btn).toHaveAttribute("aria-label", "View Boarding Pass.pdf");
});

it("view button has min 44px touch target", () => {
  render(<DocRow doc={makeDoc()} />);
  const btn = screen.getByRole("button", { name: "View Boarding Pass.pdf" });
  expect(btn).toHaveStyle({ minWidth: "44px", minHeight: "44px" });
});

it("clicking the view button opens the DocViewer", async () => {
  const user = userEvent.setup();
  render(<DocRow doc={makeDoc()} />);
  expect(screen.queryByTestId("doc-viewer")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "View Boarding Pass.pdf" }));
  expect(screen.getByTestId("doc-viewer")).toBeInTheDocument();
});
```

**No change to existing tests** — the existing 24 tests should all still pass. The mock for `DocViewer` prevents it from rendering real content during delete/rename tests.

**Import `DocViewer` not needed in the test file** — the mock replaces the real module; no import required.

---

### Task 4: Create `src/components/packt/doc-viewer.test.tsx` (NEW FILE)

```tsx
// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Document } from "@/data/types";

vi.mock("@/lib/use-is-mobile");

vi.mock("@base-ui/react/dialog", () => ({
  Dialog: {
    Popup: ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
      <div data-testid="doc-viewer-popup" style={style}>
        {children}
      </div>
    ),
  },
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({
    children,
    open,
    onOpenChange,
  }: {
    children: React.ReactNode;
    open: boolean;
    onOpenChange?: (o: boolean) => void;
  }) =>
    open ? (
      <>
        {children}
        <button data-testid="dialog-backdrop-close" onClick={() => onOpenChange?.(false)} />
      </>
    ) : null,
  DialogPortal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogOverlay: () => null,
  DialogClose: ({
    children,
    render: renderProp,
  }: {
    children: React.ReactNode;
    render?: React.ReactElement;
  }) => {
    if (renderProp) {
      return React.cloneElement(renderProp, {}, children);
    }
    return <button>{children}</button>;
  },
}));

import { useIsMobile } from "@/lib/use-is-mobile";
import { DocViewer } from "./doc-viewer";

const makeDoc = (overrides: Partial<Document> = {}): Document => ({
  id: "doc-1",
  name: "Boarding Pass.pdf",
  kind: "pdf",
  scope: "trip",
  offline: false,
  ...overrides,
});

describe("DocViewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useIsMobile).mockReturnValue(false); // desktop by default
  });

  it("does not render when open is false", () => {
    const onClose = vi.fn();
    render(<DocViewer doc={makeDoc()} open={false} onClose={onClose} />);
    expect(screen.queryByTestId("doc-viewer-popup")).not.toBeInTheDocument();
  });

  it("renders the popup when open is true", () => {
    render(<DocViewer doc={makeDoc()} open={true} onClose={vi.fn()} />);
    expect(screen.getByTestId("doc-viewer-popup")).toBeInTheDocument();
  });

  it("shows the document name in the header", () => {
    render(<DocViewer doc={makeDoc({ name: "My Visa.pdf" })} open={true} onClose={vi.fn()} />);
    expect(screen.getByText("My Visa.pdf")).toBeInTheDocument();
  });

  it("close button has correct title and aria-label", () => {
    render(<DocViewer doc={makeDoc()} open={true} onClose={vi.fn()} />);
    const closeBtn = screen.getByRole("button", { name: "Close viewer" });
    expect(closeBtn).toHaveAttribute("title", "Close viewer");
    expect(closeBtn).toHaveAttribute("aria-label", "Close viewer");
  });

  it("close button has min 44px touch target", () => {
    render(<DocViewer doc={makeDoc()} open={true} onClose={vi.fn()} />);
    const closeBtn = screen.getByRole("button", { name: "Close viewer" });
    expect(closeBtn).toHaveStyle({ minWidth: "44px", minHeight: "44px" });
  });

  it("share button has correct title and aria-label", () => {
    render(<DocViewer doc={makeDoc({ name: "boarding-pass.pdf" })} open={true} onClose={vi.fn()} />);
    const shareBtn = screen.getByRole("button", { name: "Share boarding-pass.pdf" });
    expect(shareBtn).toHaveAttribute("title", "Share boarding-pass.pdf");
    expect(shareBtn).toHaveAttribute("aria-label", "Share boarding-pass.pdf");
  });

  it("share button has min 44px touch target", () => {
    render(<DocViewer doc={makeDoc()} open={true} onClose={vi.fn()} />);
    const shareBtn = screen.getByRole("button", { name: "Share Boarding Pass.pdf" });
    expect(shareBtn).toHaveStyle({ minWidth: "44px", minHeight: "44px" });
  });

  it("calls onClose when the backdrop close is triggered", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<DocViewer doc={makeDoc()} open={true} onClose={onClose} />);
    await user.click(screen.getByTestId("dialog-backdrop-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("applies full-screen inset style when on mobile", () => {
    vi.mocked(useIsMobile).mockReturnValueOnce(true);
    render(<DocViewer doc={makeDoc()} open={true} onClose={vi.fn()} />);
    const popup = screen.getByTestId("doc-viewer-popup");
    expect(popup).toHaveStyle({ position: "fixed", inset: "0px" });
  });
});
```

**Gotcha — `useIsMobile` mock structure:** Use `vi.mock("@/lib/use-is-mobile")` (no factory) so the mock is auto-spied, then set the default return in `beforeEach`. This allows per-test overrides with `mockReturnValueOnce`. The `import React from "react"` must appear at the TOP of the file (before `vi.mock` calls) because the `DialogClose` mock factory uses `React.cloneElement`.

**Gotcha — `DialogClose` mock vs click handler:** The real `DialogClose` calls `onOpenChange(false)` when clicked. The mock doesn't replicate this. For testing that `onClose` is called, use the `dialog-backdrop-close` button from the `Dialog` mock (which calls `onOpenChange(false)` → triggers `onClose`). This tests the flow without needing to replicate Base UI internals.

---

### Task 5: E2E Scenario + Step Definitions

**Update `tests/e2e/features/documents.feature`** — Add a new scenario BEFORE the existing ones or at the end of the file (either is fine; below adds it after the existing 4):

```gherkin
  Scenario: View a document in the in-app viewer
    Given the Documents tab has one seeded document
    When I click the View button for "E2E Boarding Pass"
    Then the document viewer is open with title "E2E Boarding Pass"
    When I close the document viewer
    Then the document viewer is closed
```

**Update `tests/e2e/steps/documents.steps.ts`** — Add 4 new step definitions:

```ts
When("I click the View button for {string}", async ({ page }, docName: string) => {
  await page.getByRole("button", { name: `View ${docName}` }).click();
});

Then("the document viewer is open with title {string}", async ({ page }, docName: string) => {
  await expect(page.getByRole("button", { name: "Close viewer" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(docName)).toBeVisible({ timeout: 10_000 });
});

When("I close the document viewer", async ({ page }) => {
  await page.getByRole("button", { name: "Close viewer" }).click();
});

Then("the document viewer is closed", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Close viewer" })).not.toBeVisible({
    timeout: 5_000,
  });
});
```

**Gotcha — Step text must match exactly:** Gherkin step text is matched by regex to step definitions. `"the document viewer is open with title {string}"` must match the feature file exactly. Double-check whitespace and punctuation.

---

### Architecture & Conventions Compliance

| Rule | How Story 2.1 Complies |
|------|------------------------|
| `"use client"` at top | `doc-viewer.tsx` starts with `"use client"` |
| Explicit Props interface | `DocViewerProps` interface defined before function |
| Destructure props | `{ doc, open, onClose }` in function signature |
| No hardcoded hex/rgb | All colors via `var(--bg)`, `var(--line)`, `var(--fg)`, `var(--fg-3)` |
| Minimum 44px touch targets | Close and share buttons: `minWidth: 44, minHeight: 44` |
| View button ARIA | `title` + `aria-label` = `"View [doc.name]"` (NFR3) |
| Focus trap + Escape | Handled by `Dialog` (Base UI `Dialog.Root`) |
| Focus return on close | Handled by `DialogClose` (Base UI tracks element before open) |
| autoFocus on first element | `autoFocus` on close button (first in DOM order) |
| No `any` types | All types from `@/data/types` |
| `cn()` not needed | Pure inline styles throughout; no className merging needed |
| Test files next to source | `doc-viewer.test.tsx` in `src/components/packt/` |
| `useIsMobile` import path | `@/lib/use-is-mobile` |

---

### File Changes Summary

| File | Change |
|------|--------|
| `src/components/packt/doc-row.tsx` | Add `Eye` import + `DocViewer` import + `viewerOpen` state + View button + `<DocViewer>` render |
| `src/components/packt/doc-viewer.tsx` | **NEW** — Full `DocViewer` component with Dialog wrapper, custom popup, header (close, name, share), empty body |
| `src/components/packt/doc-row.test.tsx` | Add `DocViewer` mock + 3 tests (view button title/aria, touch target, click opens viewer) |
| `src/components/packt/doc-viewer.test.tsx` | **NEW** — 8 tests for open/close/title/ARIA/touch-target/onClose |
| `tests/e2e/features/documents.feature` | Add "View a document in the in-app viewer" scenario |
| `tests/e2e/steps/documents.steps.ts` | Add 4 step implementations for the viewer scenario |

**Files NOT touched:**
- `src/data/types.ts` — `Document` type already complete
- `src/lib/utils.ts` — `shareDoc()` utility comes in Story 2.3
- `src/app/(app)/trips/[tripId]/actions.ts` — no server action needed for viewing
- `src/components/ui/dialog.tsx` — used as-is

---

## Tasks / Subtasks

- [x] Task 1: Add View button and viewer state to `src/components/packt/doc-row.tsx`
  - [x] Add `Eye` to lucide imports
  - [x] Import `DocViewer` from `./doc-viewer`
  - [x] Add `viewerOpen` state with `useState(false)`
  - [x] Add View button with `title`, `aria-label`, 44×44 touch target, `Eye` icon
  - [x] Render `<DocViewer doc={doc} open={viewerOpen} onClose={() => setViewerOpen(false)} />` after the delete Dialog
- [x] Task 2: Create `src/components/packt/doc-viewer.tsx`
  - [x] `"use client"` at top
  - [x] Import `Dialog as BaseUIDialog` from `@base-ui/react/dialog`
  - [x] Import `Dialog, DialogPortal, DialogOverlay, DialogClose` from `@/components/ui/dialog`
  - [x] Import `useIsMobile` from `@/lib/use-is-mobile`
  - [x] Import `X, Share2` from `lucide-react`
  - [x] Import `Document` from `@/data/types`
  - [x] Define `DocViewerProps` interface: `{ doc: Document; open: boolean; onClose: () => void }`
  - [x] Implement mobile full-screen popup style (`inset: 0`)
  - [x] Implement desktop centered modal style (`translate(-50%, -50%)`, `min(90vw, 640px)`)
  - [x] Dialog wraps with `onOpenChange={(o) => { if (!o) onClose(); }}`
  - [x] Header: Close button (first, `autoFocus`, `DialogClose`, `title/aria-label="Close viewer"`, 44×44) → doc name (truncated) → Share button (no onClick, `title/aria-label="Share [doc.name]"`, 44×44)
  - [x] Empty body `<div>` (content renders in Story 2.2)
- [x] Task 3: Update `src/components/packt/doc-row.test.tsx`
  - [x] Add `DocViewer` mock returning `<div data-testid="doc-viewer">` when open
  - [x] Add test: view button title and aria-label
  - [x] Add test: view button 44×44 touch target
  - [x] Add test: clicking view button opens DocViewer (testid appears)
- [x] Task 4: Create `src/components/packt/doc-viewer.test.tsx`
  - [x] `import React from "react"` at top (before vi.mock calls — needed for DialogClose mock)
  - [x] Mock `@/lib/use-is-mobile` with `vi.mock("@/lib/use-is-mobile")` (no factory — auto-spied)
  - [x] Mock `@base-ui/react/dialog` (`Dialog.Popup` as plain div with `data-testid` + `style` passthrough)
  - [x] Mock `@/components/ui/dialog` (all four: `Dialog`, `DialogPortal`, `DialogOverlay`, `DialogClose`)
  - [x] Import `useIsMobile` from `@/lib/use-is-mobile` (to call `vi.mocked()` on it)
  - [x] `beforeEach`: `vi.mocked(useIsMobile).mockReturnValue(false)` (desktop default)
  - [x] Test: does not render when `open=false`
  - [x] Test: renders popup when `open=true`
  - [x] Test: doc name shown in header
  - [x] Test: close button title/aria-label = "Close viewer"
  - [x] Test: close button 44×44 touch target
  - [x] Test: share button title/aria-label = "Share [doc.name]"
  - [x] Test: share button 44×44 touch target
  - [x] Test: onClose called when dialog backdrop close fires
  - [x] Test: mobile path — `mockReturnValueOnce(true)` → popup has `position: fixed; inset: 0`
- [x] Task 5: E2E — add scenario and steps
  - [x] Add "View a document in the in-app viewer" scenario to `documents.feature`
  - [x] Add 4 step definitions to `documents.steps.ts`
- [x] Task 6: Run full validation
  - [x] `npm run test:coverage` — verify ≥95% line/function, ≥90% branch coverage
  - [x] `npm run test:e2e` — verify new E2E scenario passes

### Review Findings (2026-05-20)

_Covers stories 2.1 and 2.2 — both implementations landed in the same diff. Story 2.2 findings are also written to its own file._

- [x] [Review][Decision→Patch] **D1: `actions.ts` modified outside Story 2.1 scope** — Resolved: harden in place + add file-size cap. Spawns patches P4/P5/P10/P11 + new P15 (size constraint).
- [x] [Review][Decision→Patch] **D2: No `sandbox` attribute on PDF `<iframe>`** — Resolved: conditional sandbox — sandbox only when URL host ≠ app host. Spawns new patch P14.
- [x] [Review][Patch] **P7: Focus management ACs (Spec 2.1 AC2 + AC5) have zero test coverage** — Fixed: added "Pressing Escape closes the viewer and returns focus to the View button" E2E scenario. Also added an explicit `finalFocusRef` ref-pass through DocViewer because Base UI's auto-finalFocus snapshots get clobbered by the close button's `autoFocus`.
- [x] [Review][Patch] **P8: `DialogClose render={...}` mock discards onClick — real close button click never tested** — Fixed: mock now forwards `onClick` via `React.cloneElement` and triggers the backdrop close, plus a new test exercises the real production close button.
- [x] [Review][Patch] **P4: Stub upload: path traversal via uploaded filename** — Fixed: `basename()` + `[^\w.-]` sanitize regex.
- [x] [Review][Patch] **P5: Stub upload: sync `writeFileSync`/`mkdirSync` blocks Node event loop** — Fixed: switched to `fs/promises` (`await writeFile`/`mkdir`).
- [x] [Review][Patch] **P10: Stub upload: URL-reserved characters in filename break routing** — Fixed: `encodeURIComponent` on URL portion.
- [x] [Review][Patch] **P11: Stub upload: `Date.now()` collision** — Fixed: added a short random suffix.
- [x] [Review][Patch] **P15: Stub upload: file size cap** — Fixed: rejects files > 25 MB at the start of `uploadDocument` (applies to both stub and Blob branches).
- [x] [Review][Patch] **P12: E2E `the document viewer is closed` uses `not.toBeVisible`** — Fixed: switched to `toHaveCount(0)`.
- [x] [Review][Patch] **P14: Conditional iframe sandbox** — Fixed: `sandbox=""` applied when the iframe URL host ≠ `window.location.host`; same-origin and relative URLs render without sandbox.
- [x] [Review][Defer] **DocViewer always mounted per row** — `<DocViewer>` renders for every doc row regardless of `open`. Hooks run N times; minor perf cost. Not a regression. — deferred, optimization
- [x] [Review][Defer] **Style duplication across icon buttons** — Three near-identical inline-style blocks (close/share/view). Refactor candidate. — deferred, refactor

### Review Findings — Dismissed (for the record)

- Share button has no `onClick` — per Spec 2.1 §Task 2 ("Do NOT add a placeholder `onClick`"); arrives in Story 2.3
- Share button tests assert only appearance — same reason
- `autoFocus` on close button — explicitly required by AC2 ("close button is the first interactive element")
- `toHaveStyle({ inset: "0" })` brittle — matches the spec's documented gotcha; correct per impl
- E2E uploads its own file vs reusing seed — dev notes justify it (cross-scenario isolation)
- `getByRole("dialog")` strict-mode worry — real Base UI emits `role="dialog"`; only the unit-test mock omits it
- `doc-row.test.tsx` mocks `DocViewer` — standard unit-test isolation; integration covered by E2E
- E2E scenario cleanup — `global-setup.ts` truncates DB before every run

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Created `doc-viewer.tsx` using `@base-ui/react/dialog`'s `Dialog.Popup` directly for custom mobile full-screen / desktop centered-modal sizing — `DialogContent` was unsuitable as it hardcodes bottom-sheet layout on mobile
- View button added to `DocRow` between name/input and delete button; uses `doc.name` (not `displayName`) for stable ARIA label
- E2E scenario is self-contained: uploads its own "view-test.pdf" rather than relying on the seeded "E2E Boarding Pass", avoiding cross-scenario state dependency
- Title check in E2E step scoped to `page.getByRole('dialog')` to avoid strict-mode multi-match (doc name appears in both row and viewer header simultaneously)
- Fixed `inset: "0"` (not `"0px"`) in mobile style assertion — jsdom doesn't normalize the shorthand

### Change Log

- 2026-05-20: Story 2.1 implemented — DocViewer component created, View button added to DocRow, unit tests (38 total), E2E scenario added (Date: 2026-05-20)

### File List

- src/components/packt/doc-row.tsx
- src/components/packt/doc-viewer.tsx
- src/components/packt/doc-row.test.tsx
- src/components/packt/doc-viewer.test.tsx
- tests/e2e/features/documents.feature
- tests/e2e/steps/documents.steps.ts
