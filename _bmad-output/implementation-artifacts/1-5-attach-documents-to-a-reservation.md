---
baseline_commit: ef28d11c582dac9c30445f1d7243b64af84cbf3e
---

# Story 1.5 — Attach Documents to a Reservation

**Status:** review
**Epic:** 1 — Reservation Management
**Branch:** feature/1-5-attach-documents-to-a-reservation

---

## User Story

As a traveler, I want to attach documents (confirmations, receipts, passes) directly to a reservation so that reservation-related files are grouped with the reservation rather than buried in the general trip documents list.

---

## Acceptance Criteria

### AC1 — No-documents empty state in reservation row
- When a reservation has no attached documents, the row shows a dashed "Add confirmation document" affordance (upload icon + placeholder text)
- Clicking the affordance opens the OS file picker (same accept types as TripDocsTab: `.pdf,.jpg,.jpeg,.png,.webp,.heic`)

### AC2 — Attach a document to a reservation
- Selecting a valid file uploads it and attaches it to the reservation
- Files larger than 25 MB are rejected with `toast.error("File is too large. Max 25 MB.")`
- After a successful upload, the document appears inline in the reservation row (DocKindBadge + truncated filename + delete icon button)
- An "Add document" icon button always remains visible to allow attaching additional documents

### AC3 — Remove a document from a reservation
- Clicking the delete icon button next to a document inline-deletes it (no confirmation dialog)
- The document disappears from the reservation row immediately (optimistic or after server round-trip)

### AC4 — Delete reservation cascades to documents
- Deleting a reservation that has attached documents deletes the blob(s) from Vercel Blob AND removes the document rows
- The DB cascade (`onDelete: "cascade"`) handles DB row cleanup; the server action must call `del()` on all blob URLs **before** the `db.delete(reservations)` call

### AC5 — Documents section in Add-reservation drawer
- The "Documents" section in `ReservationEditDrawer` shows: icon + "No documents yet" + "Attach a hotel confirmation, receipt, or other reservation document."
- No upload affordance in the drawer (no reservation ID exists until saved)

### AC6 — E2E: attach a document
- Given the trip has a Lodging reservation
- When I navigate to the Reservations tab
- And the Lodging section is expanded
- And I upload a file to the reservation
- Then the document appears inline in that reservation row

### AC7 — E2E: delete reservation cleans up documents
- Given the trip has a Lodging reservation with an attached document
- When I delete the reservation and confirm
- Then the reservation is gone (and therefore its documents are gone with it)

---

## Technical Tasks

Complete in this order to avoid cascading compile errors.

### Task 1 — Extend the database schema

**File:** `src/db/schema.ts`

Add `reservationId` column to the `documents` table, after the `eventId` column:

```ts
reservationId: uuid("reservation_id").references(() => reservations.id, { onDelete: "cascade" }),
```

Run `npm run db:migrate:e2e` after this change to push the schema to the E2E database.

> **Why before running migrations:** `db-mappers.ts` uses `documents.$inferSelect` which is derived from the schema. Updating schema first prevents TypeScript errors when updating the mapper.

### Task 2 — Extend domain types

**File:** `src/data/types.ts`

Three changes:

1. `Document["scope"]`: `"trip" | "event"` → `"trip" | "event" | "reservation"`
2. Add `documents?: Document[]` to the `Reservation` interface (follow the `TripEvent.docs?: Document[]` pattern — same optional field name)
3. Add `reservationId?: string` to `AddDocumentInput`

### Task 3 — Update the document mapper

**File:** `src/lib/db-mappers.ts`
**Unit test file (must update together):** `src/lib/db-mappers.test.ts`

In `dbDocToType()` (currently lines 112–127), make two changes:

**Orphan guard** (line 113):
```ts
// before
if (!row.tripId && !row.eventId) {
  throw new Error(`Orphan document id=${row.id}: both tripId and eventId are null`);
}
// after
if (!row.tripId && !row.eventId && !row.reservationId) {
  throw new Error(`Orphan document id=${row.id}: tripId, eventId, and reservationId are all null`);
}
```

**Scope derivation** (line 123):
```ts
// before
scope: row.eventId ? "event" : "trip",
// after
scope: row.reservationId ? "reservation" : row.eventId ? "event" : "trip",
```

**Test file changes required (same commit):**

- `BASE_DOC` fixture (line 284): add `reservationId: null` after `eventId: null` — required once schema inference expands
- Add tests inside the existing `dbDocToType` describe block:
  - `"maps scope to 'reservation' when reservationId is set"` — `BASE_DOC` override with `tripId: null`, `eventId: null`, `reservationId: "res-1"`, assert `scope === "reservation"`
  - `"maps scope to 'event' when eventId is set and reservationId is null"` — verify existing ordering is preserved when both could theoretically match
  - `"throws when tripId, eventId, and reservationId are all null"` — override all three to `null`, assert throws with updated message

### Task 4 — Load reservation documents in queries

**File:** `src/lib/queries.ts`
**Note:** This file is excluded from coverage. No test changes required for this file.

After line 246 (`const tripReservations = await db.select()...`), insert:

```ts
const reservationIds = tripReservations.map((row) => row.id);
const reservationDocRows =
  reservationIds.length > 0
    ? await db.select().from(documents).where(inArray(documents.reservationId, reservationIds))
    : [];
const docsByReservationId = new Map<string, (typeof documents.$inferSelect)[]>();
for (const docRow of reservationDocRows) {
  if (!docRow.reservationId) continue;
  const existing = docsByReservationId.get(docRow.reservationId) ?? [];
  existing.push(docRow);
  docsByReservationId.set(docRow.reservationId, existing);
}
```

Update the `reservations` mapping in the return object (currently `reservations: tripReservations.map(dbReservationToType)`):

```ts
reservations: tripReservations.map((row) => ({
  ...dbReservationToType(row),
  documents: (docsByReservationId.get(row.id) ?? []).map(dbDocToType),
})),
```

Add `inArray` to the drizzle-orm import if not already present.

### Task 5 — Add server actions for reservation documents

**File:** `src/app/(app)/trips/[tripId]/reservations/actions.ts`
**Test file (must update together):** `src/app/(app)/trips/[tripId]/reservations/actions.test.ts`

#### 5a — Update `deleteReservation` to clean up blobs

Before the `db.delete(reservations)...` call, query and delete all blobs:

```ts
// Fetch docs attached to this reservation so we can clean up their blobs.
const attachedDocs = await db.select().from(documents).where(eq(documents.reservationId, reservationId));
if (attachedDocs.length > 0 && process.env.UPLOAD_STUB !== "true") {
  await del(attachedDocs.map((doc) => doc.url).filter(Boolean) as string[]);
}
// The CASCADE FK on documents.reservation_id cleans the document rows via the DB delete below.
```

New imports needed in `actions.ts`:
- `del` from `@vercel/blob`
- `documents` from `@/db/schema` (alongside existing `reservations` import)

#### 5b — `uploadReservationDocument`

```ts
export async function uploadReservationDocument(reservationId: string, formData: FormData): Promise<void> {
  const user = await requireUser();
  const [reservation] = await db.select().from(reservations).where(eq(reservations.id, reservationId));
  if (!reservation) throw new Error("Reservation not found.");
  await assertTripAccess(reservation.tripId, user.id, "editor");

  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("No file provided.");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(`File is too large. Max ${formatFileSize(MAX_UPLOAD_BYTES)}.`);

  const kind = inferDocKind(file.name);
  const url =
    process.env.UPLOAD_STUB === "true"
      ? await saveLocalUpload(file)
      : (await put(file.name, file, { access: "public" })).url;

  await db.insert(documents).values({
    reservationId,
    name: file.name,
    kind,
    size: file.size,
    url,
  });

  revalidatePath(`/trips/${reservation.tripId}`);
}
```

New imports for `actions.ts` (beyond what 5a adds):
- `put` from `@vercel/blob`
- `MAX_UPLOAD_BYTES`, `inferDocKind`, `formatFileSize` from `@/lib/utils`
- `saveLocalUpload` from `@/lib/local-upload`
- `revalidatePath` from `next/cache` (already present)

#### 5c — `removeReservationDocument`

```ts
export async function removeReservationDocument(docId: string): Promise<void> {
  const user = await requireUser();
  const [doc] = await db.select().from(documents).where(eq(documents.id, docId));
  if (!doc) return; // idempotent
  if (!doc.reservationId) throw new Error("Document is not attached to a reservation.");

  const [reservation] = await db.select().from(reservations).where(eq(reservations.id, doc.reservationId));
  if (!reservation) throw new Error("Reservation not found.");

  await assertTripAccess(reservation.tripId, user.id, "editor");

  if (doc.url && process.env.UPLOAD_STUB !== "true") {
    await del(doc.url);
  }

  await db.delete(documents).where(eq(documents.id, docId));
  revalidatePath(`/trips/${reservation.tripId}`);
}
```

#### 5d — Test file additions

The test file mocks `@/db/schema` as `{ reservations: {} }`. This must be extended:

```ts
vi.mock("@/db/schema", () => ({
  reservations: {},
  documents: {},
}));
```

Add mocks for new dependencies:
```ts
const { put, del } = vi.hoisted(() => ({
  put: vi.fn(),
  del: vi.fn(),
}));
vi.mock("@vercel/blob", () => ({ put, del }));

const { saveLocalUpload } = vi.hoisted(() => ({
  saveLocalUpload: vi.fn(),
}));
vi.mock("@/lib/local-upload", () => ({ saveLocalUpload }));
```

Add to imports: `uploadReservationDocument, removeReservationDocument` from `./actions`.

**New test describe blocks:**

`describe("deleteReservation — blob cleanup")`:
- `"calls del() on each attached document blob URL before deleting the reservation row"` — mock `db.select` to return one doc with a URL; assert `del` called with the URL before `db.delete`
- `"skips del() when UPLOAD_STUB is 'true'"` — set `process.env.UPLOAD_STUB = "true"`, assert `del` NOT called
- `"skips del() when there are no attached documents"` — mock `db.select` returning empty array; assert `del` NOT called

`describe("uploadReservationDocument")`:
- `"throws when the reservation does not exist"` — mock `db.select` returning `[]`, assert throws "Reservation not found."
- `"checks editor access before uploading"` — assert `assertTripAccess` called with correct args
- `"rejects files larger than MAX_UPLOAD_BYTES"` — file.size > limit, assert throws
- `"calls put() with the file and inserts a document row"` — happy path; assert `put` called, `db.insert` called with correct values including `reservationId`
- `"calls saveLocalUpload() when UPLOAD_STUB is 'true'"` — assert `saveLocalUpload` called instead of `put`
- `"revalidates the trip path after upload"` — assert `revalidatePath` called with `/trips/trip-1`

`describe("removeReservationDocument")`:
- `"resolves silently when the document does not exist (idempotent)"` — mock doc select returning `[]`
- `"throws when the document is not attached to a reservation"` — doc has `reservationId: null`
- `"throws when the reservation is not found"` — second select returns `[]`
- `"checks editor access on the reservation's trip"` — assert `assertTripAccess`
- `"calls del() on the blob URL before deleting the document row"` — assert order: del then db.delete
- `"skips del() when UPLOAD_STUB is 'true'"` — set env var
- `"skips del() when the document has no url"` — doc.url is null
- `"revalidates the trip path after removal"` — assert `revalidatePath`

### Task 6 — Update `ReservationRow` to render and manage documents

**File:** `src/components/packt/reservation-row.tsx`
**Test file (must update together):** `src/components/packt/reservation-row.test.tsx`

#### Changes to `reservation-row.tsx`

New imports:
```ts
import { Upload } from "lucide-react";
import { uploadReservationDocument, removeReservationDocument } from "@/app/(app)/trips/[tripId]/reservations/actions";
import { MAX_UPLOAD_BYTES } from "@/lib/utils";
import { DocKindBadge } from "@/components/packt/doc-kind-badge";
import type { Document } from "@/data/types";
```

Add refs and transition:
```ts
const uploadInputRef = useRef<HTMLInputElement>(null);
const [isUploading, startUploadTransition] = useTransition();
```

> **Do not add `useState` for docs.** Use `reservation.documents ?? []` directly from props in the render. RSC revalidation delivers updated props automatically. See "State management in `ReservationRow`" in Dev Notes.

Add upload handler:
```ts
function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.size > MAX_UPLOAD_BYTES) {
    toast.error("File is too large. Max 25 MB.");
    if (uploadInputRef.current) uploadInputRef.current.value = "";
    return;
  }
  const formData = new FormData();
  formData.append("file", file);
  startUploadTransition(async () => {
    try {
      await uploadReservationDocument(reservation.id, formData);
    } catch {
      toast.error("Upload failed. Please try again.");
    } finally {
      if (uploadInputRef.current) uploadInputRef.current.value = "";
    }
  });
}
```

Add remove handler:
```ts
function handleRemoveDoc(docId: string) {
  startTransition(async () => {
    try {
      await removeReservationDocument(docId);
    } catch {
      toast.error("Failed to remove document.");
    }
  });
}
```

Add documents UI section below the Notes field and above `DeleteReservationAlertDialog`. Render `reservation.documents ?? []` directly — no local docs state:

```tsx
{/* Hidden file input */}
<input
  ref={uploadInputRef}
  type="file"
  accept=".pdf,.jpg,.jpeg,.png,.webp,.heic"
  aria-label="Upload document"
  style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0 }}
  onChange={handleFileChange}
/>

{/* Document rows or empty state */}
{(reservation.documents ?? []).length === 0 ? (
  <button
    type="button"
    aria-label="Add confirmation document"
    onClick={() => uploadInputRef.current?.click()}
    disabled={isUploading}
    className="inline-flex items-center gap-1.5 h-8 rounded px-3"
    style={{ border: "1px dashed var(--line)", background: "transparent", color: "var(--fg-3)", fontSize: 12, cursor: "pointer" }}
  >
    <Upload size={12} strokeWidth={1.5} aria-hidden="true" />
    Add confirmation document
  </button>
) : (
  <div className="mt-1.5 flex flex-col gap-1">
    {(reservation.documents ?? []).map((doc) => (
      <div key={doc.id} className="flex items-center gap-1.5">
        <DocKindBadge kind={doc.kind} />
        <span style={{ fontSize: 12, color: "var(--fg-2)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {doc.name}
        </span>
        <button
          type="button"
          title={`Remove ${doc.name}`}
          aria-label={`Remove ${doc.name}`}
          onClick={() => handleRemoveDoc(doc.id)}
          className="inline-flex items-center justify-center size-8 shrink-0 rounded"
          style={{ border: "none", background: "transparent", color: "var(--fg-3)", cursor: "pointer" }}
        >
          <Trash2 size={13} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>
    ))}
  </div>
)}

{/* Always-visible add-document icon button when docs exist */}
{(reservation.documents ?? []).length > 0 && (
  <button
    type="button"
    title="Add document"
    aria-label="Add document"
    onClick={() => uploadInputRef.current?.click()}
    disabled={isUploading}
    className="inline-flex items-center justify-center size-8 shrink-0 rounded mt-0.5"
    style={{ border: "none", background: "transparent", color: "var(--fg-3)", cursor: "pointer" }}
  >
    <Upload size={13} strokeWidth={1.5} aria-hidden="true" />
  </button>
)}
```

#### Test file changes

Add to the mock for actions:
```ts
vi.mock("@/app/(app)/trips/[tripId]/reservations/actions", () => ({
  updateReservation: vi.fn(),
  deleteReservation: vi.fn(),
  uploadReservationDocument: vi.fn(),
  removeReservationDocument: vi.fn(),
}));
```

Import `uploadReservationDocument, removeReservationDocument` from the mock.

Update `populatedReservation` fixture to include `documents: []` (no documents, still satisfies the `Reservation` type once `documents?: Document[]` is added).

Add a `withDocReservation` fixture:
```ts
const withDocReservation: Reservation = {
  ...populatedReservation,
  documents: [
    { id: "doc-1", name: "confirmation.pdf", kind: "pdf", size: 1024, scope: "reservation", offline: false, addedAt: "2026-08-01T00:00:00.000Z" },
  ],
};
```

New tests inside the `ReservationRow` describe block:

- `"shows the 'Add confirmation document' dashed button when there are no documents"` — render `emptyReservation`, assert button with name "Add confirmation document"
- `"renders attached documents with name and remove button"` — render `withDocReservation`, assert doc name visible, assert "Remove confirmation.pdf" button
- `"does not show the dashed add button when documents exist"` — render `withDocReservation`, assert no button named "Add confirmation document"
- `"shows the 'Add document' icon button when documents exist"` — render `withDocReservation`, assert button with title/name "Add document"
- `"calls uploadReservationDocument with the reservation id and formData on file change"` — mock file input change; assert `uploadReservationDocument` called with `"res-1"` and a FormData
- `"rejects a file larger than MAX_UPLOAD_BYTES with a toast error"` — trigger change with oversized file; assert `toast.error("File is too large. Max 25 MB.")`, assert `uploadReservationDocument` NOT called
- `"calls removeReservationDocument with the doc id when remove is clicked"` — click "Remove confirmation.pdf"; assert `removeReservationDocument("doc-1")`
- `"shows a toast error when upload fails"` — `uploadReservationDocument` rejects; assert `toast.error("Upload failed. Please try again.")`
- `"shows a toast error when remove fails"` — `removeReservationDocument` rejects; assert `toast.error("Failed to remove document.")`

### Task 7 — Update `ReservationEditDrawer` empty state

**File:** `src/components/packt/reservation-edit-drawer.tsx`
**Test file (must update together):** `src/components/packt/reservation-edit-drawer.test.tsx`

> **File size note:** `reservation-edit-drawer.tsx` is currently 263 lines — just over the ~250-line component limit. Task 7 changes one text string and adds zero new lines, so this story does not worsen the situation. However, no further code should be added to this file in this story. A component split (e.g., extracting the Documents section or the form fields group into a subcomponent) should be done as a follow-up refactor task before Story 1.6.

In the Documents `<Section>` (currently lines 236–247), update the `EmptyDescription`:

```tsx
<EmptyDescription>Attach a hotel confirmation, receipt, or other reservation document.</EmptyDescription>
```

Keep `EmptyContent` empty (no upload button in Add mode — reservation ID doesn't exist yet).

**Test file change (same commit):**

`reservation-edit-drawer.test.tsx` exists and must be updated. Add one test inside the existing `describe("ReservationEditDrawer")` block:

```ts
it("renders the Documents section with the correct empty state description", () => {
  render(<ReservationEditDrawer tripId="trip-1" type={ReservationType.Other} open onOpenChange={vi.fn()} />);

  expect(screen.getByText("No documents yet")).toBeInTheDocument();
  expect(
    screen.getByText("Attach a hotel confirmation, receipt, or other reservation document.")
  ).toBeInTheDocument();
});
```

### Task 8 — E2E seed and fixture support

**File:** `tests/e2e/e2e-seed-data.ts`

Add `reservationProvider?: string` to the `DocumentSeed` interface (after `eventName?`):

```ts
export interface DocumentSeed {
  name: string;
  kind: string;
  size?: number;
  url: string;
  eventName?: string;
  reservationProvider?: string; // if set, doc is attached to this reservation instead of the trip
}
```

**File:** `tests/e2e/scenario-fixture.ts`

After the reservations are inserted (currently around line 364–374), build a provider→id map:

```ts
const reservationIdsByProvider = new Map<string, string>();
for (const inserted of insertedReservations) {
  reservationIdsByProvider.set(inserted.provider, inserted.id);
}
```

When inserting documents (currently around lines 298–307), extend the resolution logic:

```ts
for (const docSeed of tripOverrides.documents ?? []) {
  const eventId = docSeed.eventName ? eventIdsByName.get(docSeed.eventName) ?? null : null;
  const reservationId = docSeed.reservationProvider
    ? reservationIdsByProvider.get(docSeed.reservationProvider) ?? null
    : null;
  await db.insert(documents).values({
    tripId: reservationId ? null : (eventId ? null : trip.id), // null tripId when scoped to reservation or event
    eventId,
    reservationId,
    name: docSeed.name,
    kind: docSeed.kind,
    size: docSeed.size ?? null,
    url: docSeed.url,
  });
}
```

> **Note on `tripId` nullability:** The `documents` table currently has `tripId` as nullable (it is null when `eventId` is set). After Task 1 adds `reservationId`, the same pattern applies: `tripId` is null when `reservationId` is set.

### Task 9 — E2E feature and step definitions

**File:** `tests/e2e/features/reservations.feature`

Add two new scenarios:

```gherkin
Scenario: Attach a document to a reservation
  Given the trip has a Lodging reservation
  And I am on the Reservations tab
  And the "Lodging" reservation section is expanded
  When I attach a file to the reservation "Original Hotel Name"
  Then the document "test-doc.pdf" appears on the reservation "Original Hotel Name"

Scenario: Delete a reservation with an attached document
  Given the trip has a Lodging reservation with an attached document
  And I am on the Reservations tab
  And the "Lodging" reservation section is expanded
  When I delete the reservation "Original Hotel Name"
  And I confirm the deletion
  Then the reservation "Original Hotel Name" is no longer shown
```

**File:** `tests/e2e/steps/reservations.steps.ts`

New step definitions:

```ts
Given("the trip has a Lodging reservation with an attached document", async ({ page, scenario }) => {
  await scenario.materialize({
    trip: {
      mother: "threeDayTrip",
      overrides: {
        reservations: [
          {
            type: "lodging",
            provider: "Original Hotel Name",
            startAt: "2030-01-10T15:00:00Z",
            endAt: "2030-01-12T11:00:00Z",
          },
        ],
        documents: [
          {
            name: "test-doc.pdf",
            kind: "pdf",
            size: 1024,
            url: "http://localhost/stub/test-doc.pdf",
            reservationProvider: "Original Hotel Name",
          },
        ],
      },
      setCurrent: true,
    },
  });
  await scenario.gotoCurrentTrip(page);
  await page.getByRole("button", { name: "Reservations" }).click();
});

When("I attach a file to the reservation {string}", async ({ page }, provider: string) => {
  // Trigger the hidden file input via the "Add confirmation document" button aria-label
  // Use Playwright's file chooser interception to bypass the OS picker.
  const [fileChooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Add confirmation document" }).click(),
  ]);
  await fileChooser.setFiles({
    name: "test-doc.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("PDF content"),
  });
});

Then("the document {string} appears on the reservation {string}", async ({ page }, docName: string, _provider: string) => {
  await expect(page.getByText(docName)).toBeVisible({ timeout: 10_000 });
});
```

---

## Dev Notes

### Architecture constraints

- **Auth pattern (non-negotiable):** Every server action must follow: `requireUser()` → `assertTripAccess(tripId, user.id, "editor")` → mutate → `revalidatePath("/trips/${tripId}")`. All three helpers already exist. See `src/lib/auth-helpers.ts`.
- **del()-before-cascade rule:** When deleting a reservation that has documents, call `del()` on all blob URLs **before** calling `db.delete(reservations)`. The DB cascade drops document rows automatically; if you call `del()` after, you risk leaving orphan blobs if the DB transaction fails partway. Current `deleteReservation` has no blob cleanup — Task 5a adds it.
- **UPLOAD_STUB guard:** Playwright E2E runs with `UPLOAD_STUB=true` in the webServer env (set in `playwright.config.ts`). Gate all `put()` and `del()` calls with `process.env.UPLOAD_STUB !== "true"`. When stubbed, use `saveLocalUpload(file)` from `@/lib/local-upload` for upload. For delete, simply skip.
- **`documents` table vs. `Document` type:** The `documents` table (DB) is the source of truth. After Task 1, `documents.$inferSelect` gains `reservationId: string | null`. The `Document` domain type never exposes `reservationId` — scope is encoded as `Document["scope"]` instead. Mapper derives scope from which FK is set.

### Key files and their current state

| File | State today | What this story changes |
|------|------------|------------------------|
| `src/db/schema.ts` | `documents` has `tripId`, `eventId` | Add `reservationId` FK |
| `src/data/types.ts` | `Document.scope: "trip" \| "event"`, no `Reservation.documents` | Add `"reservation"` to scope, add `documents?` to `Reservation`, add `reservationId?` to `AddDocumentInput` |
| `src/lib/db-mappers.ts` | Orphan check `!tripId && !eventId`; scope `eventId ? "event" : "trip"` | Extend both for reservationId |
| `src/lib/queries.ts` | Fetches reservations without docs | Join and group docs by reservationId |
| `reservations/actions.ts` | `deleteReservation` has no blob cleanup; no upload/remove doc actions | Add blob cleanup to delete; add `uploadReservationDocument`, `removeReservationDocument` |
| `reservation-row.tsx` | No document UI | Add doc list + upload + remove |
| `reservation-edit-drawer.tsx` | "Add a document once this reservation has been saved." | Updated copy per UX-DR5 |

### Imports reference for `reservations/actions.ts`

```ts
import "server-only";
import { db } from "@/db";
import { reservations, documents } from "@/db/schema";     // add `documents`
import { eq, inArray } from "drizzle-orm";                // add `inArray` if needed
import { requireUser, assertTripAccess } from "@/lib/auth-helpers";
import { revalidatePath } from "next/cache";
import { put, del } from "@vercel/blob";                   // add both
import { MAX_UPLOAD_BYTES, inferDocKind, formatFileSize } from "@/lib/utils"; // add
import { saveLocalUpload } from "@/lib/local-upload";      // add
```

### State management in `ReservationRow`

**Avoid the `useEffect` prop-sync anti-pattern.** Do NOT initialise `docs` as local state and then write `useEffect(() => { setDocs(reservation.documents ?? []); }, [reservation.documents])` to re-sync from props — this is a well-known React anti-pattern that causes double renders, stale state during transitions, and subtle bugs.

**Preferred approach:** skip the local `docs` state entirely. Render `reservation.documents ?? []` directly from props. After `uploadReservationDocument` or `removeReservationDocument` calls `revalidatePath`, the RSC parent re-renders and delivers updated `reservation.documents` as fresh props — no local state needed. This is the cleanest, most consistent approach with the rest of the codebase's revalidation model.

**Alternative:** If optimistic UI is desired (immediate feedback before the server round-trip), use React's `useOptimistic` hook rather than a manual `useState` + `useEffect` sync. Do not combine `useState` initialisation from props with a `useEffect` re-sync.

### DocKindBadge usage

`DocKindBadge` is already used in `DocRow` and `TripDocsTab`. Import from `@/components/packt/doc-kind-badge`. It accepts `kind: Document["kind"]` and renders a compact badge.

### Mock db select pattern in tests

The existing `actions.test.ts` mocks `db.select` as a chainable stub:
```ts
db.select.mockReturnValue({
  from: () => ({
    where: async () => (row ? [row] : []),
  }),
});
```

For `uploadReservationDocument` and `removeReservationDocument`, the actions call `db.select` once (for the reservation) or twice (doc + reservation). Chain `mockReturnValueOnce` calls in the correct order.

For `deleteReservation` with blob cleanup, mock `db.select` to return the reservation AND call a second select for docs: use `.mockReturnValueOnce` for the first (reservation) and `.mockReturnValueOnce` again for the second (docs).

### E2E: file upload via Playwright

Use `page.waitForEvent("filechooser")` before clicking the upload trigger. `UPLOAD_STUB=true` means `saveLocalUpload()` is called, which saves to a temp location and returns a local URL. The E2E assertion just checks the filename appears in the DOM — no real Vercel Blob involved.

### E2E seed fixture ordering

`scenario-fixture.ts` materializes the trip, then days, then events, then reservations, then documents. Documents seeded with `reservationProvider` must be inserted **after** reservations so the ID is available. The current order already satisfies this — just add the `reservationIdsByProvider` map build after reservations are inserted.

### Deferred / out of scope

- Pagination or filtering of reservation documents (no AC for this)
- Document rename or download from the reservation row (UX-DR3 specifies compact view only — DocRow features like rename/share/offline are not part of this story)
- Event-document upload from the same pattern (already exists via `EventDocSection` / trip actions — not touched)

---

## Files to Create

None — this story only modifies existing files.

## Files to Modify

| File | Change summary |
|------|---------------|
| `src/db/schema.ts` | Add `reservationId` FK to `documents` table |
| `src/data/types.ts` | Extend `Document.scope`, add `Reservation.documents`, add `AddDocumentInput.reservationId` |
| `src/lib/db-mappers.ts` | Extend orphan check and scope derivation |
| `src/lib/db-mappers.test.ts` | Add `reservationId: null` to BASE_DOC; add 3 tests |
| `src/lib/queries.ts` | Load and group reservation docs |
| `src/app/(app)/trips/[tripId]/reservations/actions.ts` | Blob cleanup in deleteReservation; add uploadReservationDocument, removeReservationDocument |
| `src/app/(app)/trips/[tripId]/reservations/actions.test.ts` | Extend schema mock; add tests for all 3 action changes |
| `src/components/packt/reservation-row.tsx` | Add doc list, upload, remove UI |
| `src/components/packt/reservation-row.test.tsx` | Add tests for new doc UI |
| `src/components/packt/reservation-edit-drawer.tsx` | Update empty state description copy |
| `tests/e2e/e2e-seed-data.ts` | Add `reservationProvider?` to `DocumentSeed` |
| `tests/e2e/scenario-fixture.ts` | Build `reservationIdsByProvider` map; use it when inserting reservation-scoped docs |
| `tests/e2e/features/reservations.feature` | Add 2 scenarios |
| `tests/e2e/steps/reservations.steps.ts` | Add step defs for the 2 new scenarios |

---

## Definition of Done

- [ ] `npm run db:migrate:e2e` succeeds (schema pushed with `reservation_id` column)
- [ ] `npm run test:coverage` passes with ≥95% lines/functions, ≥90% branches
- [ ] `npm run test:e2e` passes including both new reservation document scenarios
- [ ] `npm run build` succeeds with no TypeScript errors
- [ ] `npx eslint src tests --max-warnings 0` passes (no single-letter vars, no `any`, etc.)
- [ ] Visual check: reservation row shows dashed affordance when no docs, inline doc list when docs exist
- [ ] Visual check: "Documents" section in Add-reservation drawer shows updated empty state copy
