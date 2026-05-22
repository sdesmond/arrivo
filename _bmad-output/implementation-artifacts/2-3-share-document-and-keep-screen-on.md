---
story_id: "2.3"
story_key: "2-3-share-document-and-keep-screen-on"
epic: 2
story: 3
title: "Share Document & Keep Screen On"
status: "ready-for-dev"
created: "2026-05-21"
---

# Story 2.3 — Share Document & Keep Screen On

## Story

As a **traveler**,
I want to share a document link and have my screen stay on while viewing it,
so that I can hand my phone to staff at a checkpoint without the screen dimming mid-presentation.

## Acceptance Criteria

**AC1 — Share via OS share sheet:**
Given the viewer is open,
When I tap the share button in the viewer header,
Then if `navigator.share` is available, the native OS share sheet opens with `{ title: doc.name, url: doc.url }`; if not available, the URL is copied to the clipboard via `navigator.clipboard.writeText` (FR9)

**AC2 — Shared utility, no duplication:**
Given the share button is present in both `DocRow` and `DocViewer`,
When the share logic is inspected,
Then both use the same `shareDoc(doc)` utility extracted to `src/lib/utils.ts` — no duplicated implementation

**AC3 — Share button accessibility:**
Given the share button in the viewer header is icon-only,
When it renders,
Then it has `title="Share [doc name]"` and `aria-label="Share [doc name]"` (NFR3); tap target is minimum 44×44px (NFR8)

**AC4 — Wake Lock acquisition:**
Given the viewer opens with a document,
When the Wake Lock effect runs,
Then `navigator.wakeLock.request('screen')` is called if the API is available; the lock is released when the viewer closes or the component unmounts; errors are silently caught (FR8)

**AC5 — Wake Lock unavailability:**
Given a browser that does not support Wake Lock,
When the viewer opens,
Then no error is thrown and the viewer functions normally without the lock

**AC6 — Test coverage:**
Given the story implementation is complete,
When tests are run,
Then unit tests for `shareDoc`, Wake Lock mount/unmount, and no-Wake-Lock fallback pass with ≥95% line coverage (NFR9); a Playwright BDD scenario covering document sharing exists in `tests/e2e/features/documents.feature` and passes (NFR10)

---

## Dev Notes

### Current State (end of Story 2.2)

**`src/components/packt/doc-viewer.tsx`** — 232 lines — primary file to modify

The component is complete from Stories 2.1 and 2.2:
- Share button UI already exists in the header with correct `title` and `aria-label` — **but has no `onClick` handler**
- `useState`, `useEffect` already imported
- `isMobileSafari` state + effect already in place
- `sandboxIframe` state + effect already in place
- `safeHttpUrl()` and `isCrossOrigin()` helpers already in the file

What's missing for Story 2.3:
1. Import `shareDoc` from `@/lib/utils`
2. Wire `onClick={() => { void shareDoc(doc); }}` on the existing share button
3. Add a Wake Lock `useEffect` that runs when `open` changes

**`src/components/packt/doc-viewer.test.tsx`** — 241 lines, 17 tests from Stories 2.1+2.2

Current mocks (DO NOT modify):
- `vi.mock("@/lib/use-is-mobile")` — `beforeEach` sets `mockReturnValue(false)`
- `vi.mock("@base-ui/react/dialog")` — `Dialog.Popup` renders as `<div data-testid="doc-viewer-popup">`
- `vi.mock("@/components/ui/dialog")` — Dialog/DialogPortal/DialogOverlay/DialogClose mocked

Story 2.3 adds 3–4 new tests for Wake Lock behavior.

**`src/components/packt/doc-row.tsx`** — 218 lines — secondary file to modify

Current layout (confirmed from source):
```
[DocKindBadge] [offline dot/tooltip] [name] [Eye/View btn] [Delete btn] [confirm Dialog] [DocViewer]
```

Current imports:
```tsx
import { Trash2, Download, Eye } from "lucide-react";
// NOTE: Share2 is NOT yet imported
```

What's missing:
1. Add `Share2` to lucide imports
2. Import `shareDoc` from `@/lib/utils`
3. Add a share button between the View button and the Delete button
4. Add `onClick={() => { void shareDoc(doc); }}` to the share button

**`src/components/packt/doc-row.test.tsx`** — 283 lines, 27 tests

Current mock for `DocViewer`:
```ts
vi.mock("./doc-viewer", () => ({
  DocViewer: ({ open, doc }: { open: boolean; doc: { name: string } }) =>
    open ? <div data-testid="doc-viewer">{doc.name}</div> : null,
}));
```

Story 2.3 adds tests for the share button in DocRow. The `shareDoc` utility will need to be mocked.

**`src/lib/utils.ts`** — 93 lines — new `shareDoc` function goes here

Current state: contains `cn`, `isEventPast`, `isEventNow`, `getTripStatus`, etc. Does NOT currently have `shareDoc`. Does NOT import from `@/data/types`. Does not have `// @vitest-environment jsdom` — the test file runs in `node` environment.

**`src/lib/utils.test.ts`** — 263 lines, runs in `node` environment (no jsdom directive)

Currently tests: `cn`, `getTripStatus`, `isEventPast`, `isEventNow`, `getTripDays`, etc.

`shareDoc` uses `navigator.share` and `navigator.clipboard` — browser APIs not available in `node` environment. **You must add `// @vitest-environment jsdom` as the very first line of `utils.test.ts`** before writing `shareDoc` tests. The existing tests are environment-agnostic and will continue to pass in jsdom.

---

### Task 1: Add `shareDoc` to `src/lib/utils.ts`

**Step 1 — Add the function at the end of `utils.ts`:**

```ts
export async function shareDoc(doc: { name: string; url?: string }): Promise<void> {
  const url = doc.url ?? "";
  try {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      await navigator.share({ title: doc.name, url });
    } else if (typeof navigator !== "undefined" && typeof navigator.clipboard?.writeText === "function") {
      await navigator.clipboard.writeText(url);
    }
  } catch {
    // Silently absorb AbortError (user cancelled) and permission errors
  }
}
```

**Why no `import type { Document }` from `@/data/types`?** The inline type `{ name: string; url?: string }` is structurally equivalent to the relevant fields of `Document` and avoids coupling `utils.ts` to the domain types. Both `DocRow` and `DocViewer` pass `doc` directly, which satisfies this shape.

**Why `typeof navigator.share === "function"` instead of `"share" in navigator`?** Using `typeof === "function"` is the correct availability check for browser APIs. `"share" in navigator` returns `true` even when `navigator.share` is `undefined` (e.g., after `Object.defineProperty(navigator, "share", { value: undefined })`), which would cause the `if` branch to enter and throw a TypeError — swallowed by `catch` — and the clipboard fallback would never be reached. `typeof === "function"` correctly skips to the clipboard branch when the property is present but not callable.

**Why `typeof navigator.clipboard?.writeText === "function"`?** Same principle — checks that the specific method is callable, not just that the clipboard object exists. Defensive against partial browser implementations.

**Why a `try/catch` wrapping everything?**
- `navigator.share` throws `DOMException(AbortError)` when the user cancels the OS share sheet — this is expected and should not surface as an error.
- `navigator.clipboard.writeText` throws `NotAllowedError` in headless test environments and restricted contexts.
- Swallowing all errors here is intentional — the share action is best-effort with no mandatory side effect.

---

### Task 2: Update `src/lib/utils.test.ts`

**Step 1 — Add jsdom environment directive as the very first line:**
```ts
// @vitest-environment jsdom
```

This must be the absolute first line, before any imports.

**Step 2 — Add `shareDoc` to the import list:**
```ts
import {
  cn,
  getTripStatus,
  // ... existing imports ...
  formatFileSize,
  shareDoc,   // ← add this
} from "@/lib/utils";
```

**Step 3 — Add tests after the `formatFileSize` describe block:**

```ts
describe("shareDoc", () => {
  const doc = { name: "Boarding Pass.pdf", url: "https://example.com/doc.pdf" };

  afterEach(() => {
    vi.restoreAllMocks();
    // Restore navigator.clipboard to jsdom default (Object.defineProperty overrides are not cleaned by vi.restoreAllMocks)
    try {
      delete (navigator as Record<string, unknown>).clipboard;
    } catch {}
  });

  it("calls navigator.share when available", async () => {
    const mockShare = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", {
      value: mockShare,
      configurable: true,
    });

    await shareDoc(doc);

    expect(mockShare).toHaveBeenCalledWith({
      title: "Boarding Pass.pdf",
      url: "https://example.com/doc.pdf",
    });

    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
  });

  it("falls back to clipboard.writeText when navigator.share is unavailable", async () => {
    // Ensure navigator.share is not present
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    const mockWriteText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: mockWriteText },
      configurable: true,
    });

    await shareDoc(doc);

    expect(mockWriteText).toHaveBeenCalledWith("https://example.com/doc.pdf");
  });

  it("uses empty string for url when doc.url is undefined", async () => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    const mockWriteText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: mockWriteText },
      configurable: true,
    });

    await shareDoc({ name: "No URL Doc" });

    expect(mockWriteText).toHaveBeenCalledWith("");
  });

  it("silently catches AbortError from navigator.share (user cancelled)", async () => {
    const abortError = new DOMException("Cancelled", "AbortError");
    Object.defineProperty(navigator, "share", {
      value: vi.fn().mockRejectedValue(abortError),
      configurable: true,
    });

    await expect(shareDoc(doc)).resolves.toBeUndefined();

    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
  });

  it("silently catches clipboard permission errors", async () => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new DOMException("Permission denied", "NotAllowedError")) },
      configurable: true,
    });

    await expect(shareDoc(doc)).resolves.toBeUndefined();
  });
});
```

**Gotcha — `Object.defineProperty` on `navigator.share`:** jsdom defines some navigator properties as `configurable: false`. If you get "Cannot redefine property", use `vi.spyOn(navigator, "share")` or `Object.defineProperty` with `configurable: true`. The pattern above works reliably.

**Gotcha — restoring mocks:** Use `afterEach(() => vi.restoreAllMocks())` instead of per-test cleanup where possible. The `Object.defineProperty` calls still need manual cleanup (see navigator.share above) since `vi.restoreAllMocks()` only affects `vi.spyOn` mocks.

---

### Task 3: Wire share button in `src/components/packt/doc-viewer.tsx`

**Step 1 — Add `shareDoc` import:**
```tsx
import { shareDoc } from "@/lib/utils";
```
Add this after the existing imports (after the `lucide-react` import).

**Step 2 — Add Wake Lock `useEffect`:**

Add this after the `sandboxIframe` effect (line ~56 in the current file):

```tsx
useEffect(() => {
  if (!open) return;
  if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;

  let sentinel: WakeLockSentinel | null = null;
  navigator.wakeLock
    .request("screen")
    .then((s) => {
      sentinel = s;
    })
    .catch(() => {});

  return () => {
    sentinel?.release().catch(() => {});
  };
}, [open]);
```

**TypeScript note:** `WakeLockSentinel` is a DOM type available in TypeScript 4.6+. The project uses TS 5.x so it's in scope without any `@types` addition. `navigator.wakeLock` is typed as `WakeLock` in `lib.dom.d.ts`. The `"wakeLock" in navigator` guard is still needed at runtime (the API isn't universally supported) but TypeScript won't narrow the type through `in` checks for navigator properties — this is fine since we're just `.catch()`-ing errors.

**Step 3 — Wire `onClick` on the existing share button:**

Find the share button in the header (currently has no `onClick`):
```tsx
<button
  title={`Share ${doc.name}`}
  aria-label={`Share ${doc.name}`}
  style={{
    display: "inline-flex",
    // ...
  }}
>
```

Add `onClick`:
```tsx
<button
  title={`Share ${doc.name}`}
  aria-label={`Share ${doc.name}`}
  onClick={() => { void shareDoc(doc); }}
  style={{
    display: "inline-flex",
    // ...
  }}
>
```

**That's the only change to the button itself.** `title`, `aria-label`, and all styles are already correct from Story 2.1.

---

### Task 4: Add share button to `src/components/packt/doc-row.tsx`

**Step 1 — Update lucide import to include `Share2`:**
```tsx
import { Trash2, Download, Eye, Share2 } from "lucide-react";
```

**Step 2 — Add `shareDoc` import:**
```tsx
import { shareDoc } from "@/lib/utils";
```
Add after the existing `@/app/(app)/trips/[tripId]/actions` import.

**Step 3 — Add share button between the View button and the Delete button:**

Find the current View button block:
```tsx
      <button
        ref={viewButtonRef}
        onClick={() => setViewerOpen(true)}
        title={`View ${doc.name}`}
        aria-label={`View ${doc.name}`}
        // ...
      >
        <Eye size={15} strokeWidth={1.5} />
      </button>
```

Insert this new block immediately after it (before the Delete button):
```tsx
      <button
        title={`Share ${doc.name}`}
        aria-label={`Share ${doc.name}`}
        onClick={() => { void shareDoc(doc); }}
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
        <Share2 size={15} strokeWidth={1.5} />
      </button>
```

The layout becomes: `[DocKindBadge] [offline dot] [name] [View btn] [Share btn] [Delete btn]`

---

### Task 5: Update `src/components/packt/doc-viewer.test.tsx`

Add 4 new tests for Wake Lock behavior. Insert them after the existing `"renders a Download link for kind doc"` test (before the `"shows fallback message when doc.url is undefined"` test).

**Step 1 — Import `afterEach` from vitest** (add to existing import):
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
```

**Step 2 — Add Wake Lock tests:**

```tsx
describe("Wake Lock", () => {
  afterEach(() => {
    // Delete the property entirely so "wakeLock" in navigator returns false for subsequent tests.
    // Setting { value: undefined } is not sufficient — the property would still exist and the
    // "wakeLock" in navigator guard would pass, causing navigator.wakeLock.request() to throw.
    try {
      delete (navigator as Record<string, unknown>).wakeLock;
    } catch {}
  });

  it("does not throw when navigator.wakeLock is unavailable", () => {
    // jsdom has no wakeLock by default — this verifies the guard works
    expect(() => {
      render(<DocViewer doc={makeDoc()} open={true} onClose={vi.fn()} />);
    }).not.toThrow();
  });

  it("requests a screen wake lock when viewer opens", async () => {
    const mockRelease = vi.fn().mockResolvedValue(undefined);
    const mockRequest = vi.fn().mockResolvedValue({ release: mockRelease, type: "screen" });
    Object.defineProperty(navigator, "wakeLock", {
      value: { request: mockRequest },
      configurable: true,
    });

    render(<DocViewer doc={makeDoc()} open={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith("screen");
    });
  });

  it("releases wake lock when viewer closes (open → false)", async () => {
    const mockRelease = vi.fn().mockResolvedValue(undefined);
    const mockRequest = vi.fn().mockResolvedValue({ release: mockRelease, type: "screen" });
    Object.defineProperty(navigator, "wakeLock", {
      value: { request: mockRequest },
      configurable: true,
    });

    const { rerender } = render(<DocViewer doc={makeDoc()} open={true} onClose={vi.fn()} />);
    await waitFor(() => expect(mockRequest).toHaveBeenCalledWith("screen"));

    rerender(<DocViewer doc={makeDoc()} open={false} onClose={vi.fn()} />);
    await waitFor(() => expect(mockRelease).toHaveBeenCalled());
  });

  it("silently catches wake lock request errors", async () => {
    Object.defineProperty(navigator, "wakeLock", {
      value: { request: vi.fn().mockRejectedValue(new DOMException("NotAllowed")) },
      configurable: true,
    });

    expect(() => {
      render(<DocViewer doc={makeDoc()} open={true} onClose={vi.fn()} />);
    }).not.toThrow();
    // The rejected promise is caught internally — no unhandled rejection surfaces
  });
});
```

**Gotcha — Wake Lock cleanup in `afterEach`:** Setting `navigator.wakeLock` to `undefined` in `afterEach` ensures later tests (like the "no throw when unavailable" test) don't accidentally find the mock. The `afterEach` runs after EACH test in this `describe`, including the first one.

**Gotcha — sentinel race condition in "releases lock" test:** The test awaits `waitFor(expect(mockRequest).toHaveBeenCalled())` BEFORE calling `rerender`. This guarantees the request Promise has resolved and `sentinel` has been assigned before the cleanup runs. Without this await, `rerender` might fire before the promise resolves, and `sentinel` would still be `null` at cleanup time.

---

### Task 6: Update `src/components/packt/doc-row.test.tsx`

Add share button tests. Add a new `describe("share button")` block after the view button tests.

**Step 1 — Mock `shareDoc`** — add to the existing mocks section (after the `vi.mock("./doc-viewer", ...)` block):
```ts
vi.mock("@/lib/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/utils")>();
  return {
    ...actual,
    shareDoc: vi.fn().mockResolvedValue(undefined),
  };
});
```

**Note:** Use `async importOriginal` to spread the actual module. This preserves all existing utils exports (cn, inferDocKind, etc.) while replacing only `shareDoc`.

**Step 2 — Add import for `shareDoc`** in the import section after existing imports:
```ts
import { shareDoc } from "@/lib/utils";
```

**Step 3 — Add tests after the view button tests:**

```tsx
describe("share button", () => {
  it("renders a share button with correct title and aria-label", () => {
    render(<DocRow doc={makeDoc()} />);
    const btn = screen.getByRole("button", { name: "Share Boarding Pass.pdf" });
    expect(btn).toHaveAttribute("title", "Share Boarding Pass.pdf");
    expect(btn).toHaveAttribute("aria-label", "Share Boarding Pass.pdf");
  });

  it("share button uses doc name in title/aria-label", () => {
    render(<DocRow doc={makeDoc({ name: "insurance.pdf" })} />);
    expect(screen.getByRole("button", { name: "Share insurance.pdf" })).toBeInTheDocument();
  });

  it("share button has min 44px touch target", () => {
    render(<DocRow doc={makeDoc()} />);
    const btn = screen.getByRole("button", { name: "Share Boarding Pass.pdf" });
    expect(btn).toHaveStyle({ minWidth: "44px", minHeight: "44px" });
  });

  it("clicking share button calls shareDoc with the doc", async () => {
    const user = userEvent.setup();
    render(<DocRow doc={makeDoc({ id: "doc-1", name: "Boarding Pass.pdf", url: "https://example.com/doc.pdf" })} />);
    await user.click(screen.getByRole("button", { name: "Share Boarding Pass.pdf" }));
    expect(shareDoc).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Boarding Pass.pdf", url: "https://example.com/doc.pdf" })
    );
  });
});
```

---

### Task 7: Add E2E scenario and steps

**`tests/e2e/features/documents.feature`** — add two new scenarios at the end:

```gherkin
  Scenario: Share button is accessible in the document viewer
    When I upload a file named "share-doc.pdf" with MIME type "application/pdf"
    Then the document "share-doc.pdf" appears in the Documents list
    When I click the View button for "share-doc.pdf"
    Then the document viewer is open with title "share-doc.pdf"
    And the share button for "share-doc.pdf" is visible in the viewer

  Scenario: Clicking the share button does not close the viewer
    When I upload a file named "share-click.pdf" with MIME type "application/pdf"
    Then the document "share-click.pdf" appears in the Documents list
    When I click the View button for "share-click.pdf"
    Then the document viewer is open with title "share-click.pdf"
    When I click the share button for "share-click.pdf"
    Then the document viewer is open with title "share-click.pdf"
```

**`tests/e2e/steps/documents.steps.ts`** — add two new step definitions at the end:

```ts
Then("the share button for {string} is visible in the viewer", async ({ page }, docName: string) => {
  await expect(page.getByRole("button", { name: `Share ${docName}` })).toBeVisible({ timeout: 5_000 });
});

When("I click the share button for {string}", async ({ page }, docName: string) => {
  await page.getByRole("button", { name: `Share ${docName}` }).click();
});
```

**Note on clipboard in headless Playwright:** `navigator.share` is not available in headless Chromium. The component falls back to `navigator.clipboard.writeText`. In headless Chromium without explicit clipboard permissions, `clipboard.writeText` may throw `NotAllowedError` — but `shareDoc` catches all errors silently. The viewer does NOT close, which is what the second scenario verifies.

---

### Architecture & Conventions Compliance

| Rule | How Story 2.3 Complies |
|------|------------------------|
| `"use client"` at top | Both `DocViewer` and `DocRow` already have this; no change |
| Explicit Props interfaces | `DocViewerProps` and `DocRowProps` already defined; no change |
| No hardcoded hex/rgb | Share button colors via `var(--fg-3)` (already used on other buttons); no new colors |
| `shareDoc` in utils.ts | ✓ — single source of truth, no duplication |
| Lucide icons `strokeWidth={1.5}` | `<Share2 size={15} strokeWidth={1.5} />` ✓ |
| 44×44px touch targets | Share buttons use `minWidth: 44, minHeight: 44` same as View/Delete buttons ✓ |
| `title` + `aria-label` on icon-only buttons | `title={"Share ${doc.name}"}` and `aria-label={"Share ${doc.name}"}` ✓ |
| Wake Lock errors silently caught | `.catch(() => {})` on both request and release ✓ |
| No new domain types | Uses inline type `{ name: string; url?: string }` in shareDoc ✓ |

---

### File Changes Summary

| File | Change |
|------|--------|
| `src/lib/utils.ts` | Add `shareDoc({ name, url? })` async function at end of file |
| `src/lib/utils.test.ts` | Add `// @vitest-environment jsdom` as first line; add `shareDoc` to imports; add 5 shareDoc tests |
| `src/components/packt/doc-viewer.tsx` | Add `shareDoc` import; add Wake Lock `useEffect`; wire `onClick` on share button |
| `src/components/packt/doc-viewer.test.tsx` | Add `afterEach` to vitest import; add `describe("Wake Lock")` with 4 tests |
| `src/components/packt/doc-row.tsx` | Add `Share2` to lucide import; add `shareDoc` import; add share button between View and Delete |
| `src/components/packt/doc-row.test.tsx` | Mock `shareDoc` from utils; add `shareDoc` import; add `describe("share button")` with 4 tests |
| `tests/e2e/features/documents.feature` | Add 2 new sharing scenarios |
| `tests/e2e/steps/documents.steps.ts` | Add 2 new step implementations |

**Files NOT touched:**
- `src/data/types.ts` — no type changes needed
- `src/app/(app)/trips/[tripId]/actions.ts` — no new server actions
- `src/db/schema.ts` — no schema changes
- `src/components/packt/trip-docs-tab.tsx` — no changes needed
- `src/lib/use-is-mobile.ts` — no changes needed

---

## Tasks / Subtasks

- [ ] Task 1: Add `shareDoc` to `src/lib/utils.ts`
  - [ ] Add `export async function shareDoc(doc: { name: string; url?: string }): Promise<void>` at end of file
  - [ ] Guard with `typeof navigator !== "undefined"` checks
  - [ ] Try `navigator.share({ title, url })` if available
  - [ ] Fall back to `navigator.clipboard.writeText(url)` if share unavailable
  - [ ] Wrap entire body in `try/catch` that silently swallows errors

- [ ] Task 2: Update `src/lib/utils.test.ts`
  - [ ] Add `// @vitest-environment jsdom` as the absolute first line of the file
  - [ ] Add `shareDoc` to the import from `@/lib/utils`
  - [ ] Add `describe("shareDoc")` block with 5 tests (share present, clipboard fallback, undefined url, AbortError, clipboard permission error)

- [ ] Task 3: Update `src/components/packt/doc-viewer.tsx`
  - [ ] Add `import { shareDoc } from "@/lib/utils"` after lucide import
  - [ ] Add Wake Lock `useEffect` after the `sandboxIframe` effect
  - [ ] Add `onClick={() => { void shareDoc(doc); }}` to the existing share button

- [ ] Task 4: Update `src/components/packt/doc-viewer.test.tsx`
  - [ ] Add `afterEach` to the vitest import line
  - [ ] Add `describe("Wake Lock")` block with 4 tests (no wake lock no throw, acquires on open, releases on close, silently catches errors)
  - [ ] Include `afterEach` cleanup that `delete`s `navigator.wakeLock` (not sets to undefined — keeps `in` check false)

- [ ] Task 5: Update `src/components/packt/doc-row.tsx`
  - [ ] Add `Share2` to lucide import
  - [ ] Add `import { shareDoc } from "@/lib/utils"`
  - [ ] Add share button JSX after the View button and before the Delete button

- [ ] Task 6: Update `src/components/packt/doc-row.test.tsx`
  - [ ] Add `vi.mock("@/lib/utils", async (importOriginal) => { ... shareDoc: vi.fn() })` mock
  - [ ] Add `import { shareDoc } from "@/lib/utils"`
  - [ ] Add `describe("share button")` with 4 tests (title/aria-label, doc name in label, touch target, calls shareDoc on click)

- [ ] Task 7: Update E2E files
  - [ ] Add 2 scenarios to `tests/e2e/features/documents.feature`
  - [ ] Add 2 step definitions to `tests/e2e/steps/documents.steps.ts`

- [ ] Task 8: Run full validation
  - [ ] `npm run test:coverage` — verify ≥95% line/function, ≥90% branch coverage
  - [ ] `npm run test:e2e` — verify new E2E scenarios pass
  - [ ] `npm run build` (via build-validator) — no TypeScript errors

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List
