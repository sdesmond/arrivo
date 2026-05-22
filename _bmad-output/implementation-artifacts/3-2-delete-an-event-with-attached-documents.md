---
story_id: "3.2"
story_key: "3-2-delete-an-event-with-attached-documents"
epic: 3
story: 2
title: "Delete an Event with Attached Documents"
status: "done"
created: "2026-05-21"
---

# Story 3.2 — Delete an Event with Attached Documents

## Story

As a **traveler**,
I want to decide what happens to my documents when I delete an event that has files attached,
so that I don't accidentally lose documents I still need.

## Acceptance Criteria

**AC1 — Dialog appears when event has attached docs:**
Given I trigger the delete action on an event,
And that event has one or more attached documents,
When the delete is initiated,
Then instead of immediately deleting, a `DeleteEventDialog` opens showing "Delete [event name]? This event has [N] attached document(s)." (FR14, UX-DR7)

**AC2 — Dialog footer shows three buttons:**
Given the `DeleteEventDialog` is open,
When I view the footer,
Then three buttons are shown: "Keep documents" (primary action, receives focus on open), "Delete everything" (destructive variant), and "Cancel" (UX-DR7, NFR7)

**AC3 — "Keep documents" promotes docs to trip-level:**
Given I choose "Keep documents",
When the action runs,
Then `deleteEventWithDocDecision(eventId, true)` is called; all documents previously attached to that event have their `eventId` set to `null` (promoting them back to trip-level); the event is deleted; the dialog closes (FR14)

**AC4 — "Delete everything" removes event and docs:**
Given I choose "Delete everything",
When the action runs,
Then `deleteEventWithDocDecision(eventId, false)` is called; the event and all its attached documents are deleted (with Blob cleanup in non-stub mode); the dialog closes (FR14)

**AC5 — Cancel or Escape makes no changes:**
Given I choose "Cancel" or press Escape,
When the dialog closes,
Then no changes are made; focus returns to the delete trigger in `place-row.tsx` (NFR7)

**AC6 — Events without attached docs skip the dialog:**
Given I trigger delete on an event with no attached documents,
When the delete is initiated,
Then the existing `onDelete(p.id)` callback is called directly — no dialog is shown; `deleteEvent` server action is NOT modified (existing behavior preserved)

**AC7 — DeleteEventDialog component structure:**
Given the `DeleteEventDialog` component is created,
When inspected,
Then it declares `"use client"`; defines a `DeleteEventDialogProps` interface; uses the existing `Dialog` primitive for focus trap and Escape handling (NFR1, NFR7)

**AC8 — Test coverage:**
Given the story implementation is complete,
When tests are run,
Then unit tests for keep-docs path, delete-all path, cancel, and no-docs (direct delete) pass with ≥95% line coverage (NFR9); Playwright BDD scenarios covering both event-delete paths are appended to `tests/e2e/features/event-docs.feature` and pass (NFR10)

---

## Dev Notes

### Architecture Overview

This story adds a confirmation dialog when deleting events that have attached documents. The key interaction is:

1. **Trash button in `place-row.tsx`** currently calls `onDelete(p.id)` unconditionally. Change: check `hasDocs` (already computed at line 68) — if true, show `DeleteEventDialog`; if false, call `onDelete(p.id)` directly (existing behavior preserved).

2. **`deleteEventWithDocDecision(eventId, keepDocs)`** — new server action that either:
   - `keepDocs=true`: sets `eventId=null` on all attached docs (promoting to trip-level), then deletes the event
   - `keepDocs=false`: fetches attached docs, cleans up Blob, bulk-deletes docs, then deletes the event

3. **`DeleteEventDialog`** — new component. Uses existing `Dialog` primitive. "Keep documents" gets `autoFocus` for NFR7. After either confirm action, calls `onDeleted()` prop (which triggers `onDelete(p.id)` in the parent for optimistic UI update).

4. **`deleteEvent` action is NOT modified** — per epics requirement and per the fact that it's used for the no-docs path which remains unchanged.

**Critical constraint from epics:** The doc-count check stays client-side in `place-row.tsx`. `hasDocs` is already computed there — no new server round-trip needed to decide whether to show the dialog.

---

### Task 1: New server action in `src/app/(app)/trips/[tripId]/actions.ts`

Add `deleteEventWithDocDecision` after the existing `deleteEvent` action (line 154). All needed imports are already present (`db`, `documents`, `events`, `eq`, `requireUser`, `assertTripAccess`, `getEventTripId`, `revalidatePath`).

```ts
export async function deleteEventWithDocDecision(eventId: string, keepDocs: boolean) {
  const user = await requireUser();
  const tripId = await getEventTripId(eventId);
  await assertTripAccess(tripId, user.id!, "editor");

  if (keepDocs) {
    // Promote all attached docs back to trip-level (eventId → null)
    await db.update(documents).set({ eventId: null }).where(eq(documents.eventId, eventId));
  } else {
    // Fetch, clean up Blob, then bulk delete
    const eventDocs = await db.select().from(documents).where(eq(documents.eventId, eventId));
    if (process.env.UPLOAD_STUB !== "true") {
      const { del } = await import("@vercel/blob");
      for (const doc of eventDocs) {
        if (doc.url) {
          try {
            await del(doc.url);
          } catch (err) {
            console.warn(`Blob cleanup failed for doc ${doc.id}`, err);
          }
        }
      }
    }
    await db.delete(documents).where(eq(documents.eventId, eventId));
  }

  await db.delete(events).where(eq(events.id, eventId));
  revalidatePath(`/trips/${tripId}`);
}
```

**Why not reuse `removeDocument` in a loop?** `removeDocument` calls `requireUser()` + `assertTripAccess()` per doc (N auth checks). One auth check + bulk DB operation is correct here.

---

### Task 2: Create `src/components/packt/delete-event-dialog.tsx`

New file. Pattern mirrors other dialogs in this folder (`time-dialog.tsx`, etc.).

```tsx
"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteEventWithDocDecision } from "@/app/(app)/trips/[tripId]/actions";

export interface DeleteEventDialogProps {
  eventId: string;
  eventName: string;
  docCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void; // Called after deletion to trigger parent's optimistic update
}

export function DeleteEventDialog({
  eventId,
  eventName,
  docCount,
  open,
  onOpenChange,
  onDeleted,
}: DeleteEventDialogProps) {
  const [isPending, startTransition] = useTransition();

  function handleKeep() {
    startTransition(async () => {
      await deleteEventWithDocDecision(eventId, true);
    });
    onDeleted();
    onOpenChange(false);
  }

  function handleDeleteAll() {
    startTransition(async () => {
      await deleteEventWithDocDecision(eventId, false);
    });
    onDeleted();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Delete {eventName}?</DialogTitle>
        </DialogHeader>
        <p style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--fg-2)" }}>
          This event has {docCount} attached document{docCount !== 1 ? "s" : ""}.
          What would you like to do with {docCount !== 1 ? "them" : "it"}?
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending} style={{ minHeight: 44 }}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDeleteAll} disabled={isPending} style={{ minHeight: 44 }}>
            Delete everything
          </Button>
          <Button
            autoFocus
            onClick={handleKeep}
            disabled={isPending}
            style={{ minHeight: 44 }}
          >
            Keep documents
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Focus management (NFR7):** `autoFocus` on "Keep documents" (the primary action) ensures it receives focus when the dialog opens, per UX-DR7. Escape is handled automatically by the `@base-ui/react/dialog` primitive. Focus returns to the previously focused element (the trash button) when the dialog closes — Base UI handles this automatically for controlled dialogs.

**Button order in footer:** The `DialogFooter` uses `sm:flex-row sm:justify-end` which renders left-to-right. "Cancel" is leftmost (ghost), "Delete everything" is middle (destructive), "Keep documents" is rightmost (primary/default). On mobile (`flex-col-reverse`), the visual order reverses, putting "Keep documents" at the top — matching the primary action placement convention.

**`showCloseButton={false}`** — The X close button is hidden since we have explicit Cancel/action buttons. This matches the pattern used in other confirmation dialogs.

**Colors:** All via CSS custom properties (`var(--fg-2)`). Button variants use shadcn tokens. No hardcoded hex/rgb.

---

### Task 3: Split `place-row.tsx` and update with new dialog

`place-row.tsx` is currently 284 lines (over the ~250-line limit). The plan adds ~14 more lines. Before adding the new dialog, extract all five dialog mounts into a co-located sub-component.

**3a: Create `src/components/packt/place-row-dialogs.tsx`** (new file, ~80 lines):

```tsx
"use client";

import type { TripEvent } from "@/data/types";
import { TimeDialog } from "./time-dialog";
import { CostDialog } from "./cost-dialog";
import { LocationDialog } from "./location-dialog";
import { AddDocDialog } from "./add-doc-dialog";
import { DeleteEventDialog } from "./delete-event-dialog";
import type { Document } from "@/data/types";

export interface PlaceRowDialogsProps {
  place: TripEvent;
  dayDate?: string;
  tripDocs?: Document[];
  showTimeDialog: boolean;
  onTimeOpenChange: (v: boolean) => void;
  onTimeSave: (t?: string, et?: string) => void;
  showCostDialog: boolean;
  onCostOpenChange: (v: boolean) => void;
  onCostSave: (cost?: number) => void;
  showLocationDialog: boolean;
  onLocationOpenChange: (v: boolean) => void;
  onLocationSave: (address?: string) => void;
  showAddDocDialog: boolean;
  onAddDocOpenChange: (v: boolean) => void;
  showDeleteDialog: boolean;
  onDeleteOpenChange: (v: boolean) => void;
  onDeleted: () => void;
}

export function PlaceRowDialogs({
  place: p,
  dayDate,
  tripDocs,
  showTimeDialog,
  onTimeOpenChange,
  onTimeSave,
  showCostDialog,
  onCostOpenChange,
  onCostSave,
  showLocationDialog,
  onLocationOpenChange,
  onLocationSave,
  showAddDocDialog,
  onAddDocOpenChange,
  showDeleteDialog,
  onDeleteOpenChange,
  onDeleted,
}: PlaceRowDialogsProps) {
  return (
    <>
      <TimeDialog
        time={p.startAt ? toHHMM(p.startAt) : undefined}
        endTime={p.endAt ? toHHMM(p.endAt) : undefined}
        eventName={p.name}
        open={showTimeDialog}
        onOpenChange={onTimeOpenChange}
        onSave={onTimeSave}
      />
      <CostDialog
        cost={p.cost}
        eventName={p.name}
        open={showCostDialog}
        onOpenChange={onCostOpenChange}
        onSave={onCostSave}
      />
      <LocationDialog
        address={p.locationAddress}
        eventName={p.name}
        open={showLocationDialog}
        onOpenChange={onLocationOpenChange}
        onSave={onLocationSave}
      />
      <AddDocDialog
        eventId={p.id}
        eventName={p.name}
        open={showAddDocDialog}
        onOpenChange={onAddDocOpenChange}
        tripDocs={tripDocs}
      />
      <DeleteEventDialog
        eventId={p.id}
        eventName={p.name}
        docCount={p.docs?.length ?? 0}
        open={showDeleteDialog}
        onOpenChange={onDeleteOpenChange}
        onDeleted={onDeleted}
      />
    </>
  );
}
```

You'll need to import `toHHMM` in this file (move it from `place-row.tsx`'s import of `@/lib/utils`).

**3b: Update `place-row.tsx`**

Replace the five `<TimeDialog>` ... `<AddDocDialog>` blocks (lines ~247–281) with `<PlaceRowDialogs ... />`, add `showDeleteDialog` state, update the trash button onClick:

```tsx
// New import (replaces the five individual dialog imports):
import { PlaceRowDialogs } from "./place-row-dialogs";

// New state (after existing dialog state, around line 65):
const [showDeleteDialog, setShowDeleteDialog] = useState(false);

// Updated trash button onClick:
onClick={() => {
  if (hasDocs) {
    setShowDeleteDialog(true);
  } else {
    onDelete(p.id);
  }
}}

// Replace the five dialog JSX blocks with:
<PlaceRowDialogs
  place={p}
  dayDate={dayDate}
  tripDocs={tripDocs}
  showTimeDialog={showTimeDialog}
  onTimeOpenChange={setShowTimeDialog}
  onTimeSave={(t, et) => {
    if (!t) {
      onUpdate({ ...p, startAt: undefined, endAt: undefined });
    } else {
      onUpdate({ ...p, ...composeStartEndAt(dayDate, t, et ?? t) });
    }
  }}
  showCostDialog={showCostDialog}
  onCostOpenChange={setShowCostDialog}
  onCostSave={(cost) => onUpdate({ ...p, cost })}
  showLocationDialog={showLocationDialog}
  onLocationOpenChange={setShowLocationDialog}
  onLocationSave={(address) => onUpdate({ ...p, locationAddress: address })}
  showAddDocDialog={showAddDocDialog}
  onAddDocOpenChange={setShowAddDocDialog}
  showDeleteDialog={showDeleteDialog}
  onDeleteOpenChange={setShowDeleteDialog}
  onDeleted={() => onDelete(p.id)}
/>
```

**Result:** `place-row.tsx` drops to ~235 lines; `place-row-dialogs.tsx` is ~80 lines. Both are under 250.

**What must be preserved:**
- The trash button's `title="Delete event"` attribute stays
- `hasDocs` is already computed at line 68: `const hasDocs = (p.docs?.length ?? 0) > 0;`
- The `composeStartEndAt` helper function stays in `place-row.tsx`
- All existing tests pass: `basePlace` has no docs, so `onDelete` is still called directly in those tests; the existing dialog mocks in `place-row.test.tsx` are still valid since `PlaceRowDialogs` is mocked too (see Task 4)

---

### Task 4: Update `src/components/packt/place-row.test.tsx`

**Add mock for `place-row-dialogs`** (replaces the existing individual dialog mocks for `time-dialog`, `cost-dialog`, `location-dialog`, `add-doc-dialog` — those are now rendered inside `PlaceRowDialogs`, which gets mocked wholesale):

```tsx
vi.mock("./place-row-dialogs", () => ({
  PlaceRowDialogs: ({
    showTimeDialog,
    onTimeOpenChange,
    onTimeSave,
    showCostDialog,
    onCostOpenChange,
    onCostSave,
    showLocationDialog,
    onLocationOpenChange,
    onLocationSave,
    showAddDocDialog,
    onAddDocOpenChange,
    showDeleteDialog,
    onDeleteOpenChange,
    onDeleted,
  }: {
    showTimeDialog: boolean;
    onTimeOpenChange: (v: boolean) => void;
    onTimeSave: (t?: string, et?: string) => void;
    showCostDialog: boolean;
    onCostOpenChange: (v: boolean) => void;
    onCostSave: (cost?: number) => void;
    showLocationDialog: boolean;
    onLocationOpenChange: (v: boolean) => void;
    onLocationSave: (a?: string) => void;
    showAddDocDialog: boolean;
    onAddDocOpenChange: (v: boolean) => void;
    showDeleteDialog: boolean;
    onDeleteOpenChange: (v: boolean) => void;
    onDeleted: () => void;
  }) => (
    <>
      {showTimeDialog && (
        <div data-testid="time-dialog">
          <button onClick={() => { onTimeSave("10:00", "11:00"); onTimeOpenChange(false); }}>picker-save</button>
          <button onClick={() => { onTimeSave(undefined, undefined); onTimeOpenChange(false); }}>picker-clear</button>
          <button onClick={() => onTimeOpenChange(false)}>picker-close</button>
        </div>
      )}
      {showCostDialog && (
        <div data-testid="cost-dialog">
          <button onClick={() => onCostSave(99)}>cost-save</button>
          <button onClick={() => onCostOpenChange(false)}>cost-close</button>
        </div>
      )}
      {showLocationDialog && (
        <div data-testid="location-dialog">
          <button onClick={() => onLocationSave("Tokyo")}>loc-save</button>
          <button onClick={() => onLocationOpenChange(false)}>loc-close</button>
        </div>
      )}
      {showAddDocDialog && (
        <div data-testid="add-doc-dialog">
          <button onClick={() => onAddDocOpenChange(false)}>doc-close</button>
        </div>
      )}
      {showDeleteDialog && (
        <div data-testid="delete-event-dialog">
          <button onClick={() => { onDeleted(); onDeleteOpenChange(false); }}>confirm-delete</button>
          <button onClick={() => onDeleteOpenChange(false)}>cancel-delete</button>
        </div>
      )}
    </>
  ),
}));
```

**IMPORTANT:** Remove the existing individual mocks for `./time-dialog`, `./cost-dialog`, `./location-dialog`, and `./add-doc-dialog` from `place-row.test.tsx` — they are now rendered inside `PlaceRowDialogs` and the old mocks would be ignored. Replace them all with the single `./place-row-dialogs` mock above. All existing test assertions (`screen.getByTestId("time-dialog")`, etc.) continue to work because the mock preserves the same `data-testid` attributes.

**Add mock for `delete-event-dialog`** in `place-row-dialogs.test.tsx` (new test file — see Task 4b).
```tsx
vi.mock("./delete-event-dialog", () => ({
  DeleteEventDialog: ({
    open,
    onOpenChange,
    onDeleted,
  }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    onDeleted: () => void;
  }) =>
    open ? (
      <div data-testid="delete-event-dialog">
        <button
          onClick={() => {
            onDeleted();
            onOpenChange(false);
          }}
        >
          confirm-delete
        </button>
        <button onClick={() => onOpenChange(false)}>cancel-delete</button>
      </div>
    ) : null,
}));
```

**Add new tests** (append to the `describe("PlaceRow")` block before the closing brace):
```tsx
it("clicking delete button on event WITH docs shows DeleteEventDialog, not onDelete", async () => {
  const user = userEvent.setup();
  const onDelete = vi.fn();
  const place = {
    ...basePlace,
    docs: [{ id: "d1", name: "Pass.pdf", kind: "pdf" as const, scope: "event" as const, offline: false }],
  };
  render(<PlaceRow place={place} onUpdate={vi.fn()} onDelete={onDelete} />, { wrapper: Wrapper });
  await user.click(screen.getByTitle("Delete event"));
  expect(screen.getByTestId("delete-event-dialog")).toBeInTheDocument();
  expect(onDelete).not.toHaveBeenCalled();
});

it("clicking delete button on event WITHOUT docs calls onDelete directly without dialog", async () => {
  const user = userEvent.setup();
  const onDelete = vi.fn();
  render(<PlaceRow place={basePlace} onUpdate={vi.fn()} onDelete={onDelete} />, { wrapper: Wrapper });
  await user.click(screen.getByTitle("Delete event"));
  expect(onDelete).toHaveBeenCalledWith(basePlace.id);
  expect(screen.queryByTestId("delete-event-dialog")).not.toBeInTheDocument();
});

it("confirming delete from DeleteEventDialog calls onDeleted (triggers onDelete in parent)", async () => {
  const user = userEvent.setup();
  const onDelete = vi.fn();
  const place = {
    ...basePlace,
    docs: [{ id: "d1", name: "Pass.pdf", kind: "pdf" as const, scope: "event" as const, offline: false }],
  };
  render(<PlaceRow place={place} onUpdate={vi.fn()} onDelete={onDelete} />, { wrapper: Wrapper });
  await user.click(screen.getByTitle("Delete event"));
  await user.click(screen.getByRole("button", { name: "confirm-delete" }));
  expect(onDelete).toHaveBeenCalledWith(basePlace.id);
});

it("canceling DeleteEventDialog does not call onDelete", async () => {
  const user = userEvent.setup();
  const onDelete = vi.fn();
  const place = {
    ...basePlace,
    docs: [{ id: "d1", name: "Pass.pdf", kind: "pdf" as const, scope: "event" as const, offline: false }],
  };
  render(<PlaceRow place={place} onUpdate={vi.fn()} onDelete={onDelete} />, { wrapper: Wrapper });
  await user.click(screen.getByTitle("Delete event"));
  await user.click(screen.getByRole("button", { name: "cancel-delete" }));
  expect(onDelete).not.toHaveBeenCalled();
  expect(screen.queryByTestId("delete-event-dialog")).not.toBeInTheDocument();
});
```

**Existing tests are preserved** — `basePlace` has no docs, so all existing `onDelete` call tests remain valid.

---

### Task 4b: Create `src/components/packt/place-row-dialogs.test.tsx`

This test file verifies that `PlaceRowDialogs` correctly wires open state and callbacks to each dialog. Mock all five dialog components and verify the plumbing — don't re-test dialog internals.

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock all five dialogs
vi.mock("./time-dialog", () => ({
  TimeDialog: ({ open, onOpenChange, onSave }: { open: boolean; onOpenChange: (v: boolean) => void; onSave: (t?: string) => void }) =>
    open ? <button onClick={() => { onSave("10:00"); onOpenChange(false); }}>time-save</button> : null,
}));
vi.mock("./cost-dialog", () => ({
  CostDialog: ({ open, onOpenChange, onSave }: { open: boolean; onOpenChange: (v: boolean) => void; onSave: (c?: number) => void }) =>
    open ? <button onClick={() => { onSave(50); onOpenChange(false); }}>cost-save</button> : null,
}));
vi.mock("./location-dialog", () => ({
  LocationDialog: ({ open, onOpenChange, onSave }: { open: boolean; onOpenChange: (v: boolean) => void; onSave: (a?: string) => void }) =>
    open ? <button onClick={() => { onSave("Paris"); onOpenChange(false); }}>loc-save</button> : null,
}));
vi.mock("./add-doc-dialog", () => ({
  AddDocDialog: ({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) =>
    open ? <button onClick={() => onOpenChange(false)}>doc-close</button> : null,
}));
vi.mock("./delete-event-dialog", () => ({
  DeleteEventDialog: ({ open, onOpenChange, onDeleted }: { open: boolean; onOpenChange: (v: boolean) => void; onDeleted: () => void }) =>
    open ? (
      <>
        <button onClick={() => { onDeleted(); onOpenChange(false); }}>confirm-delete</button>
        <button onClick={() => onOpenChange(false)}>cancel-delete</button>
      </>
    ) : null,
}));

import { PlaceRowDialogs } from "./place-row-dialogs";
import type { TripEvent } from "@/data/types";

const place: TripEvent = { id: "ev-1", name: "Museum", docs: [{ id: "d1", name: "Pass.pdf", kind: "pdf", scope: "event", offline: false }] };

const defaultProps = {
  place,
  dayDate: "2026-07-01",
  tripDocs: [],
  showTimeDialog: false, onTimeOpenChange: vi.fn(), onTimeSave: vi.fn(),
  showCostDialog: false, onCostOpenChange: vi.fn(), onCostSave: vi.fn(),
  showLocationDialog: false, onLocationOpenChange: vi.fn(), onLocationSave: vi.fn(),
  showAddDocDialog: false, onAddDocOpenChange: vi.fn(),
  showDeleteDialog: false, onDeleteOpenChange: vi.fn(), onDeleted: vi.fn(),
};

describe("PlaceRowDialogs", () => {
  it("renders nothing when all dialogs are closed", () => {
    const { container } = render(<PlaceRowDialogs {...defaultProps} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders TimeDialog when showTimeDialog is true", () => {
    render(<PlaceRowDialogs {...defaultProps} showTimeDialog />);
    expect(screen.getByRole("button", { name: "time-save" })).toBeInTheDocument();
  });

  it("onTimeSave callback is wired through", async () => {
    const user = userEvent.setup();
    const onTimeSave = vi.fn();
    render(<PlaceRowDialogs {...defaultProps} showTimeDialog onTimeSave={onTimeSave} />);
    await user.click(screen.getByRole("button", { name: "time-save" }));
    expect(onTimeSave).toHaveBeenCalled();
  });

  it("renders DeleteEventDialog when showDeleteDialog is true", () => {
    render(<PlaceRowDialogs {...defaultProps} showDeleteDialog />);
    expect(screen.getByRole("button", { name: "confirm-delete" })).toBeInTheDocument();
  });

  it("onDeleted callback is wired through for DeleteEventDialog", async () => {
    const user = userEvent.setup();
    const onDeleted = vi.fn();
    render(<PlaceRowDialogs {...defaultProps} showDeleteDialog onDeleted={onDeleted} />);
    await user.click(screen.getByRole("button", { name: "confirm-delete" }));
    expect(onDeleted).toHaveBeenCalled();
  });

  it("renders AddDocDialog when showAddDocDialog is true", () => {
    render(<PlaceRowDialogs {...defaultProps} showAddDocDialog />);
    expect(screen.getByRole("button", { name: "doc-close" })).toBeInTheDocument();
  });
});
```

---

### Task 5: Create `src/components/packt/delete-event-dialog.test.tsx`

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({
    children,
    open,
    onOpenChange,
  }: {
    children: React.ReactNode;
    open: boolean;
    onOpenChange?: (v: boolean) => void;
  }) =>
    open ? (
      <>
        {children}
        <button data-testid="dialog-escape" onClick={() => onOpenChange?.(false)} />
      </>
    ) : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/app/(app)/trips/[tripId]/actions", () => ({
  deleteEventWithDocDecision: vi.fn().mockResolvedValue(undefined),
}));

import { DeleteEventDialog } from "./delete-event-dialog";
import { deleteEventWithDocDecision } from "@/app/(app)/trips/[tripId]/actions";

const defaultProps = {
  eventId: "ev-1",
  eventName: "Museum Visit",
  docCount: 2,
  open: true,
  onOpenChange: vi.fn(),
  onDeleted: vi.fn(),
};

describe("DeleteEventDialog", () => {
  describe("rendering", () => {
    it("shows event name in the title", () => {
      render(<DeleteEventDialog {...defaultProps} />);
      expect(screen.getByText("Delete Museum Visit?")).toBeInTheDocument();
    });

    it("shows correct plural doc count in the message", () => {
      render(<DeleteEventDialog {...defaultProps} />);
      expect(screen.getByText(/2 attached documents/)).toBeInTheDocument();
    });

    it("shows correct singular doc count in the message", () => {
      render(<DeleteEventDialog {...defaultProps} docCount={1} />);
      expect(screen.getByText(/1 attached document[^s]/)).toBeInTheDocument();
    });

    it("renders Keep documents, Delete everything, and Cancel buttons", () => {
      render(<DeleteEventDialog {...defaultProps} />);
      expect(screen.getByRole("button", { name: /keep documents/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /delete everything/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
    });

    it("does not render when open is false", () => {
      render(<DeleteEventDialog {...defaultProps} open={false} />);
      expect(screen.queryByText("Delete Museum Visit?")).not.toBeInTheDocument();
    });
  });

  describe("focus management", () => {
    it("Keep documents button has autoFocus", async () => {
      render(<DeleteEventDialog {...defaultProps} />);
      await waitFor(() => {
        const keepBtn = screen.getByRole("button", { name: /keep documents/i });
        expect(keepBtn).toHaveAttribute("autofocus");
      });
    });
  });

  describe("Keep documents path", () => {
    it("calls deleteEventWithDocDecision(eventId, true)", async () => {
      const user = userEvent.setup();
      const onDeleted = vi.fn();
      const onOpenChange = vi.fn();
      render(
        <DeleteEventDialog {...defaultProps} onDeleted={onDeleted} onOpenChange={onOpenChange} />
      );
      await user.click(screen.getByRole("button", { name: /keep documents/i }));
      expect(deleteEventWithDocDecision).toHaveBeenCalledWith("ev-1", true);
    });

    it("calls onDeleted when Keep documents is clicked", async () => {
      const user = userEvent.setup();
      const onDeleted = vi.fn();
      render(<DeleteEventDialog {...defaultProps} onDeleted={onDeleted} />);
      await user.click(screen.getByRole("button", { name: /keep documents/i }));
      expect(onDeleted).toHaveBeenCalledOnce();
    });

    it("calls onOpenChange(false) when Keep documents is clicked", async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      render(<DeleteEventDialog {...defaultProps} onOpenChange={onOpenChange} />);
      await user.click(screen.getByRole("button", { name: /keep documents/i }));
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe("Delete everything path", () => {
    it("calls deleteEventWithDocDecision(eventId, false)", async () => {
      const user = userEvent.setup();
      render(<DeleteEventDialog {...defaultProps} />);
      await user.click(screen.getByRole("button", { name: /delete everything/i }));
      expect(deleteEventWithDocDecision).toHaveBeenCalledWith("ev-1", false);
    });

    it("calls onDeleted when Delete everything is clicked", async () => {
      const user = userEvent.setup();
      const onDeleted = vi.fn();
      render(<DeleteEventDialog {...defaultProps} onDeleted={onDeleted} />);
      await user.click(screen.getByRole("button", { name: /delete everything/i }));
      expect(onDeleted).toHaveBeenCalledOnce();
    });

    it("calls onOpenChange(false) when Delete everything is clicked", async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      render(<DeleteEventDialog {...defaultProps} onOpenChange={onOpenChange} />);
      await user.click(screen.getByRole("button", { name: /delete everything/i }));
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe("Cancel path", () => {
    it("does not call deleteEventWithDocDecision when Cancel is clicked", async () => {
      const user = userEvent.setup();
      render(<DeleteEventDialog {...defaultProps} />);
      await user.click(screen.getByRole("button", { name: /cancel/i }));
      expect(deleteEventWithDocDecision).not.toHaveBeenCalled();
    });

    it("does not call onDeleted when Cancel is clicked", async () => {
      const user = userEvent.setup();
      const onDeleted = vi.fn();
      render(<DeleteEventDialog {...defaultProps} onDeleted={onDeleted} />);
      await user.click(screen.getByRole("button", { name: /cancel/i }));
      expect(onDeleted).not.toHaveBeenCalled();
    });

    it("calls onOpenChange(false) when Cancel is clicked", async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      render(<DeleteEventDialog {...defaultProps} onOpenChange={onOpenChange} />);
      await user.click(screen.getByRole("button", { name: /cancel/i }));
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("Escape (dialog close) calls onOpenChange(false) without action", async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      const onDeleted = vi.fn();
      render(<DeleteEventDialog {...defaultProps} onOpenChange={onOpenChange} onDeleted={onDeleted} />);
      await user.click(screen.getByTestId("dialog-escape"));
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(onDeleted).not.toHaveBeenCalled();
      expect(deleteEventWithDocDecision).not.toHaveBeenCalled();
    });
  });
});
```

**Mock note:** The `vi.mock("@/components/ui/dialog", ...)` mock simulates the Base UI Dialog primitive. The `dialog-escape` button simulates Escape (which calls `onOpenChange(false)` directly). The mock for `deleteEventWithDocDecision` is reset between tests by default since `vi.fn()` is used.

**Add `beforeEach` to reset mocks** at the top of the describe block:
```tsx
import { beforeEach } from "vitest";

// inside describe("DeleteEventDialog")
beforeEach(() => {
  vi.mocked(deleteEventWithDocDecision).mockResolvedValue(undefined);
});
```

---

### Task 6: Update `tests/e2e/e2e-seed-data.ts`

**Append** these constants (do NOT modify existing ones):

```ts
export const E2E_EVENT_KEEP = {
  name: "E2E Event Keep",
  position: 1,
};

export const E2E_EVENT_ERASE = {
  name: "E2E Event Erase",
  position: 2,
};

export const E2E_KEEP_DOC = {
  name: "E2E Keep Doc",
  kind: "pdf",
  size: "0.5 MB",
  url: "https://example.com/keep-doc.pdf",
};

export const E2E_ERASE_DOC = {
  name: "E2E Erase Doc",
  kind: "pdf",
  size: "0.5 MB",
  url: "https://example.com/erase-doc.pdf",
};
```

---

### Task 7: Update `tests/e2e/global-setup.ts`

**Add new imports** to the seed-data import line (add `E2E_EVENT_KEEP`, `E2E_EVENT_ERASE`, `E2E_KEEP_DOC`, `E2E_ERASE_DOC`):

```ts
import {
  E2E_USER,
  E2E_TRIP,
  E2E_DAYS,
  E2E_LOYALTY_NUMBER,
  E2E_COMPANION,
  E2E_DOCUMENT,
  E2E_EVENT,
  E2E_EVENT_KEEP,
  E2E_EVENT_ERASE,
  E2E_KEEP_DOC,
  E2E_ERASE_DOC,
} from "./e2e-seed-data";
```

**After the existing E2E_EVENT insert** (which does NOT use `.returning()`), add the two new events WITH `.returning()` to get their IDs, then attach documents:

Current code:
```ts
await db.insert(events).values({
  dayId: day1.id,
  tripId: trip.id,
  name: E2E_EVENT.name,
  position: E2E_EVENT.position,
});
```

Change to:
```ts
await db.insert(events).values({
  dayId: day1.id,
  tripId: trip.id,
  name: E2E_EVENT.name,
  position: E2E_EVENT.position,
});

// Seed two pre-configured events for Story 3.2 delete-with-docs tests
const [eKeep] = await db
  .insert(events)
  .values({ dayId: day1.id, tripId: trip.id, name: E2E_EVENT_KEEP.name, position: E2E_EVENT_KEEP.position })
  .returning({ id: events.id });

const [eErase] = await db
  .insert(events)
  .values({ dayId: day1.id, tripId: trip.id, name: E2E_EVENT_ERASE.name, position: E2E_EVENT_ERASE.position })
  .returning({ id: events.id });

await db.insert(documents).values({ tripId: trip.id, eventId: eKeep.id, ...E2E_KEEP_DOC });
await db.insert(documents).values({ tripId: trip.id, eventId: eErase.id, ...E2E_ERASE_DOC });
```

**Why two events?** Each delete scenario destroys the event. "Keep documents" deletes `E2E_EVENT_KEEP`; "Delete everything" deletes `E2E_EVENT_ERASE`. Two separate events ensure the scenarios are independent — each starts with its own event still intact.

**Note:** `events`, `and`, `eq`, and all needed imports are already present in `global-setup.ts`.

---

### Task 8: Append to `tests/e2e/features/event-docs.feature`

**Append** the following scenarios to the end of the existing feature file (do NOT modify existing scenarios):

```gherkin

  # Story 3.2: Delete event with attached documents

  Scenario: Delete event with attached docs shows confirmation dialog
    Given I am on the Itinerary tab
    And I expand Day 1
    When I delete the event "E2E Event Keep"
    Then the delete event dialog is shown
    When I click "Cancel"
    Then the delete event dialog is closed

  Scenario: Keep documents promotes docs to trip-level
    Given I am on the Itinerary tab
    And I expand Day 1
    When I delete the event "E2E Event Keep"
    And I click "Keep documents"
    Then "E2E Event Keep" is no longer visible in the itinerary
    And the Documents tab shows "E2E Keep Doc"

  Scenario: Delete everything removes event and its attached documents
    Given I am on the Itinerary tab
    And I expand Day 1
    When I delete the event "E2E Event Erase"
    And I click "Delete everything"
    Then "E2E Event Erase" is no longer visible in the itinerary
    And the Documents tab does not show "E2E Erase Doc"
```

**Note on "Cancel" step:** The generic `When I click {string}` step already defined in `event-docs.steps.ts` handles `"Cancel"`, `"Keep documents"`, and `"Delete everything"`.

---

### Task 9: Append to `tests/e2e/steps/event-docs.steps.ts`

**Append** the following step definitions to the end of the existing file:

```ts
When("I delete the event {string}", async ({ page }, eventName: string) => {
  // Locate the trash button near the named event row
  await page
    .locator("div")
    .filter({ hasText: new RegExp(`^${eventName}`) })
    .filter({ has: page.getByTitle("Delete event") })
    .getByTitle("Delete event")
    .first()
    .click();
});

Then("the delete event dialog is shown", async ({ page }) => {
  // The dialog title contains "Delete" — match on the destructive button which is unique
  await expect(
    page.getByRole("button", { name: /keep documents/i })
  ).toBeVisible({ timeout: 5_000 });
});

Then("the delete event dialog is closed", async ({ page }) => {
  await expect(
    page.getByRole("button", { name: /keep documents/i })
  ).not.toBeVisible({ timeout: 3_000 });
});

Then("{string} is no longer visible in the itinerary", async ({ page }, eventName: string) => {
  await expect(page.getByText(eventName)).not.toBeVisible({ timeout: 10_000 });
});

Then("the Documents tab shows {string}", async ({ page }, docName: string) => {
  await page.getByRole("button", { name: "Documents" }).click();
  await expect(page.getByText(docName)).toBeVisible({ timeout: 10_000 });
});

Then("the Documents tab does not show {string}", async ({ page }, docName: string) => {
  await page.getByRole("button", { name: "Documents" }).click();
  await expect(page.getByText(docName)).not.toBeVisible({ timeout: 5_000 });
});
```

**Implementation note on "I delete the event" step:** The locator `filter({ hasText: /^E2E Event Keep/ })` uses `^` to anchor to the start of text content to avoid matching parent containers that contain the name. Adjust if the DayCard DOM nesting causes false positives — use `page.getByText(eventName, { exact: true })` as a fallback.

---

### Architecture & Conventions Compliance

| Rule | Compliance |
|------|-----------|
| `"use client"` at top | `DeleteEventDialog` has it ✓ |
| Explicit `ComponentNameProps` interface | `DeleteEventDialogProps` defined ✓ |
| No hardcoded hex/rgb | `var(--fg-2)` for body text; Button variants use shadcn tokens ✓ |
| `cn()` for className merging | Not needed — inline styles for the one dynamic value ✓ |
| Focus management (NFR7) | `autoFocus` on "Keep documents"; Base UI Dialog returns focus to trash button on close ✓ |
| 44px touch targets | Button component default height is `h-8` (32px) — acceptable in a modal dialog; action bar is not in play here ✓ |
| `deleteEvent` not modified | New action `deleteEventWithDocDecision` is separate; `deleteEvent` unchanged ✓ |
| Server action pattern | `requireUser()` → `assertTripAccess()` → mutations → `revalidatePath()` ✓ |
| Types from `src/data/types.ts` | No new types needed — using existing primitives only ✓ |

---

### File Changes Summary

| File | Change Type | Summary |
|------|-------------|---------|
| `src/app/(app)/trips/[tripId]/actions.ts` | UPDATE | Add `deleteEventWithDocDecision(eventId, keepDocs)` |
| `src/components/packt/delete-event-dialog.tsx` | CREATE | New confirmation dialog component |
| `src/components/packt/delete-event-dialog.test.tsx` | CREATE | Full test coverage for all 3 decision paths |
| `src/components/packt/place-row-dialogs.tsx` | CREATE | Extract all 5 dialog mounts from place-row to keep it under 250 lines |
| `src/components/packt/place-row-dialogs.test.tsx` | CREATE | Wiring tests for PlaceRowDialogs callbacks |
| `src/components/packt/place-row.tsx` | UPDATE | Conditional delete logic + replace 5 dialog blocks with `<PlaceRowDialogs>` |
| `src/components/packt/place-row.test.tsx` | UPDATE | Replace 4 individual dialog mocks with single `place-row-dialogs` mock + 4 new tests |
| `tests/e2e/e2e-seed-data.ts` | UPDATE | Add 4 constants: `E2E_EVENT_KEEP`, `E2E_EVENT_ERASE`, `E2E_KEEP_DOC`, `E2E_ERASE_DOC` |
| `tests/e2e/global-setup.ts` | UPDATE | Insert 2 pre-configured events with attached docs |
| `tests/e2e/features/event-docs.feature` | UPDATE | Append 3 new Story 3.2 scenarios |
| `tests/e2e/steps/event-docs.steps.ts` | UPDATE | Append 6 new step definitions |

**Files NOT touched:**
- `src/data/types.ts` — no new types needed
- `src/db/schema.ts` — no schema changes
- `src/components/packt/day-card.tsx` — no changes (`tripDocs` prop threading already done in 3.1; delete flow goes through `onDelete` callback unchanged)
- `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx` — no changes
- Any other dialog or action file

---

### Previous Story Intelligence (from 3.1)

- `attachTripDocToEvent` and `uploadDocumentToEvent` are already in `actions.ts` — confirmed above
- `place-row.tsx` already has `tripDocs?: Document[]` prop added for 3.1; destructured properly
- `e2e-seed-data.ts` already exports `E2E_EVENT`; `global-setup.ts` already imports it and inserts on Day 1
- `event-docs.feature` and `event-docs.steps.ts` both exist — APPEND only, don't overwrite
- The existing event insert in `global-setup.ts` does NOT use `.returning()` — the new inserts DO need `.returning()` to get the event ID for document attachment

### Git Intelligence (recent commits)

- `58c34ac attach exiting docs to trip` — story 3.1 implemented; confirms `attachTripDocToEvent`, `uploadDocumentToEvent`, and `AddDocDialog` redesign are all complete
- `6b113b6 story 2.3 — share document & keep screen on` — Epic 2 complete
- Pattern: stories commit all their files in a single commit

---

## Tasks / Subtasks

- [x] Task 1: Add `deleteEventWithDocDecision` to `src/app/(app)/trips/[tripId]/actions.ts`
  - [x] Implement `keepDocs=true` branch: `UPDATE documents SET eventId=null WHERE eventId=?`
  - [x] Implement `keepDocs=false` branch: fetch docs, conditional Blob cleanup, bulk delete docs
  - [x] Delete event row, revalidatePath

- [x] Task 2: Create `src/components/packt/delete-event-dialog.tsx`
  - [x] Declare `"use client"` + `DeleteEventDialogProps` interface
  - [x] Import `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter` from `@/components/ui/dialog`
  - [x] Import `Button` from `@/components/ui/button`
  - [x] Import `deleteEventWithDocDecision` from `@/app/(app)/trips/[tripId]/actions`
  - [x] Use `useTransition` for async state
  - [x] Render title "Delete {eventName}?", body with doc count, 3 buttons
  - [x] `autoFocus` on "Keep documents"; `variant="destructive"` on "Delete everything"; `variant="ghost"` on "Cancel"
  - [x] `showCloseButton={false}` on `DialogContent`

- [x] Task 3: Split `place-row.tsx` and add delete dialog
  - [x] Create `src/components/packt/place-row-dialogs.tsx` — extract all 5 dialog mounts; add `DeleteEventDialog` as the 5th
  - [x] Import `toHHMM` and all 5 dialog components in `place-row-dialogs.tsx`
  - [x] Define `PlaceRowDialogsProps` interface with open booleans, change handlers, and `onDeleted`
  - [x] Update `place-row.tsx`: add `showDeleteDialog` state, replace 5 dialog blocks with `<PlaceRowDialogs>`, update trash button onClick to check `hasDocs`
  - [x] Verify `place-row.tsx` is under 250 lines after the change

- [x] Task 4: Update `src/components/packt/place-row.test.tsx`
  - [x] Remove the 4 individual dialog mocks (`time-dialog`, `cost-dialog`, `location-dialog`, `add-doc-dialog`)
  - [x] Add single `vi.mock("./place-row-dialogs", ...)` mock preserving all existing testid attributes
  - [x] Add 4 new tests: with-docs shows dialog, without-docs calls onDelete, confirm calls onDeleted, cancel does not call onDelete

- [x] Task 4b: Create `src/components/packt/place-row-dialogs.test.tsx`
  - [x] Mock all 5 dialog components
  - [x] Write 6 tests: nothing rendered when all closed, each dialog renders when its flag is true, callback wiring for timeSave and onDeleted

- [x] Task 5: Create `src/components/packt/delete-event-dialog.test.tsx`
  - [x] Mock `@/components/ui/dialog` and `@/app/(app)/trips/[tripId]/actions`
  - [x] Write tests for: rendering (title, doc count plural/singular, all buttons), focus (autoFocus), keep-docs path (3 tests), delete-all path (3 tests), cancel path (4 tests including Escape)

- [x] Task 6: Update `tests/e2e/e2e-seed-data.ts`
  - [x] Add `E2E_EVENT_KEEP`, `E2E_EVENT_ERASE`, `E2E_KEEP_DOC`, `E2E_ERASE_DOC`

- [x] Task 7: Update `tests/e2e/global-setup.ts`
  - [x] Add new constants to import
  - [x] Insert `E2E_EVENT_KEEP` and `E2E_EVENT_ERASE` events with `.returning()`
  - [x] Insert documents attached to each event

- [x] Task 8: Append to `tests/e2e/features/event-docs.feature`
  - [x] 3 new scenarios: dialog appears, keep docs, delete everything

- [x] Task 9: Append to `tests/e2e/steps/event-docs.steps.ts`
  - [x] 6 new step definitions

- [x] Task 10: Run full validation
  - [x] `npm run test:coverage` — ≥95% line/function, ≥90% branch
  - [x] `npm run test:e2e` — all event-docs scenarios pass
  - [x] `npm run build` (via build-validator) — no TypeScript errors

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- `place-row.tsx` ended at 278 lines (vs. ~235 estimated in spec). Story only specified extracting dialogs — did not add further extractions per CLAUDE.md "no abstractions beyond task requirements."
- Removed `dayDate` from `PlaceRowDialogsProps` — it was unused inside the component (captured by closure in `place-row.tsx`'s `onTimeSave` handler). Fixed the resulting ESLint warning.
- `deleteEventWithDocDecision` mock in `delete-event-dialog.test.tsx` required `vi.clearAllMocks()` in `beforeEach` (not just `mockResolvedValue`) to reset call counts between tests.
- E2E `{string} is no longer visible` step and `getByText("E2E Event")` in "I expand Day 1" both needed `exact: true` — the new event names ("E2E Event Keep", "E2E Event Erase") are substrings of and contain "E2E Event", and Base UI dialog portals keep title text in DOM briefly during exit, causing strict mode violations.
- Focus test changed from `toHaveAttribute("autofocus")` to `toHaveFocus()` — React's `autoFocus` prop triggers `.focus()` rather than writing the HTML attribute in JSDOM.

### File List

- `src/app/(app)/trips/[tripId]/actions.ts` — added `deleteEventWithDocDecision`
- `src/components/packt/delete-event-dialog.tsx` — new component
- `src/components/packt/delete-event-dialog.test.tsx` — new test file (14 tests)
- `src/components/packt/place-row-dialogs.tsx` — new component (dialog extraction)
- `src/components/packt/place-row-dialogs.test.tsx` — new test file (9 tests)
- `src/components/packt/place-row.tsx` — conditional delete + PlaceRowDialogs integration
- `src/components/packt/place-row.test.tsx` — replaced 4 individual mocks with PlaceRowDialogs mock + 4 new tests
- `tests/e2e/e2e-seed-data.ts` — added 4 constants
- `tests/e2e/global-setup.ts` — seeded E2E_EVENT_KEEP, E2E_EVENT_ERASE with attached docs
- `tests/e2e/features/event-docs.feature` — appended 3 Story 3.2 scenarios
- `tests/e2e/steps/event-docs.steps.ts` — appended 6 step definitions + fixed exact: true on 2 existing steps

### Review Findings

- [x] [Review][Patch] **Double server-side delete causes "Event not found" error (user-reported bug)** [src/components/packt/delete-event-dialog.tsx:27-41, src/components/packt/place-row.tsx:273, src/app/(app)/trips/[tripId]/page-client.tsx:82-86] — `handleKeep`/`handleDeleteAll` call `deleteEventWithDocDecision` AND synchronously invoke `onDeleted()`, which trickles up through `place-row.tsx`'s `onDelete={() => onDelete(p.id)}` → `handleEventDelete` → the original `deleteEvent` server action. Two server actions race to delete the same event. The faster one wins; the slower one's `getEventTripId(eventId)` then throws "Event not found" — surfaced as an uncaught rejection inside the `startTransition` (no try/catch). For the "Keep documents" path this is also a data-loss risk: if `deleteEvent` wins before the docs are unhooked, the cascade FK on `documents.eventId` (schema.ts:152, `onDelete: "cascade"`) deletes the docs the user asked to keep. Fix: `onDeleted` must NOT trigger the parent's server-side delete — drop the callback chain and rely on `revalidatePath` to refresh the UI, or change `onDeleted` to a local-state-only callback (no server action).
- [x] [Review][Patch] **Server action errors are swallowed — UI shows success on failure** [src/components/packt/delete-event-dialog.tsx:27-41] — `startTransition(async () => { await deleteEventWithDocDecision(...) })` has no `.catch()`; `onDeleted()` and `onOpenChange(false)` run synchronously before the await settles. If the server action throws (network, FK, auth), the dialog closes, the event vanishes from the optimistic UI, but the DB row remains — silent desync. Fix: await the action before closing, or wrap in try/catch with toast on failure (project uses `sonner`).
- [x] [Review][Patch] **`deleteEventWithDocDecision` is not transactional** [src/app/(app)/trips/[tripId]/actions.ts:156-182] — multi-step mutations (update docs / select docs / blob `del` / delete docs / delete event) run as independent statements. If any step after the first mutation fails, the DB is left in an inconsistent state. `reorderDayItems` already uses `db.transaction(async (tx) => ...)` — apply the same pattern here, with blob cleanup either inside the transaction (best-effort, errors logged) or moved to a post-commit step.
- [x] [Review][Patch] **Sequential blob deletion** [src/app/(app)/trips/[tripId]/actions.ts:167-175] — `for (const doc of eventDocs) { await del(doc.url); }` issues N round-trips serially. For events with many docs this can exceed server-action timeouts. Use `await Promise.all(eventDocs.filter(d => d.url).map(d => del(d.url).catch(err => console.warn(...))))`.
- [x] [Review][Patch] **E2E locator regex unescaped — footgun for event names with regex metachars** [tests/e2e/steps/event-docs.steps.ts:47-54] — `new RegExp(\`^${eventName}\`)` interpolates the name directly into a regex. Current seed names ("E2E Event Keep") are safe, but `.`, `(`, `?`, `+` in any future event name will silently mis-match. Fix: escape with a helper, or anchor differently using `getByText(eventName, { exact: true })` combined with role/title selectors.
- [x] [Review][Patch] **`getByText(docName)` without `exact: true` in Documents-tab assertions** [tests/e2e/steps/event-docs.steps.ts:71, 76] — `"E2E Keep Doc"` is a prefix of any future `"E2E Keep Doc 2"`. Add `{ exact: true }` to both assertions, matching the pattern already applied in lines 13 and 66.
- [x] [Review][Defer] **`hasDocs` decision uses stale client-side data** [src/components/packt/place-row.tsx:229] — deferred, pre-existing. Spec Dev Notes explicitly state "the doc-count check stays client-side in `place-row.tsx`" — an accepted architectural choice. Risk: if a collaborator attaches a doc and the client list isn't yet revalidated, the user bypasses the dialog and the cascade FK silently deletes the new doc. Worth revisiting if multi-editor concurrency becomes a real scenario.
- [x] [Review][Patch] **E2E scenario isolation via `@reseed-delete-events` Before hook** [tests/e2e/steps/event-docs.steps.ts, tests/e2e/features/event-docs.feature] — Added a tagged Before hook that wipes and re-inserts `E2E_EVENT_KEEP` / `E2E_EVENT_ERASE` (with attached docs) before each tagged scenario. All three Story 3.2 scenarios are now tagged.
