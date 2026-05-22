---
story_id: "3.1"
story_key: "3-1-attach-an-existing-trip-document-to-an-event"
epic: 3
story: 1
title: "Attach an Existing Trip Document to an Event"
status: "ready-for-dev"
created: "2026-05-21"
---

# Story 3.1 — Attach an Existing Trip Document to an Event

## Story

As a **traveler**,
I want to pick a document I've already uploaded when attaching a file to an itinerary event,
so that I don't have to upload the same file twice.

## Acceptance Criteria

**AC1 — Pick list shown when trip-level docs exist:**
Given I tap "Attach" on an event that has no attached documents,
And there are trip-level documents available,
When the `AddDocDialog` opens,
Then it shows a pick list of existing trip-level docs first (each showing `DocKindBadge` + name), with an "Upload new instead" toggle below (FR12, UX-DR6)

**AC2 — Selecting from pick list attaches and closes:**
Given the pick list is displayed,
When I select a document from it,
Then `attachTripDocToEvent(docId, eventId)` is called; the document's `eventId` is set in the database (moving it from trip-level to event-linked — no dual membership); the dialog closes (FR12, FR13)

**AC3 — Upload new instead toggle:**
Given I tap "Upload new instead" in the pick list panel,
When the toggle activates,
Then the dialog switches to the upload panel (file input identical to the standalone TripDocsTab upload flow); the file is uploaded via `uploadDocumentToEvent(eventId, formData)` and attached to the event

**AC4 — No trip-level docs → upload mode directly:**
Given there are no trip-level documents,
When the `AddDocDialog` opens for an event,
Then it opens directly in upload mode — no pick list is shown

**AC5 — Focus management in pick list:**
Given the pick list panel opens,
When focus is managed,
Then focus moves to the first list item on open; Escape closes the dialog and returns focus to the trigger (NFR7)

**AC6 — AddDocDialog declares correct interface:**
Given the `AddDocDialog` is updated,
When inspected,
Then it declares `"use client"`; defines `AddDocDialogProps` with `eventId: string`, `tripDocs?: Document[]`; `tripDocs` is passed from `place-row.tsx` which receives it from `PlaceRow`'s new `tripDocs?: Document[]` prop (NFR1)

**AC7 — Test coverage:**
Given the story implementation is complete,
When tests are run,
Then unit tests for pick-mode panel, upload-mode toggle, and `attachTripDocToEvent` pass with ≥95% line coverage (NFR9); a Playwright BDD scenario covering "attach existing doc to event" exists in `tests/e2e/features/event-docs.feature` and passes (NFR10)

---

## Dev Notes

### Architecture Overview

Story 3.1 wires trip-level documents into the event document flow. The key challenge is threading `tripDocs` (trip-scoped docs) through the component tree so `AddDocDialog` can display the pick list. Two new server actions are needed.

**Data flow for `tripDocs`:**
```
TripDetailPayload.docs (all docs)
  └─ TripDetailTabBody  ← filter to scope="trip" HERE
       └─ TripItineraryView  ← new tripDocs prop
            └─ DayCard  ← new tripDocs prop
                 └─ SortablePlaceRow  ← auto via React.ComponentProps<typeof PlaceRow> (NO CHANGE NEEDED)
                      └─ PlaceRow  ← new tripDocs prop
                           └─ AddDocDialog  ← new tripDocs + eventId props
```

**Key insight on SortablePlaceRow:** `day-card-sortables.tsx` defines `SortablePlaceRow` as:
```tsx
export function SortablePlaceRow(props: React.ComponentProps<typeof PlaceRow>) { ... }
```
It uses `ComponentProps<typeof PlaceRow>` and spreads `{...props}` onto `<PlaceRow>`. Adding `tripDocs` to `PlaceRowProps` automatically makes it available to `SortablePlaceRow` with **zero changes** to `day-card-sortables.tsx`.

---

### Task 1: Add two new server actions to `src/app/(app)/trips/[tripId]/actions.ts`

**Action 1 — `attachTripDocToEvent`:**
Sets `eventId` on an existing trip-level document (hard promote: no dual membership).

```ts
export async function attachTripDocToEvent(docId: string, eventId: string) {
  const user = await requireUser();
  const tripId = await getEventTripId(eventId);
  await assertTripAccess(tripId, user.id!, "editor");
  await db.update(documents).set({ eventId }).where(eq(documents.id, docId));
  revalidatePath(`/trips/${tripId}`);
}
```

Add the import: `import { eq, and, max, gte, sql, isNull } from "drizzle-orm"` already covers `eq`. The `documents` table is already imported. No new imports needed.

**Action 2 — `uploadDocumentToEvent`:**
Uploads a file to Blob (or stub) and inserts as an event-linked document.

```ts
export async function uploadDocumentToEvent(eventId: string, formData: FormData) {
  const user = await requireUser();
  const tripId = await getEventTripId(eventId);
  await assertTripAccess(tripId, user.id!, "editor");

  const file = formData.get("file") as File;
  if (!(file instanceof File)) throw new Error("No file provided");

  const name = file.name;
  const kind = inferDocKind(file.type);
  const size = formatFileSize(file.size);

  if (file.size > MAX_UPLOAD_BYTES) throw new Error("File exceeds 25 MB limit");

  let url: string;
  if (process.env.UPLOAD_STUB === "true") {
    const { writeFile, mkdir } = await import("fs/promises");
    const { join, basename } = await import("path");
    const uploadsDir = join(process.cwd(), "public", "uploads");
    await mkdir(uploadsDir, { recursive: true });
    const safeName = basename(name).replace(/[^\w.-]/g, "_");
    const randomSuffix = Math.random().toString(36).slice(2, 8);
    const uniqueName = `${Date.now()}-${randomSuffix}-${safeName}`;
    await writeFile(join(uploadsDir, uniqueName), Buffer.from(await file.arrayBuffer()));
    url = `/uploads/${encodeURIComponent(uniqueName)}`;
  } else {
    const { put } = await import("@vercel/blob");
    const result = await put(name, file, { access: "public" });
    url = result.url;
  }

  await db.insert(documents).values({ tripId, eventId, name, kind, size, url });
  revalidatePath(`/trips/${tripId}`);
}
```

**Why duplicate the UPLOAD_STUB logic instead of extracting it?** This story scopes are tight. The blob stub logic is ~10 lines and extracting it adds abstraction without immediate need. It can be refactored in a later cleanup story.

---

### Task 2: Update `src/components/packt/add-doc-dialog.tsx`

**Current state (130 lines):**
- Props: `eventName?: string`, `open`, `onOpenChange`
- Single mode: Name text input + PDF/Image/Doc type picker
- `handleAdd()` closes dialog (placeholder comment says "until Story 3.1")
- No real attachment logic

**New props interface:**
```tsx
export interface AddDocDialogProps {
  eventId: string;              // NEW — required for both attach and upload
  eventName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripDocs?: Document[];        // NEW — if non-empty, show pick list first
}
```

**New state:**
```tsx
type DialogMode = "pick" | "upload";

const defaultMode = (): DialogMode =>
  (tripDocs?.length ?? 0) > 0 ? "pick" : "upload";

const [mode, setMode] = useState<DialogMode>(defaultMode);
```

**Reset on close — update `handleClose`:**
```tsx
function handleClose(o: boolean) {
  if (!o) {
    setMode(defaultMode());   // reset mode on close
    setPendingFile(null);     // clear any selected file
  }
  onOpenChange(o);
}
```

**Pick list panel (render when `mode === "pick"`):**
```tsx
// Pick list mode
{mode === "pick" && (
  <>
    <div
      ref={firstItemRef}     // focus target on open (see focus management below)
      className="flex flex-col gap-1"
    >
      {(tripDocs ?? []).map((doc) => (
        <button
          key={doc.id}
          onClick={() => handlePickDoc(doc.id)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 10px",
            borderRadius: 6,
            border: "1px solid var(--line)",
            background: "var(--surface)",
            cursor: "pointer",
            textAlign: "left",
            minHeight: 44,
            color: "var(--fg)",
          }}
        >
          <DocKindBadge kind={doc.kind} />
          <span style={{ fontSize: "calc(13px * var(--font-scale))", fontWeight: 500 }}>
            {doc.name}
          </span>
        </button>
      ))}
    </div>
    <button
      onClick={() => setMode("upload")}
      style={{
        background: "none",
        border: "none",
        color: "var(--fg-3)",
        fontSize: "calc(12px * var(--font-scale))",
        cursor: "pointer",
        padding: "4px 0",
        textDecoration: "underline",
      }}
    >
      Upload new instead
    </button>
  </>
)}
```

**Upload panel (render when `mode === "upload"`):**
```tsx
// Upload mode — same file-picker UX as TripDocsTab
{mode === "upload" && (
  <>
    <input
      ref={fileInputRef}
      type="file"
      accept=".pdf,.jpg,.jpeg,.png,.webp,.heic"
      style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1,
               overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0 }}
      onChange={handleFileChange}
    />
    <div
      onClick={() => fileInputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}
      style={{
        border: "1.5px dashed var(--line-strong)",
        borderRadius: 6,
        padding: "12px 16px",
        cursor: "pointer",
        color: pendingFile ? "var(--fg)" : "var(--fg-4)",
        fontSize: "calc(13px * var(--font-scale))",
        textAlign: "center",
      }}
    >
      {pendingFile ? pendingFile.name : "Choose file (PDF, JPG, PNG, WEBP, HEIC)"}
    </div>
    {(tripDocs?.length ?? 0) > 0 && (
      <button
        onClick={() => setMode("pick")}
        style={{
          background: "none", border: "none",
          color: "var(--fg-3)", fontSize: "calc(12px * var(--font-scale))",
          cursor: "pointer", padding: "4px 0", textDecoration: "underline",
        }}
      >
        ← Choose existing instead
      </button>
    )}
  </>
)}
```

**Handler functions:**
```tsx
const fileInputRef = useRef<HTMLInputElement>(null);
const firstItemRef = useRef<HTMLButtonElement>(null);  // for focus management
const [pendingFile, setPendingFile] = useState<File | null>(null);
const [isUploading, startTransition] = useTransition();

function handlePickDoc(docId: string) {
  startTransition(async () => {
    await attachTripDocToEvent(docId, eventId);
  });
  handleClose(false);
}

function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0];
  if (!file) return;
  if (file.size > MAX_UPLOAD_BYTES) {
    toast.error("File is too large. Max 25 MB.");
    if (fileInputRef.current) fileInputRef.current.value = "";
    return;
  }
  setPendingFile(file);
}

function handleUpload() {
  if (!pendingFile) return;
  const formData = new FormData();
  formData.append("file", pendingFile);
  startTransition(async () => {
    try {
      await uploadDocumentToEvent(eventId, formData);
    } catch {
      toast.error("Upload failed. Please try again.");
    }
  });
  handleClose(false);
}
```

**Focus management for pick list (NFR7):**
```tsx
// Auto-focus first pick item when mode switches to "pick"
useEffect(() => {
  if (open && mode === "pick") {
    // Small timeout to let the DOM render before focusing
    const t = setTimeout(() => firstItemRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }
}, [open, mode]);
```

Apply `ref={firstItemRef}` to the FIRST doc button in the pick list. Since we're mapping `tripDocs`, this needs a conditional ref:
```tsx
{(tripDocs ?? []).map((doc, idx) => (
  <button
    key={doc.id}
    ref={idx === 0 ? firstItemRef : undefined}
    onClick={() => handlePickDoc(doc.id)}
    // ...
  >
```

**Footer in pick mode — Cancel only:**
```tsx
<DialogFooter>
  <Button variant="ghost" onClick={() => handleClose(false)}>Cancel</Button>
</DialogFooter>
```

**Footer in upload mode — Cancel + Attach:**
```tsx
<DialogFooter>
  <Button variant="ghost" onClick={() => handleClose(false)}>Cancel</Button>
  <Button onClick={handleUpload} disabled={!pendingFile || isUploading}>
    <Paperclip size={13} strokeWidth={1.5} aria-hidden="true" />
    Attach
  </Button>
</DialogFooter>
```

**New imports needed:**
```tsx
import { useRef, useState, useEffect, useTransition } from "react";
import { toast } from "sonner";
import type { Document } from "@/data/types";
import { DocKindBadge } from "./doc-kind-badge";
import { attachTripDocToEvent, uploadDocumentToEvent } from "@/app/(app)/trips/[tripId]/actions";
import { MAX_UPLOAD_BYTES } from "@/lib/utils";
```

**Preserve existing behavior:**
- The old `draftName`, `draftKind` state and the Name/Kind form are **REMOVED** — this is a wholesale redesign of the component
- The existing `handleAdd` with its comment is removed
- `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter` stay (same shadcn imports)

**What happens to existing tests for AddDocDialog?**
The existing 8 tests (`renders name input and type buttons`, `Attach disabled when empty`, etc.) test the OLD upload form UI that's being replaced. These tests MUST be updated or removed since the Name/Kind form no longer exists.
- Replace all existing tests with new tests covering pick mode and upload mode
- See Task 6 for full test replacement

---

### Task 3: Update `src/components/packt/place-row.tsx`

**Add `tripDocs` prop to `PlaceRowProps`:**
```tsx
export interface PlaceRowProps {
  place: TripEvent;
  dayDate?: string;
  isLast?: boolean;
  onUpdate: (event: TripEvent) => void;
  onDelete: (id: string) => void;
  onDeleteDoc?: (docId: string) => void;
  dragHandle?: React.ReactNode;
  id?: string;
  isDraft?: boolean;
  onCreate?: (name: string) => void;
  onCancelDraft?: () => void;
  tripDocs?: Document[];        // NEW
}
```

**Add `tripDocs` to destructuring** (line 48 area):
```tsx
export function PlaceRow({
  place: p,
  dayDate,
  isLast,
  onUpdate,
  onDelete,
  onDeleteDoc,
  dragHandle,
  id,
  isDraft,
  onCreate,
  onCancelDraft,
  tripDocs,           // NEW
}: PlaceRowProps) {
```

**Update `AddDocDialog` usage** (line 273 area):
```tsx
// BEFORE:
<AddDocDialog eventName={p.name} open={showAddDocDialog} onOpenChange={setShowAddDocDialog} />

// AFTER:
<AddDocDialog
  eventId={p.id}
  eventName={p.name}
  open={showAddDocDialog}
  onOpenChange={setShowAddDocDialog}
  tripDocs={tripDocs}
/>
```

**Add `Document` import** to the existing type import:
```tsx
import { type TripEvent, type Document } from "@/data/types";
```

**No changes needed to `place-row.test.tsx`** — the existing mock for `AddDocDialog` uses `({ open, onOpenChange }) => ...` which ignores the new `eventId` and `tripDocs` props. Extra props are silently discarded. No existing tests break. No new tests are required for `PlaceRow` for this story (the new behavior lives inside `AddDocDialog` which is mocked).

---

### Task 4: Update `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx`

**Add `tripDocs` computation and pass to TripItineraryView:**

```tsx
// BEFORE: TripItineraryView is rendered without tripDocs
<TripItineraryView
  days={days}
  dateFormat={dateFormat}
  // ...other props
/>

// AFTER:
<TripItineraryView
  days={days}
  dateFormat={dateFormat}
  tripDocs={docs.filter((d) => d.scope === "trip")}   // NEW
  // ...other props
/>
```

No prop interface change needed for `TripDetailTabBodyProps` itself — `docs` is already there, we just compute `tripDocs` inline.

---

### Task 5: Update `src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx`

**Add `tripDocs` to interface and pass to DayCard:**

```tsx
export interface TripItineraryViewProps {
  days: DayItinerary[];
  dateFormat?: string;
  tripDocs?: Document[];   // NEW
  onUpdateEvent: ...
  // ... rest unchanged
}

export function TripItineraryView({
  days,
  dateFormat,
  tripDocs,           // NEW
  onUpdateEvent,
  // ...rest
}: TripItineraryViewProps) {
  // ...
  return (
    <div>
      {days.map((day) => (
        <DayCard
          key={day.dayNumber}
          day={day}
          dateFormat={dateFormat}
          tripDocs={tripDocs}      // NEW
          onUpdateEvent={onUpdateEvent}
          // ...rest unchanged
        />
      ))}
    </div>
  );
}
```

Add `Document` to the import from `@/data/types`.

---

### Task 6: Update `src/components/packt/day-card.tsx`

**Add `tripDocs` to `DayCardProps` and pass to `SortablePlaceRow`:**

```tsx
interface DayCardProps {
  day: DayItinerary;
  dateFormat?: string;
  tripDocs?: Document[];   // NEW
  onUpdateEvent: ...
  // ... rest unchanged
}

export function DayCard({
  day: d,
  dateFormat = "MM/DD/YYYY",
  tripDocs,                // NEW
  onUpdateEvent,
  // ... rest
}: DayCardProps) {
```

Pass to `SortablePlaceRow` (line ~319):
```tsx
<SortablePlaceRow
  id={`event-${entry.item.data.id}`}
  place={entry.item.data}
  dayDate={d.date}
  isLast={isLast}
  onUpdate={onUpdateEvent}
  onDelete={onDeleteEvent}
  onDeleteDoc={onDeleteDoc}
  tripDocs={tripDocs}      // NEW
/>
```

Add `Document` to the import from `@/data/types`.

**`day-card.test.tsx` changes:** Read the test file before implementing. Add `tripDocs={[]}` (or omit it — it's optional) to test render calls where it's relevant. Existing tests should pass without changes since `tripDocs` is optional.

---

### Task 7: Update `src/components/packt/add-doc-dialog.test.tsx`

The existing tests cover the OLD Name/Kind form UI which is being replaced. **Replace ALL existing tests** with tests for the new pick/upload modes.

**New test structure:**
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mocks (keep existing @/components/ui/dialog mock)
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open, onOpenChange }) =>
    open ? (
      <>
        {children}
        <button data-testid="dialog-backdrop-close" onClick={() => onOpenChange?.(false)} />
      </>
    ) : null,
  DialogContent: ({ children }) => <>{children}</>,
  DialogHeader: ({ children }) => <>{children}</>,
  DialogTitle: ({ children }) => <>{children}</>,
  DialogFooter: ({ children }) => <>{children}</>,
}));

// Mock server actions
vi.mock("@/app/(app)/trips/[tripId]/actions", () => ({
  attachTripDocToEvent: vi.fn().mockResolvedValue(undefined),
  uploadDocumentToEvent: vi.fn().mockResolvedValue(undefined),
}));

// Mock sonner toast
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { AddDocDialog } from "./add-doc-dialog";
import { attachTripDocToEvent, uploadDocumentToEvent } from "@/app/(app)/trips/[tripId]/actions";

const makeDoc = (overrides = {}) => ({
  id: "doc-1",
  name: "Boarding Pass.pdf",
  kind: "pdf" as const,
  scope: "trip" as const,
  offline: false,
  ...overrides,
});
```

**Pick mode tests:**
```tsx
describe("pick mode", () => {
  it("shows pick list when tripDocs are provided", () => {
    render(
      <AddDocDialog
        open
        eventId="ev-1"
        onOpenChange={vi.fn()}
        tripDocs={[makeDoc()]}
      />
    );
    expect(screen.getByText("Boarding Pass.pdf")).toBeInTheDocument();
  });

  it("shows Upload new instead toggle in pick mode", () => {
    render(
      <AddDocDialog open eventId="ev-1" onOpenChange={vi.fn()} tripDocs={[makeDoc()]} />
    );
    expect(screen.getByRole("button", { name: /upload new instead/i })).toBeInTheDocument();
  });

  it("shows Cancel button in pick mode", () => {
    render(
      <AddDocDialog open eventId="ev-1" onOpenChange={vi.fn()} tripDocs={[makeDoc()]} />
    );
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("clicking a doc in pick list calls attachTripDocToEvent and closes", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <AddDocDialog
        open
        eventId="ev-1"
        onOpenChange={onOpenChange}
        tripDocs={[makeDoc({ id: "doc-1", name: "Boarding Pass.pdf" })]}
      />
    );
    await user.click(screen.getByText("Boarding Pass.pdf"));
    expect(attachTripDocToEvent).toHaveBeenCalledWith("doc-1", "ev-1");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("Cancel closes the dialog in pick mode", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <AddDocDialog open eventId="ev-1" onOpenChange={onOpenChange} tripDocs={[makeDoc()]} />
    );
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("Upload new instead switches to upload mode", async () => {
    const user = userEvent.setup();
    render(
      <AddDocDialog open eventId="ev-1" onOpenChange={vi.fn()} tripDocs={[makeDoc()]} />
    );
    await user.click(screen.getByRole("button", { name: /upload new instead/i }));
    expect(screen.getByRole("button", { name: /attach/i })).toBeInTheDocument();
  });

  it("renders DocKindBadge for each doc in pick list", () => {
    render(
      <AddDocDialog
        open
        eventId="ev-1"
        onOpenChange={vi.fn()}
        tripDocs={[
          makeDoc({ id: "d1", name: "Pass.pdf", kind: "pdf" }),
          makeDoc({ id: "d2", name: "Ticket.jpg", kind: "image" }),
        ]}
      />
    );
    expect(screen.getByText("Pass.pdf")).toBeInTheDocument();
    expect(screen.getByText("Ticket.jpg")).toBeInTheDocument();
  });
});
```

**Upload mode tests:**
```tsx
describe("upload mode", () => {
  it("opens directly in upload mode when no tripDocs provided", () => {
    render(<AddDocDialog open eventId="ev-1" onOpenChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /attach/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /upload new instead/i })).not.toBeInTheDocument();
  });

  it("opens directly in upload mode when tripDocs is empty array", () => {
    render(<AddDocDialog open eventId="ev-1" onOpenChange={vi.fn()} tripDocs={[]} />);
    expect(screen.getByRole("button", { name: /attach/i })).toBeInTheDocument();
  });

  it("Attach button disabled when no file selected", () => {
    render(<AddDocDialog open eventId="ev-1" onOpenChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /attach/i })).toBeDisabled();
  });

  it("Cancel closes dialog in upload mode", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<AddDocDialog open eventId="ev-1" onOpenChange={onOpenChange} />);
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows Choose existing instead link when tripDocs available", async () => {
    const user = userEvent.setup();
    render(
      <AddDocDialog open eventId="ev-1" onOpenChange={vi.fn()} tripDocs={[makeDoc()]} />
    );
    // Switch to upload mode first
    await user.click(screen.getByRole("button", { name: /upload new instead/i }));
    expect(screen.getByRole("button", { name: /choose existing instead/i })).toBeInTheDocument();
  });

  it("Choose existing instead switches back to pick mode", async () => {
    const user = userEvent.setup();
    render(
      <AddDocDialog open eventId="ev-1" onOpenChange={vi.fn()} tripDocs={[makeDoc()]} />
    );
    await user.click(screen.getByRole("button", { name: /upload new instead/i }));
    await user.click(screen.getByRole("button", { name: /choose existing instead/i }));
    expect(screen.getByText("Boarding Pass.pdf")).toBeInTheDocument();
  });

  it("shows eventName as subtitle when provided", () => {
    render(
      <AddDocDialog open eventId="ev-1" eventName="Museum visit" onOpenChange={vi.fn()} />
    );
    expect(screen.getByText("Museum visit")).toBeInTheDocument();
  });

  it("file too large shows toast error", async () => {
    const { toast } = await import("sonner");
    const user = userEvent.setup();
    render(<AddDocDialog open eventId="ev-1" onOpenChange={vi.fn()} />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    // Create a large file (26 MB > 25 MB limit)
    const largeFile = new File([new ArrayBuffer(26 * 1024 * 1024)], "big.pdf", { type: "application/pdf" });
    await user.upload(fileInput, largeFile);
    expect(toast.error).toHaveBeenCalledWith("File is too large. Max 25 MB.");
  });
});
```

**Focus management test:**
```tsx
describe("focus management", () => {
  it("focuses first pick item when dialog opens with tripDocs", async () => {
    render(
      <AddDocDialog
        open
        eventId="ev-1"
        onOpenChange={vi.fn()}
        tripDocs={[makeDoc({ name: "Boarding Pass.pdf" })]}
      />
    );
    // Use waitFor to handle the setTimeout(50ms) focus delay
    await waitFor(
      () => {
        const firstBtn = screen.getByRole("button", { name: /Boarding Pass\.pdf/i });
        expect(document.activeElement).toBe(firstBtn);
      },
      { timeout: 500 }
    );
  });
});
```

---

### Task 8: E2E seed data and global setup

**`tests/e2e/e2e-seed-data.ts` — add E2E_EVENT:**
```ts
export const E2E_EVENT = {
  name: "E2E Event",
  position: 0,
};
```

**`tests/e2e/global-setup.ts` — insert event on Day 1:**

Add `events` to the drizzle schema import:
```ts
import { users, trips, days, events, collaborators, userLoyaltyNumbers, userCompanions, documents } from "../../src/db/schema";
```

Add `E2E_EVENT` to the seed data import:
```ts
import { E2E_USER, E2E_TRIP, E2E_DAYS, E2E_LOYALTY_NUMBER, E2E_COMPANION, E2E_DOCUMENT, E2E_EVENT } from "./e2e-seed-data";
```

After the days loop (and before the document insert), add:
```ts
// Seed an event on Day 1 for event-doc integration tests
const [day1] = await db
  .select({ id: days.id })
  .from(days)
  .where(and(eq(days.tripId, trip.id), eq(days.dayNumber, 1)));
await db.insert(events).values({
  dayId: day1.id,
  tripId: trip.id,
  name: E2E_EVENT.name,
  position: E2E_EVENT.position,
});
```

Add `and` to the drizzle-orm import (check if it's already there). Also import `eq` — both are already imported from `"drizzle-orm"` in the file (via `sql`). Actually check the current global-setup imports: it uses `sql` from drizzle-orm but not `and`/`eq`. Add them:
```ts
import { sql, eq, and } from "drizzle-orm";
```

---

### Task 9: E2E feature file and step definitions

**Create `tests/e2e/features/event-docs.feature`:**
```gherkin
Feature: Event Document Integration

  Background:
    Given I am signed in
    And I have an existing trip

  Scenario: Pick list appears when attaching a doc to an event
    Given I am on the Itinerary tab
    And I expand Day 1
    When I click the Attach button on "E2E Event"
    Then the pick list panel shows "E2E Boarding Pass"

  Scenario: Selecting a doc from pick list attaches it and closes the dialog
    Given I am on the Itinerary tab
    And I expand Day 1
    When I click the Attach button on "E2E Event"
    And I select "E2E Boarding Pass" from the pick list
    Then the AddDocDialog is closed
    And the event "E2E Event" shows 1 doc

  Scenario: Upload new instead switches to file upload panel
    Given I am on the Itinerary tab
    And I expand Day 1
    When I click the Attach button on "E2E Event"
    Then the pick list panel shows "E2E Boarding Pass"
    When I click "Upload new instead"
    Then the upload panel is shown with the Attach button

  Scenario: No pick list when no trip-level docs exist
    Given I am on the Itinerary tab
    And I expand Day 1
    And all trip-level documents have been deleted
    When I click the Attach button on "E2E Event"
    Then the upload panel is shown with the Attach button
    And the pick list is not visible
```

**Note:** The "all trip-level documents have been deleted" scenario is complex in E2E. Consider simplifying to just the first 3 scenarios if the 4th is too brittle. The first 3 cover the core happy path.

**Create `tests/e2e/steps/event-docs.steps.ts`:**
```ts
import { expect } from "@playwright/test";
import { Given, When, Then } from "../fixtures";

Given("I am on the Itinerary tab", async ({ page }) => {
  await page.getByRole("button", { name: "Itinerary" }).click();
  await page.waitForTimeout(500); // wait for tab content
});

Given("I expand Day 1", async ({ page }) => {
  // Day 1 header has the date text — click to toggle open
  // DayCard starts closed when not today. Click the toggle button.
  const day1Header = page.locator("[data-day-number='1']").first();
  // Fallback: find button containing "Day 1" or "Jul 1"
  const toggleBtn = page.getByRole("button", { name: /jul 1|day 1/i }).first();
  await toggleBtn.click();
  // Wait for PlaceRow to appear
  await expect(page.getByText("E2E Event")).toBeVisible({ timeout: 5_000 });
});

When("I click the Attach button on {string}", async ({ page }, eventName: string) => {
  // The Attach button is a title="Attach document" button in PlaceRowActionBar
  // It's near the event name — use a more targeted selector
  const row = page.locator("div").filter({ hasText: eventName }).first();
  await row.getByTitle("Attach document").click();
});

Then("the pick list panel shows {string}", async ({ page }, docName: string) => {
  await expect(page.getByRole("button", { name: docName })).toBeVisible({ timeout: 5_000 });
});

When("I select {string} from the pick list", async ({ page }, docName: string) => {
  await page.getByRole("button", { name: docName }).click();
});

Then("the AddDocDialog is closed", async ({ page }) => {
  await expect(page.getByText("Attach document")).not.toBeVisible({ timeout: 5_000 });
});

Then("the event {string} shows {int} doc", async ({ page }, eventName: string, count: number) => {
  await expect(
    page.getByRole("button", { name: new RegExp(`${count} doc`, "i") })
  ).toBeVisible({ timeout: 10_000 });
});

When("I click {string}", async ({ page }, buttonText: string) => {
  await page.getByRole("button", { name: buttonText }).click();
});

Then("the upload panel is shown with the Attach button", async ({ page }) => {
  await expect(page.getByRole("button", { name: /attach/i })).toBeVisible({ timeout: 5_000 });
});

Then("the pick list is not visible", async ({ page }) => {
  await expect(page.getByRole("button", { name: /upload new instead/i })).not.toBeVisible({ timeout: 3_000 });
});
```

**Implementation note on Day 1 toggle:** The exact accessible name of the DayCard toggle button depends on `DayCardHeader`'s implementation. Read `src/components/packt/day-card-header.tsx` before writing the step. Look for the `onToggle` button's text content or aria-label. The day-card renders with `dateDisplay = "Wed, Jul 1"` for Day 1. The step definition above uses a fallback `.first()` selector — update it to match the actual accessible name.

---

### Architecture & Conventions Compliance

| Rule | Compliance |
|------|-----------|
| `"use client"` at top | `AddDocDialog` already has it ✓; no change needed |
| Explicit `ComponentNameProps` interface | `AddDocDialogProps` updated with `eventId: string`, `tripDocs?: Document[]` ✓ |
| No hardcoded hex/rgb | All colors via `var(--fg)`, `var(--line)`, `var(--surface)`, `var(--fg-3)` ✓ |
| `cn()` for className merging | Not needed — using inline styles for dynamic values ✓ |
| Lucide icons `strokeWidth={1.5}` | `<Paperclip size={13} strokeWidth={1.5} />` already in footer ✓ |
| 44px min touch targets | Doc pick buttons: `minHeight: 44` ✓; toggle buttons: use padding ✓ |
| Focus management (NFR7) | `useEffect` focuses first item; Escape handled by Dialog primitive ✓ |
| Types in `src/data/types.ts` | Using existing `Document` type — no new types needed ✓ |
| Server actions in `actions.ts` | Both new actions in `src/app/(app)/trips/[tripId]/actions.ts` ✓ |

---

### File Changes Summary

| File | Change Type | Summary |
|------|-------------|---------|
| `src/app/(app)/trips/[tripId]/actions.ts` | UPDATE | Add `attachTripDocToEvent` and `uploadDocumentToEvent` |
| `src/components/packt/add-doc-dialog.tsx` | UPDATE | Redesign with pick/upload modes |
| `src/components/packt/add-doc-dialog.test.tsx` | UPDATE | Replace all tests with pick/upload mode coverage |
| `src/components/packt/place-row.tsx` | UPDATE | Add `tripDocs?: Document[]` prop; pass to `AddDocDialog` with `eventId` |
| `src/components/packt/day-card.tsx` | UPDATE | Add `tripDocs?: Document[]` prop; pass to `SortablePlaceRow` |
| `src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx` | UPDATE | Add `tripDocs?: Document[]` prop; pass to `DayCard` |
| `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx` | UPDATE | Compute `tripDocs` from `docs`; pass to `TripItineraryView` |
| `tests/e2e/e2e-seed-data.ts` | UPDATE | Add `E2E_EVENT` constant |
| `tests/e2e/global-setup.ts` | UPDATE | Insert seeded event on Day 1; add `events` import and `and`/`eq` |
| `tests/e2e/features/event-docs.feature` | CREATE | New feature file with 3-4 scenarios |
| `tests/e2e/steps/event-docs.steps.ts` | CREATE | Step definitions for event-docs |

**Files NOT touched:**
- `src/components/packt/day-card-sortables.tsx` — `SortablePlaceRow` uses `ComponentProps<typeof PlaceRow>` so threading is automatic
- `src/components/packt/place-row.test.tsx` — existing `AddDocDialog` mock accepts extra props silently; no test changes needed
- `src/data/types.ts` — no new types; using existing `Document`
- `src/db/schema.ts` — no schema changes
- `src/lib/db-mappers.ts` — `dbDocToType` scope logic already correct (`row.eventId ? "event" : "trip"`)
- `src/components/packt/docs-block.tsx` — no changes needed
- `src/components/packt/trip-docs-tab.tsx` — no changes needed

**Read before implementing (not yet read):**
- `src/components/packt/day-card-header.tsx` — needed to find the correct accessible name for the DayCard toggle button in E2E steps
- `src/components/packt/day-card.test.tsx` — read before updating to understand existing test structure

---

## Tasks / Subtasks

- [ ] Task 1: Add server actions to `actions.ts`
  - [ ] Add `attachTripDocToEvent(docId, eventId)` — sets `eventId` on document, revalidates
  - [ ] Add `uploadDocumentToEvent(eventId, formData)` — uploads to Blob/stub, inserts with `tripId`+`eventId`

- [ ] Task 2: Redesign `src/components/packt/add-doc-dialog.tsx`
  - [ ] Update `AddDocDialogProps`: add `eventId: string`, `tripDocs?: Document[]`
  - [ ] Add `mode: "pick" | "upload"` state defaulting to "pick" when tripDocs non-empty
  - [ ] Reset mode on close
  - [ ] Add pick list panel with `DocKindBadge` + doc name buttons, "Upload new instead" toggle, Cancel
  - [ ] Add upload panel with hidden file input, dashed choose-file area, "← Choose existing instead", Cancel, Attach
  - [ ] Add `handlePickDoc` — calls `attachTripDocToEvent`, closes
  - [ ] Add `handleFileChange` — validates size, sets `pendingFile`
  - [ ] Add `handleUpload` — calls `uploadDocumentToEvent`, closes
  - [ ] Add `useEffect` for focus management on first pick item
  - [ ] Remove old Name/Kind form state and `handleAdd`

- [ ] Task 3: Update `src/components/packt/place-row.tsx`
  - [ ] Add `tripDocs?: Document[]` to `PlaceRowProps`
  - [ ] Destructure `tripDocs` in function signature
  - [ ] Pass `eventId={p.id}` and `tripDocs={tripDocs}` to `AddDocDialog`
  - [ ] Add `Document` to types import

- [ ] Task 4: Update `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx`
  - [ ] Pass `tripDocs={docs.filter(d => d.scope === "trip")}` to `TripItineraryView`

- [ ] Task 5: Update `src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx`
  - [ ] Add `tripDocs?: Document[]` to `TripItineraryViewProps`
  - [ ] Pass `tripDocs={tripDocs}` to each `DayCard`
  - [ ] Add `Document` to types import

- [ ] Task 6: Update `src/components/packt/day-card.tsx`
  - [ ] Add `tripDocs?: Document[]` to `DayCardProps`
  - [ ] Destructure `tripDocs` in function signature
  - [ ] Pass `tripDocs={tripDocs}` to `SortablePlaceRow`
  - [ ] Add `Document` to types import

- [ ] Task 7: Replace all tests in `src/components/packt/add-doc-dialog.test.tsx`
  - [ ] Mock `@/app/(app)/trips/[tripId]/actions` with `attachTripDocToEvent` and `uploadDocumentToEvent` as vi.fn()
  - [ ] Mock `sonner` with `toast: { error: vi.fn() }`
  - [ ] Write pick mode tests (6 tests: renders pick list, Upload new instead, Cancel, clicking doc, multiple docs, DocKindBadge)
  - [ ] Write upload mode tests (5 tests: no tripDocs → upload, empty array → upload, Attach disabled, Cancel, Choose existing)
  - [ ] Write focus management test (1 test: focuses first item after timeout)
  - [ ] Write mode-switch round trip test

- [ ] Task 8: Update E2E seed data
  - [ ] Add `E2E_EVENT` to `tests/e2e/e2e-seed-data.ts`
  - [ ] Update `tests/e2e/global-setup.ts` — import `events` table, `and`/`eq`, `E2E_EVENT`; insert event on Day 1 after days loop

- [ ] Task 9: Create E2E feature and steps
  - [ ] Create `tests/e2e/features/event-docs.feature` with 3 scenarios (pick list appears, selecting attaches, upload new instead)
  - [ ] Create `tests/e2e/steps/event-docs.steps.ts` with matching step defs
  - [ ] Read `day-card-header.tsx` first to confirm toggle button accessible name

- [ ] Task 10: Run full validation
  - [ ] `npm run test:coverage` — ≥95% line/function, ≥90% branch
  - [ ] `npm run test:e2e` — all event-docs scenarios pass
  - [ ] `npm run build` (via build-validator) — no TypeScript errors

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List
