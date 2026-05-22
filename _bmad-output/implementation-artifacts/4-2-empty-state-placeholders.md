---
story_id: "4.2"
story_key: "4-2-empty-state-placeholders"
epic: 4
story: 2
title: "Empty State Placeholders — Itinerary Tab and Docs Tab"
status: "done"
created: "2026-05-22"
---

# Story 4.2 — Empty State Placeholders: Itinerary Tab and Docs Tab

## Story

As a **traveler**,
I want informative empty state UI when the itinerary or documents tab has no content,
so that the app feels polished and I know exactly what to do next rather than seeing bare text or a blank surface.

## Acceptance Criteria

**AC1 — shadcn Empty component installed:**
Given the `empty` component is not yet in `src/components/ui/`,
When the story is implemented,
Then `src/components/ui/empty.tsx` exists and exports `Empty`, `EmptyHeader`, `EmptyMedia`, `EmptyTitle`, `EmptyDescription`, and `EmptyContent`; it follows the same structure as other shadcn UI primitives in this project.

**AC2 — Itinerary tab: empty state with action buttons:**
Given `days.length === 0` in `TripItineraryView`,
When the itinerary tab renders,
Then the bare-text `"No itinerary yet."` div is replaced by an `Empty` composition with a Lucide icon, a title `"No itinerary yet"`, a description, and an `EmptyContent` containing three buttons — "Add event", "Add note", "Add checklist" — each showing its icon alongside its text label (not icon-only); clicking each calls the respective callback with `dayNumber: 1`; all colors use CSS custom properties; all Lucide icons use `strokeWidth={1.5}`.

**AC3 — Docs tab: header hidden in empty state; "Add document" in EmptyContent:**
Given `docs.length === 0` in `TripDocsTab`,
When the docs tab renders,
Then:
- The header row (Save offline button + "Add" label) is **not rendered**
- The search bar and search label are **not rendered**
- The hint text line ("PDF, JPG, PNG, WEBP, HEIC · max 25 MB") is **not rendered** in the header position
- An `Empty` composition is rendered with a Lucide icon, a title `"No documents yet"`, the description `"Add your first trip document — boarding passes, insurance, visas, and more."`, and an `EmptyContent` area containing an "Add document" label (styled as a button, wired to `htmlFor="doc-upload"`) and the hint text beneath it
- The hidden `<input id="doc-upload">` file element is **still rendered** regardless of `docs.length` (required for upload to work)

**AC4 — Populated docs state is unchanged:**
Given `docs.length > 0` in `TripDocsTab`,
When the docs tab renders,
Then the header row (Save offline + "Add" label), hint text, and search bar all render as before; the empty state is not shown.

**AC5 — `TripDocsTab` unit tests updated:**
Given the structural changes to `TripDocsTab`,
When the implementation is complete,
Then all tests pass with the following updates:
- "renders empty state message" test now also asserts `screen.getByText("No documents yet")` is present
- "does not render empty state when docs are present" test now also asserts `screen.queryByText("No documents yet")` is absent
- "renders the Add label with visible text" test updated to check for the "Add document" label (rendered in empty state) instead of "Add"
- "file input is associated with the label via htmlFor" test updated: `screen.getByText("Add")` → `screen.getByText("Add document")`, the `for="doc-upload"` assertion is unchanged
- Tests that render with `docs={[]}` and check hint text ("PDF, JPG, PNG, WEBP, HEIC · max 25 MB") continue to pass because hint text is still rendered — just inside the empty state rather than the header

**AC6 — No regressions:**
Given the implementation is complete,
When `npm run build-validator` is run,
Then lint, type-check, and all existing unit tests pass.

---

## Dev Notes

### Install the Empty component

```bash
npx shadcn@latest add empty
```

This project uses the `base-nova` style (see `components.json`). Verify the file lands at `src/components/ui/empty.tsx`; if it ends up elsewhere, move it there. Do not create a duplicate.

### Files to modify

| File | Change |
|------|--------|
| `src/components/ui/empty.tsx` | Created by CLI — keep as-is unless arbitrary Tailwind values need replacing with inline styles |
| `src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx` | Replace bare-text empty state (line 49–51) with `Empty` composition + 3 action buttons |
| `src/components/packt/trip-docs-tab.tsx` | Restructure: header/search hidden when empty; empty state renders with "Add document" in EmptyContent |
| `src/components/packt/trip-docs-tab.test.tsx` | Update several test assertions per AC5 |

No test file is required for `trip-itinerary-view.tsx` — it lives in `src/app/**`, which is excluded from coverage.

### Itinerary empty state

**Current code at `trip-itinerary-view.tsx:49–51` (replace this):**
```tsx
if (days.length === 0) {
  return <div style={{ fontSize: "calc(14px * var(--font-scale))", color: "var(--fg-2)" }}>No itinerary yet.</div>;
}
```

**Replacement — add imports at top, then replace the return:**
```tsx
import { CalendarDays, MapPin, FileText, ListChecks } from "lucide-react";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

// when days.length === 0:
return (
  <Empty>
    <EmptyHeader>
      <EmptyMedia variant="icon">
        <CalendarDays strokeWidth={1.5} />
      </EmptyMedia>
      <EmptyTitle>No itinerary yet</EmptyTitle>
      <EmptyDescription>Start building your plan — add events, notes, or checklists.</EmptyDescription>
    </EmptyHeader>
    <EmptyContent>
      <button
        onClick={() => onAddEvent(1, "")}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "var(--fg-2)", fontFamily: "var(--font-body, ui-sans-serif)", fontSize: "calc(14px * var(--font-scale))", padding: "6px 10px" }}
        title="Add event"
      >
        <MapPin size={15} strokeWidth={1.5} /> Add event
      </button>
      <button
        onClick={() => onAddNote(1, "")}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "var(--fg-2)", fontFamily: "var(--font-body, ui-sans-serif)", fontSize: "calc(14px * var(--font-scale))", padding: "6px 10px" }}
        title="Add note"
      >
        <FileText size={15} strokeWidth={1.5} /> Add note
      </button>
      <button
        onClick={() => onAddChecklist(1, 0)}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "var(--fg-2)", fontFamily: "var(--font-body, ui-sans-serif)", fontSize: "calc(14px * var(--font-scale))", padding: "6px 10px" }}
        title="Add checklist"
      >
        <ListChecks size={15} strokeWidth={1.5} /> Add checklist
      </button>
    </EmptyContent>
  </Empty>
);
```

**Known limitation:** `handleAddEvent`, `handleAddNote`, and `handleAddChecklist` in `page-client.tsx` each begin with `const day = days.find((d) => d.dayNumber === dayNumber); if (!day?.id) return;`. When `days.length === 0` there is no day 1, so all three buttons silently no-op. This is intentional and deferred — a follow-up story will address creating a first day. The buttons are non-destructive and the visual state is correct.

### Docs tab restructure

**Current structure (simplified):**
```tsx
return (
  <div>
    {/* header — always shown */}
    <div className="flex items-center mb-3">
      {docs.length > 0 && <button>Save offline</button>}
      <input id="doc-upload" ... />    {/* hidden file input */}
      <label htmlFor="doc-upload">Add</label>   {/* always shown */}
    </div>
    <div>{/* hint text — always shown */}PDF, JPG, PNG, WEBP, HEIC · max 25 MB</div>
    <div>{/* search bar — always shown */}</div>

    {docs.length === 0 ? (
      <div>Add your first trip document…</div>   // ← replace this whole block
    ) : (
      <div>{/* doc rows */}</div>
    )}
  </div>
);
```

**New structure:**
```tsx
return (
  <div>
    {/* hidden file input — always rendered */}
    <input id="doc-upload" ref={inputRef} type="file" ... onChange={handleFileChange} />

    {docs.length === 0 ? (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileText strokeWidth={1.5} />
          </EmptyMedia>
          <EmptyTitle>No documents yet</EmptyTitle>
          <EmptyDescription>Add your first trip document — boarding passes, insurance, visas, and more.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <label
            htmlFor="doc-upload"
            title="Add document"
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "5px 10px", borderRadius: "var(--radius-sm)",
              border: "1px solid var(--line)", background: "var(--surface)",
              color: "var(--fg)", fontFamily: "var(--font-body, ui-sans-serif)",
              fontSize: "calc(12px * var(--font-scale))", fontWeight: 500,
              cursor: isPending ? "wait" : "pointer", opacity: isPending ? 0.5 : 1,
            }}
          >
            <Plus size={13} strokeWidth={1.5} />
            Add document
          </label>
          <div style={{
            fontSize: "calc(11px * var(--font-scale))",
            color: "var(--fg-2)",
            marginTop: 8,
          }}>
            PDF, JPG, PNG, WEBP, HEIC · max 25 MB
          </div>
        </EmptyContent>
      </Empty>
    ) : (
      <>
        {/* header — only shown when docs exist */}
        <div className="flex items-center mb-3">
          <button onClick={handleSaveOffline} disabled={isSavingOffline} ...>Save offline</button>
          <label htmlFor="doc-upload" title="Add document" style={{ ..., marginLeft: "auto" }}>
            <Plus size={13} strokeWidth={1.5} />
            Add
          </label>
        </div>
        <div style={{ textAlign: "right", fontSize: "calc(11px * var(--font-scale))", color: "var(--fg-2)", marginBottom: 8 }}>
          PDF, JPG, PNG, WEBP, HEIC · max 25 MB
        </div>
        <div style={{ position: "relative", marginBottom: 12 }}>
          <label htmlFor="doc-search" style={{ /* sr-only */ }}>Search documents</label>
          <input id="doc-search" type="search" ... />
        </div>
        <div>
          {visible.map((doc) => <DocRow key={doc.id} doc={doc} />)}
        </div>
      </>
    )}
  </div>
);
```

Key points:
- The `<input id="doc-upload">` must be **outside** the conditional so it's always in the DOM — both the header "Add" label (populated state) and the empty state "Add document" label reference it via `htmlFor="doc-upload"`
- The `label` style in the empty state's `EmptyContent` mirrors the existing "Add" label style exactly, but with text "Add document" and no `marginLeft: "auto"`
- The hint text `"PDF, JPG, PNG, WEBP, HEIC · max 25 MB"` moves to `EmptyContent` so tests that render with `docs={[]}` and assert it (`screen.getByText(...)`) continue to pass
- Add imports: `import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";` and `import { FileText } from "lucide-react";` (FileText is already imported in the file via the Plus icon — confirm and add only what's missing)

### Styling guard rails

- **No hardcoded hex/rgb** — if the CLI-generated `empty.tsx` uses Tailwind utilities that map to shadcn CSS vars (`text-muted-foreground`, etc.), that is fine; they resolve to custom properties via `globals.css`.
- **No arbitrary Tailwind values** — replace any `text-[14px]` or similar in the generated file with inline styles using the font-scale pattern.
- **Lucide icons**: always `strokeWidth={1.5}`.
- The buttons in the itinerary empty state use `background: "none"` and `border: "none"` — not Tailwind button variants — matching the GapZone's minimal interactive style.

### Test updates for `trip-docs-tab.test.tsx`

**Tests that need changes due to the restructure:**

| Test (line) | Change required |
|---|---|
| "renders empty state message when docs array is empty" (L38) | Add: `expect(screen.getByText("No documents yet")).toBeInTheDocument()` |
| "does not render empty state when docs are present" (L45) | Add: `expect(screen.queryByText("No documents yet")).not.toBeInTheDocument()` |
| "renders the Add label with visible text" (L57) | Change `getByText("Add")` → `getByText("Add document")` (rendered in empty state) |
| "file input is associated with the label via htmlFor" (L68) | Change `screen.getByText("Add").closest("label")` → `screen.getByText("Add document").closest("label")` |

**Tests that continue to pass without changes:**
- "file input accepts the correct file types" (L62) — uses `document.getElementById("doc-upload")` directly, not affected
- "calls uploadDocument when a file is selected" (L74) — fires change on `#doc-upload` directly, not affected
- "shows file type and size hint text when there is no error" (L131) — hint text is still rendered in `EmptyContent`, so `getByText("PDF, JPG, PNG, WEBP, HEIC · max 25 MB")` still finds it
- "always shows the hint text regardless of errors" (L160) — same reason

**No new E2E scenario needed.** This is a visual restructure of existing empty states with no new server/client boundary flow.

### References

- [Source: src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx:49–51] — current bare-text itinerary empty state
- [Source: src/components/packt/trip-docs-tab.tsx:50–180] — current docs tab structure including header, hint, search, empty state
- [Source: src/components/packt/trip-docs-tab.test.tsx:38–72, 131–168] — tests that require updates
- [Source: src/app/(app)/trips/[tripId]/page-client.tsx:103–145] — handleAddEvent/handleAddNote/handleAddChecklist with the `if (!day?.id) return` guard
- [Source: src/components/packt/gap-zone.tsx] — TypePicker shows icon-only; empty state buttons should have text too
- [Source: src/components/packt/type-picker.tsx] — MapPin=event, FileText=note, ListChecks=checklist icons
- [Source: _bmad-output/project-context.md#Styling] — color token rules, no-arbitrary-Tailwind rule
- [Source: components.json] — style: `base-nova`, iconLibrary: `lucide`

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- AC1: `src/components/ui/empty.tsx` installed via `npx shadcn@latest add empty`; no arbitrary Tailwind values present.
- AC2: `trip-itinerary-view.tsx` itinerary empty state replaced with `Empty` composition + 3 action buttons (Add event, Add note, Add checklist). Silent no-op on click when `days.length === 0` is intentional per known limitation in dev notes.
- AC3/AC4: `trip-docs-tab.tsx` restructured — hidden file input always rendered outside conditional; empty state shows `Empty` composition with "Add document" label and hint text; populated state shows header/search/hint as before.
- AC5: Four test assertions updated in `trip-docs-tab.test.tsx` per spec.
- AC6: 817 tests pass, lint/tsc/build clean.

### File List

- `src/components/ui/empty.tsx` — created (shadcn CLI)
- `src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx` — AC2
- `src/components/packt/trip-docs-tab.tsx` — AC3/AC4
- `src/components/packt/trip-docs-tab.test.tsx` — AC5
