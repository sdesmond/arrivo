---
story_id: "1.4"
story_key: "1-4-search-and-inline-rename"
epic: 1
story: 4
title: "Search & Inline Rename"
status: "done"
created: "2026-05-20"
---

# Story 1.4 — Search & Inline Rename

## User Story

As a **traveler**,
I want to search for documents by name and rename them directly from the list,
So that I can quickly find what I need and keep names meaningful without opening a separate dialog.

## Acceptance Criteria

**Given** I am on the Documents tab
**When** I type in the search field
**Then** the document list filters in real time to show only documents whose names contain the typed string (case-insensitive, client-side) (FR4); documents that don't match are hidden

**Given** the search field renders
**When** inspected for accessibility
**Then** it has an associated `<label>` element (either visible or visually hidden with `sr-only`) with text "Search documents" (NFR5)

**Given** I clear the search field
**When** it becomes empty
**Then** the full document list is restored

**Given** a document name is displayed in a row
**When** I click or tap the name
**Then** the name text is replaced by an `<input>` pre-filled with the current name; the input has an underline border using `var(--accent-brand)`; focus moves to the input (UX-DR2, FR5)

**Given** I am editing a document name
**When** I press Enter or the input loses focus (blur)
**Then** `renameDocument(docId, newName)` is called; the input is replaced by the updated name text (FR5, FR16)

**Given** I am editing a document name
**When** I press Escape
**Then** the input is replaced by the original name text with no change saved

**Given** I submit an empty or whitespace-only name
**When** blur or Enter fires
**Then** the rename is not saved and the original name is restored

**Given** the story implementation is complete
**When** tests are run
**Then** unit tests for search filtering and inline rename (including empty/Escape cases) pass with ≥95% line coverage (NFR9); Playwright BDD scenarios covering search and rename exist in `tests/e2e/features/documents.feature` and pass (NFR10)

---

## Dev Notes

### Current State (end of Story 1.3)

- `doc-row.tsx` (`src/components/packt/doc-row.tsx`): 119 lines — renders `DocKindBadge`, doc name as `<span className="flex-1 truncate">`, delete button (Trash2 icon), confirm Dialog. No rename behavior yet.
- `trip-docs-tab.tsx` (`src/components/packt/trip-docs-tab.tsx`): 87 lines — renders hidden file input + Add label, empty state (`docs.length === 0`), doc list via `<DocRow>`. No search input yet.
- `renameDocument` server action: **does not exist** — must be created in `src/app/(app)/trips/[tripId]/actions.ts`.
- `doc-row.test.tsx`: 163 lines, 14 tests covering rendering, delete button a11y, confirm dialog, error/double-click guards. Mock at top of file: `vi.mock("@/app/(app)/trips/[tripId]/actions", ...)`.
- `trip-docs-tab.test.tsx`: 71 lines, 7 tests covering empty state, doc rows, Add label, file input accept/for, uploadDocument call.
- `documents.feature` (2 scenarios): Delete first, Upload second.
- `documents.steps.ts`: step defs for upload, delete (with confirm dialog click), empty state.

### Task 1: Add `renameDocument` server action

**File:** `src/app/(app)/trips/[tripId]/actions.ts` — append after `removeDocument` (currently the last export at line 352).

No new imports are needed. The helper `getEventTripId` is already defined at line 23 and used by `removeDocument`. Pattern is identical.

```ts
export async function renameDocument(docId: string, newName: string) {
  const user = await requireUser();
  const [doc] = await db.select().from(documents).where(eq(documents.id, docId));
  if (!doc) return;
  const tripId = doc.tripId ?? (doc.eventId ? await getEventTripId(doc.eventId) : null);
  if (!tripId) return;
  await assertTripAccess(tripId, user.id!, "editor");
  await db.update(documents).set({ name: newName }).where(eq(documents.id, docId));
  revalidatePath(`/trips/${tripId}`);
}
```

`actions.ts` lives under `src/app/**` and is excluded from unit test coverage — no unit test needed for this function directly. The rename call is tested via `doc-row.test.tsx` (mock-level) and E2E.

### Task 2: Add Inline Rename to DocRow

**File:** `src/components/packt/doc-row.tsx`

The name `<span>` becomes click-to-edit. When clicked, swap to an `<input>` pre-filled with the current name. On blur/Enter save; on Escape cancel. Guard blur-after-Escape with a `cancelRef`.

**New state/refs needed** (in addition to existing `isPending`, `confirmOpen`, `error`, `inFlightRef`):
- `const [isEditing, setIsEditing] = useState(false);`
- `const [editName, setEditName] = useState("");`
- `const cancelRef = useRef(false);` — prevents the blur handler from saving after Escape

**New import:** add `renameDocument` to the existing actions import line.

**`handleSave` function:**
```ts
function handleSave() {
  if (cancelRef.current) {
    cancelRef.current = false;
    return;
  }
  const trimmed = editName.trim();
  if (trimmed && trimmed !== doc.name) {
    void renameDocument(doc.id, trimmed);
  }
  setIsEditing(false);
}
```

**`handleRenameKeyDown` function:**
```ts
function handleRenameKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
  if (e.key === "Enter") {
    e.preventDefault();
    handleSave();
  } else if (e.key === "Escape") {
    e.preventDefault();
    cancelRef.current = true;
    setIsEditing(false);
  }
}
```

**Replace the name span** with a conditional:
```tsx
{isEditing ? (
  <input
    autoFocus
    value={editName}
    onChange={(e) => setEditName(e.target.value)}
    onBlur={handleSave}
    onKeyDown={handleRenameKeyDown}
    style={{
      flex: 1,
      fontFamily: "var(--font-body, ui-sans-serif)",
      fontSize: "calc(14px * var(--font-scale))",
      color: "var(--fg)",
      background: "transparent",
      border: "none",
      borderBottom: "1px solid var(--accent-brand)",
      outline: "none",
      padding: 0,
    }}
  />
) : (
  <span
    className="flex-1 truncate"
    onClick={() => { setEditName(doc.name); setIsEditing(true); }}
    style={{
      fontFamily: "var(--font-body, ui-sans-serif)",
      fontSize: "calc(14px * var(--font-scale))",
      color: "var(--fg)",
      cursor: "text",
    }}
  >
    {doc.name}
  </span>
)}
```

**Important:** `autoFocus` on the input handles focus automatically — no `useEffect` or `useRef` needed for focus.

**Gotcha — blur fires on unmount when Escape is pressed:** When Escape calls `setIsEditing(false)`, React unmounts the input, which fires `onBlur` → `handleSave`. The `cancelRef.current = true` guard set during Escape catches this and returns early. `cancelRef.current` is reset to `false` inside `handleSave` so subsequent edits work normally.

**Gotcha — blur fires when Delete button is clicked:** If user clicks the trash icon while in rename mode, blur fires first (triggering save), then the delete button click fires. This is acceptable — the rename saves, then the confirm dialog opens.

### Task 3: Add Search Input to TripDocsTab

**File:** `src/components/packt/trip-docs-tab.tsx`

Add `useState` for the search query (add to the existing `import { useRef, useTransition } from "react"` line — add `useState`):
```ts
const [query, setQuery] = useState("");
```

Add a filtered list constant:
```ts
const visible = query.trim()
  ? docs.filter((d) => d.name.toLowerCase().includes(query.toLowerCase()))
  : docs;
```

Add a search row between the Add button row and the docs list. Use `type="search"` so Testing Library and Playwright can find it as `role="searchbox"`:

```tsx
<div style={{ position: "relative", marginBottom: 12 }}>
  <label
    htmlFor="doc-search"
    style={{
      position: "absolute",
      width: 1,
      height: 1,
      padding: 0,
      margin: -1,
      overflow: "hidden",
      clip: "rect(0,0,0,0)",
      whiteSpace: "nowrap",
      border: 0,
    }}
  >
    Search documents
  </label>
  <input
    id="doc-search"
    type="search"
    value={query}
    onChange={(e) => setQuery(e.target.value)}
    placeholder="Search"
    style={{
      width: "100%",
      padding: "5px 8px",
      borderRadius: "var(--radius-sm)",
      border: "1px solid var(--line)",
      background: "var(--surface)",
      color: "var(--fg)",
      fontFamily: "var(--font-body, ui-sans-serif)",
      fontSize: "calc(12px * var(--font-scale))",
      boxSizing: "border-box",
    }}
  />
</div>
```

Replace `docs.map(...)` with `visible.map(...)`. The empty state (`docs.length === 0`) is unchanged — it reflects "no documents uploaded yet", not "no search results".

**Gotcha — `type="search"` adds a browser clear button in Chrome/Safari:** This is desired behavior for a search input. No special handling needed.

**Gotcha — search input renders even when docs is empty:** Keep it this way — the input renders above the empty state message. This is consistent with UX-DR1 requirements.

### Task 4: Unit Tests for `doc-row.test.tsx`

**Update the mock** to include `renameDocument`:
```ts
vi.mock("@/app/(app)/trips/[tripId]/actions", () => ({
  removeDocument: vi.fn().mockResolvedValue(undefined),
  uploadDocument: vi.fn().mockResolvedValue(undefined),
  renameDocument: vi.fn().mockResolvedValue(undefined),
}));
```

**Add to the import line:**
```ts
import { removeDocument, renameDocument } from "@/app/(app)/trips/[tripId]/actions";
```

**Add these tests** to the existing `describe("DocRow")` block:

```ts
it("clicking the name enters edit mode with input pre-filled", async () => {
  const user = userEvent.setup();
  render(<DocRow doc={makeDoc()} />);
  await user.click(screen.getByText("Boarding Pass.pdf"));
  const input = screen.getByRole("textbox");
  expect(input).toBeInTheDocument();
  expect(input).toHaveValue("Boarding Pass.pdf");
});

it("rename input has underline border using var(--accent-brand)", async () => {
  const user = userEvent.setup();
  render(<DocRow doc={makeDoc()} />);
  await user.click(screen.getByText("Boarding Pass.pdf"));
  expect(screen.getByRole("textbox")).toHaveStyle({
    borderBottom: "1px solid var(--accent-brand)",
  });
});

it("pressing Enter calls renameDocument with trimmed new name", async () => {
  const user = userEvent.setup();
  render(<DocRow doc={makeDoc({ id: "doc-1", name: "Boarding Pass.pdf" })} />);
  await user.click(screen.getByText("Boarding Pass.pdf"));
  const input = screen.getByRole("textbox");
  await user.clear(input);
  await user.type(input, "New Name");
  await user.keyboard("{Enter}");
  expect(renameDocument).toHaveBeenCalledWith("doc-1", "New Name");
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
});

it("blurring the input calls renameDocument", async () => {
  const user = userEvent.setup();
  render(<DocRow doc={makeDoc({ id: "doc-1", name: "Boarding Pass.pdf" })} />);
  await user.click(screen.getByText("Boarding Pass.pdf"));
  const input = screen.getByRole("textbox");
  await user.clear(input);
  await user.type(input, "Renamed");
  await user.tab(); // triggers blur
  expect(renameDocument).toHaveBeenCalledWith("doc-1", "Renamed");
});

it("pressing Escape cancels rename without calling renameDocument", async () => {
  const user = userEvent.setup();
  render(<DocRow doc={makeDoc({ id: "doc-1", name: "Boarding Pass.pdf" })} />);
  await user.click(screen.getByText("Boarding Pass.pdf"));
  const input = screen.getByRole("textbox");
  await user.clear(input);
  await user.type(input, "Cancelled name");
  await user.keyboard("{Escape}");
  expect(renameDocument).not.toHaveBeenCalled();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
});

it("does not call renameDocument when input is cleared to empty", async () => {
  const user = userEvent.setup();
  render(<DocRow doc={makeDoc({ id: "doc-1" })} />);
  await user.click(screen.getByText("Boarding Pass.pdf"));
  const input = screen.getByRole("textbox");
  await user.clear(input);
  await user.keyboard("{Enter}");
  expect(renameDocument).not.toHaveBeenCalled();
});

it("does not call renameDocument when input is whitespace only", async () => {
  const user = userEvent.setup();
  render(<DocRow doc={makeDoc({ id: "doc-1" })} />);
  await user.click(screen.getByText("Boarding Pass.pdf"));
  const input = screen.getByRole("textbox");
  await user.clear(input);
  await user.type(input, "   ");
  await user.keyboard("{Enter}");
  expect(renameDocument).not.toHaveBeenCalled();
});

it("does not call renameDocument when name is unchanged", async () => {
  const user = userEvent.setup();
  render(<DocRow doc={makeDoc({ id: "doc-1", name: "Boarding Pass.pdf" })} />);
  await user.click(screen.getByText("Boarding Pass.pdf"));
  await user.keyboard("{Enter}"); // no change
  expect(renameDocument).not.toHaveBeenCalled();
});
```

**Note on `user.tab()` for blur test:** `userEvent.tab()` moves focus away from the input, triggering `onBlur`. This is the correct way to test blur in user-event v14.

### Task 5: Unit Tests for `trip-docs-tab.test.tsx`

**Update `makeDoc`** to accept an optional name (avoids collision with existing tests):
```ts
const makeDoc = (id: string, name?: string): Document => ({
  id,
  name: name ?? `Doc ${id}`,
  kind: "pdf",
  scope: "trip",
  offline: false,
});
```

**Add these tests** to the existing `describe("TripDocsTab")` block:

```ts
it("renders a visually hidden label 'Search documents' associated with the search input", () => {
  render(<TripDocsTab tripId="trip-1" docs={[makeDoc("1")]} />);
  const label = document.querySelector('label[for="doc-search"]');
  expect(label).toBeInTheDocument();
  expect(label?.textContent).toBe("Search documents");
});

it("filters docs to only those whose names contain the query (case-insensitive)", async () => {
  const user = userEvent.setup();
  const docs = [makeDoc("1", "boarding-pass.pdf"), makeDoc("2", "visa.pdf")];
  render(<TripDocsTab tripId="trip-1" docs={docs} />);
  await user.type(screen.getByRole("searchbox"), "BOARDING");
  expect(screen.getByText("boarding-pass.pdf")).toBeInTheDocument();
  expect(screen.queryByText("visa.pdf")).not.toBeInTheDocument();
});

it("restores all docs when search query is cleared", async () => {
  const user = userEvent.setup();
  const docs = [makeDoc("1", "boarding-pass.pdf"), makeDoc("2", "visa.pdf")];
  render(<TripDocsTab tripId="trip-1" docs={docs} />);
  const search = screen.getByRole("searchbox");
  await user.type(search, "boarding");
  await user.clear(search);
  expect(screen.getByText("boarding-pass.pdf")).toBeInTheDocument();
  expect(screen.getByText("visa.pdf")).toBeInTheDocument();
});
```

**Note:** The `DocRow` mock in `trip-docs-tab.test.tsx` renders `{doc.name}` as visible text, so `screen.getByText("boarding-pass.pdf")` will find it.

### Task 6: E2E Scenarios

**Scenario ordering** is critical — scenarios share state within a run (global-setup seeds once per run):

| Order | Scenario | State before | State after |
|-------|----------|--------------|-------------|
| 1 (new) | Search | Seeded "E2E Boarding Pass" present | Unchanged |
| 2 (existing) | Delete | "E2E Boarding Pass" present | Empty list |
| 3 (existing) | Upload | Empty list | "boarding-pass.pdf" present |
| 4 (new) | Rename | "boarding-pass.pdf" present | "boarding-pass.pdf" → "My Boarding Pass" |

**`tests/e2e/features/documents.feature`** — full replacement:

```gherkin
Feature: Document Upload

  Background:
    Given I am signed in
    And I have an existing trip
    And I am on the Documents tab

  Scenario: Search filters the Documents list
    Given the Documents tab has one seeded document
    When I type "xyz" in the search field
    Then the document "E2E Boarding Pass" is not visible in the list
    When I clear the search field
    Then the document "E2E Boarding Pass" is visible in the list

  Scenario: Delete a document from the Documents tab
    Given the Documents tab has one seeded document
    When I delete the document "E2E Boarding Pass"
    Then the document "E2E Boarding Pass" is no longer visible
    And the empty state message is shown

  Scenario: Upload a PDF to the Documents tab
    When I upload a file named "boarding-pass.pdf" with MIME type "application/pdf"
    Then the document "boarding-pass.pdf" appears in the Documents list

  Scenario: Rename a document from the Documents tab
    Given the document "boarding-pass.pdf" is in the Documents tab
    When I rename the document "boarding-pass.pdf" to "My Boarding Pass"
    Then the document "My Boarding Pass" appears in the Documents list
    And the document "boarding-pass.pdf" is no longer visible
```

**`tests/e2e/steps/documents.steps.ts`** — add to the existing file (DO NOT replace existing step defs):

```ts
When("I type {string} in the search field", async ({ page }, query: string) => {
  await page.getByRole("searchbox").fill(query);
});

When("I clear the search field", async ({ page }) => {
  await page.getByRole("searchbox").fill("");
});

Then("the document {string} is visible in the list", async ({ page }, docName: string) => {
  await expect(page.getByText(docName)).toBeVisible({ timeout: 5_000 });
});

Then("the document {string} is not visible in the list", async ({ page }, docName: string) => {
  await expect(page.getByText(docName)).not.toBeVisible({ timeout: 5_000 });
});

Given("the document {string} is in the Documents tab", async ({ page }, docName: string) => {
  await expect(page.getByText(docName)).toBeVisible({ timeout: 5_000 });
});

When("I rename the document {string} to {string}", async ({ page }, oldName: string, newName: string) => {
  await page.getByText(oldName).click();
  const input = page.getByRole("textbox");
  await input.fill(newName);
  await input.press("Enter");
});
```

**Gotcha — `page.getByText(oldName)` during rename:** The name span is the only visible element with that exact text. The Delete button's `aria-label` contains the name but is not visible text, so `getByText` won't match it. This is safe.

**Gotcha — `page.getByRole("textbox")` during rename:** The only textbox in the document at rename time is the inline rename input. The search input uses `type="search"` (role `searchbox`), so there's no ambiguity.

**Gotcha — Rename scenario dependency on Upload scenario:** Rename runs 4th and expects "boarding-pass.pdf" to be present from the Upload scenario (3rd). If Upload is ever skipped, Rename will fail. This is acceptable for the current sequential E2E setup.

**Gotcha — existing "is no longer visible" step conflict:** The rename scenario uses `"And the document 'boarding-pass.pdf' is no longer visible"` — this reuses the existing `Then("the document {string} is no longer visible", ...)` step which checks for the Delete button not being visible. After renaming "boarding-pass.pdf" to "My Boarding Pass", the `Delete boarding-pass.pdf` button no longer exists, so this step passes correctly.

---

## Tasks/Subtasks

- [x] Task 1: Add `renameDocument` server action to `src/app/(app)/trips/[tripId]/actions.ts` (append after `removeDocument`)
- [x] Task 2: Update `doc-row.tsx` with inline rename
  - [x] Add `isEditing`, `editName` state; `cancelRef`
  - [x] Import `renameDocument` from actions
  - [x] Add `handleSave` + `handleRenameKeyDown` functions
  - [x] Replace name `<span>` with conditional span/input
- [x] Task 3: Update `trip-docs-tab.tsx` with search input
  - [x] Add `query` state; `visible` filtered list
  - [x] Add sr-only label + search input (type="search", id="doc-search")
  - [x] Render `visible.map(...)` instead of `docs.map(...)`
- [x] Task 4: Update `doc-row.test.tsx`
  - [x] Add `renameDocument` to mock and import
  - [x] Add 8 rename tests
- [x] Task 5: Update `trip-docs-tab.test.tsx`
  - [x] Update `makeDoc` to accept optional name
  - [x] Add 3 search tests
- [x] Task 6: Update E2E
  - [x] Reorder + add Search and Rename scenarios to `documents.feature`
  - [x] Add 6 new step definitions to `documents.steps.ts`
- [x] Task 7: Run full validation (`npm run test:coverage`, `npm run test:e2e`)

---

## Dev Agent Record

### Implementation Plan

_To be filled in by dev agent_

### Debug Log

_To be filled in by dev agent_

### Completion Notes

All 7 tasks implemented and validated. 692 unit tests pass (coverage ≥95% lines/functions, ≥90% branches). All 4 document E2E scenarios pass (Search, Delete, Upload, Rename). One pre-existing E2E failure in `preferences-date-format` is unrelated to this story. The `toHaveStyle` assertion for CSS custom property `var(--accent-brand)` was adapted to `toHaveAttribute("style", expect.stringContaining(...))` due to jsdom's inability to resolve CSS custom properties in computed styles.

### File List

| File | Change |
|------|--------|
| `src/app/(app)/trips/[tripId]/actions.ts` | Add `renameDocument` action |
| `src/components/packt/doc-row.tsx` | Add inline rename |
| `src/components/packt/doc-row.test.tsx` | Add renameDocument mock + 8 rename tests |
| `src/components/packt/trip-docs-tab.tsx` | Add search input + filter logic |
| `src/components/packt/trip-docs-tab.test.tsx` | Update makeDoc; add 3 search tests |
| `tests/e2e/features/documents.feature` | Reorder + add Search and Rename scenarios |
| `tests/e2e/steps/documents.steps.ts` | Add 6 search/rename step defs |
