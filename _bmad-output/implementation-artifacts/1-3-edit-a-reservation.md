---
baseline_commit: 8a56f490dfd30533fe12eb2bc18dcb441d89450d
---

# Story 1.3: Edit a Reservation

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a trip planner,
I want to edit any field of an existing Reservation (except its type),
so that I can keep my booking details accurate as my plans change.

## Acceptance Criteria

1. **Click-to-edit entry (FR3/UX-DR10)** — In an expanded `ReservationTypeSection`, each of the up to 5 editable fields on a Reservation row — provider, start anchor (date+time), end anchor (date+time), confirmation code, notes — is rendered as its own `<button>` (display mode) that, when clicked, switches that single field into an inline edit mode (input(s) with a `1px solid var(--accent-brand)` "teal underline"), matching `doc-row.tsx`'s inline-rename pattern. Only one field per row is in edit mode at a time. Fields with no value show a muted `var(--fg-3)` placeholder ("Add confirmation code" / "Add notes" / "Add {anchor label}") in display mode.
2. **Save on Enter/blur (FR3)** — For provider, confirmation code, and notes: pressing Enter (provider/confirmation code only) or blurring the field calls `updateReservation(reservation.id, patch)` (`requireUser()` → `assertTripAccess(tripId, "editor")` → update → `revalidatePath`), the row re-renders with the persisted value, and edit mode closes. For the anchor (date+time) fields: a small inline Save (`Check`) / Cancel (`X`) icon-button pair appears next to the date/time inputs while editing; clicking Save (or pressing Enter in either the date or time input) combines the two values and calls `updateReservation`.
3. **Escape cancels (UX-DR10)** — Pressing Escape in any field's edit mode discards the in-flight edit, reverts the field to its prior displayed value with no server call, closes edit mode, and returns focus to that field's display `<button>`.
4. **Always-focusable display buttons (UX-DR10)** — Every one of the 5 fields, in display mode, is a real `<button>` (not a `<span>`), focusable in normal tab order with the standard `:focus-visible` ring, including fields currently showing the muted "Add ..." placeholder.
5. **Type remains immutable and display-only (FR3)** — `type` continues to be shown only via the accordion's icon/title (`ReservationTypeSection`'s header) and is never part of any edit affordance on the row. For "Other"-type Reservations, the generic "Start"/"End" anchor labels remain as the field labels — only the date/time *values* are editable.
6. **Linked Events stay in sync (FR3)** — Because `updateReservation` calls `revalidatePath(/trips/${tripId})`, any server-rendered Linked Events derived from `startAt`/`endAt` (Epic 2, out of scope for this story's UI but already wired at the query layer if present) reflect the new values on next render with no separate sync step — this story does not need to special-case Linked Events, just ensure the revalidate happens.

## Tasks / Subtasks

- [ ] **Task 1: `UpdateReservationPatch` type + `updateReservation` server action** (AC: 2, 3, 5)
  - [ ] Add `UpdateReservationPatch` to `src/data/types.ts` (next to `CreateReservationInput`, ~line 663): `{ provider?: string; startAt?: string; endAt?: string; confirmationCode?: string; notes?: string }` — no `type` field (immutable)
  - [ ] Add `updateReservation(reservationId: string, patch: UpdateReservationPatch): Promise<void>` to `src/app/(app)/trips/[tripId]/reservations/actions.ts` (see Dev Notes for full implementation — fetches the existing row first to get `tripId`/`type`/current anchors for validation, mirrors `updateEvent`'s `requireUser()` → `assertTripAccess` → `db.update` → `revalidatePath` shape)
  - [ ] Add `reservations/actions.test.ts` (new file) covering `updateReservation`: successful patch of each field independently, provider-empty rejection, `endAt` cleared on a `REQUIRES_END_AT` type rejection, `endAt` set with no `startAt` rejection, `endAt` before `startAt` rejection, and a successful patch that omits fields (only provided keys change)

- [ ] **Task 2: Move `formatAnchorDateTime` to `reservation-type-badge.tsx`** (AC: 1 — refactor to avoid an import cycle)
  - [ ] Move the `formatAnchorDateTime(iso: string): string` function (currently defined and exported from `reservation-type-section.tsx`) into `reservation-type-badge.tsx`, exported alongside `RESERVATION_TYPE_META`/`ANCHOR_LABELS`
  - [ ] In `reservation-type-section.tsx`, replace the local definition with `export { formatAnchorDateTime } from "@/components/packt/reservation-type-badge";` so existing imports (including `reservation-type-section.test.tsx`'s `import { formatAnchorDateTime, ... } from "./reservation-type-section"`) keep working unchanged
  - [ ] No test changes needed for this subtask — `reservation-type-section.test.tsx`'s existing `formatAnchorDateTime` tests must still pass via the re-export

- [ ] **Task 3: `ReservationInlineTextField` shared component** (AC: 1, 2, 3, 4 — provider, confirmation code, notes)
  - [ ] Create `src/components/packt/reservation-inline-text-field.tsx` — `"use client"`, explicit `ReservationInlineTextFieldProps` interface (see Dev Notes). A generic click-to-edit text/textarea field implementing the `doc-row.tsx` inline-rename pattern (display `<button>` → input/textarea with teal underline → Enter (input only) or blur saves → Escape cancels and returns focus to the display `<button>`). Used 3× by `ReservationRow` (Task 5): provider (single-line, required), confirmation code (single-line, optional), notes (multiline, optional)
  - [ ] Create `src/components/packt/reservation-inline-text-field.test.tsx` covering: display rendering (value vs. muted placeholder when empty/`allowEmpty`), click → edit mode, Enter-save (single-line only) and blur-save calling the provided `onSave`, Escape-cancel with no `onSave` call and focus returned to the display button, multiline mode (textarea, no Enter-save), and an `onSave` rejection showing `toast.error` without exiting edit mode being left in a broken state (field stays editable, draft preserved)

- [ ] **Task 4: `ReservationAnchorEditField` shared component** (AC: 1, 2, 3, 4 — start/end anchors)
  - [ ] Create `src/components/packt/reservation-anchor-edit-field.tsx` — `"use client"`, explicit `ReservationAnchorEditFieldProps` interface (see Dev Notes). A click-to-edit date+time pair: display `<button>` (formatted value or muted "Add {label}" placeholder, both with a constructed `aria-label`) → `DatePicker` + `TimePicker` + Save(`Check`)/Cancel(`X`) icon buttons → Enter in either input or clicking Save calls `onSave`, Escape or clicking Cancel discards and returns focus to the display button. Used 2× by `ReservationRow` (Task 5): start anchor, end anchor
  - [ ] Create `src/components/packt/reservation-anchor-edit-field.test.tsx` covering: display rendering (formatted value vs. muted "Add {label}" placeholder, both with correct `aria-label`), click → edit mode shows `DatePicker`+`TimePicker`+Save/Cancel, Enter in the time input and clicking Save both call `onSave` with the combined ISO string, Escape and clicking Cancel both discard with no `onSave` call and return focus to the display button, an `onSave` rejection shows an inline `role="status"` error and keeps edit mode open

- [ ] **Task 5: `ReservationRow` orchestrator component** (AC: 1, 2, 3, 4, 5)
  - [ ] Create `src/components/packt/reservation-row.tsx` — `"use client"`, explicit `ReservationRowProps` interface (`{ reservation: Reservation; type: ReservationType; isLast: boolean }`). Composes `ReservationInlineTextField` (×3: provider, confirmation code, notes) and `ReservationAnchorEditField` (×2: start, end), each wired to `updateReservation` per the Dev Notes spec. Owns the outer row `<div>` (padding/border, unchanged from the current inline markup) and the local `provider`/`startAt`/`endAt`/`confirmationCode`/`notes` display-state mirrors that each `onSave` updates on success
  - [ ] Create `src/components/packt/reservation-row.test.tsx` — integration-level: renders all 5 fields with correct initial values/placeholders for a populated and a mostly-empty Reservation, verifies the confirmation-code chip vs. placeholder rendering, the provider's bold/`card-title` styling, the anchor labels (including "Other"-type's generic "Start"/"End"), and that editing one field (mocking `updateReservation`) updates only that field's displayed value while leaving the others unchanged — detailed per-field edit-mode behavior is covered by Tasks 3/4's component tests, not duplicated here

- [ ] **Task 6: Wire `ReservationRow` into `ReservationTypeSection`** (AC: all)
  - [ ] Replace the inline expanded-row JSX (the `open && sortReservationsByStartAt(reservations).map(...)` block) with `<ReservationRow key={reservation.id} reservation={reservation} type={type} isLast={index === all.length - 1} />`
  - [ ] Update `reservation-type-section.test.tsx`: the existing "renders anchor lines and a confirmation-code chip for an expanded row" and "renders expanded rows ordered by startAt..." tests now render `ReservationRow` — verify they still pass given `ReservationRow`'s display-mode output matches the prior inline markup (provider text, anchor label/value pairs, confirmation chip); add one new test confirming a click on the provider field of a row inside `ReservationTypeSection` enters edit mode (integration smoke test — detailed field behavior is covered by Tasks 3-5's component tests)

- [ ] **Task 7: E2E scenario** (AC: 1, 2, 3)
  - [ ] Add a scenario to `tests/e2e/features/reservations.feature`: materialize a trip with an existing Lodging Reservation (Object Mother), expand its accordion section, edit the provider inline (click → type new value → blur or Enter), edit the "Check-in" anchor inline (click → change date/time → click Save), reload the page, and verify both new values persisted
  - [ ] Add the corresponding step definitions to `tests/e2e/steps/reservations.steps.ts` (see Dev Notes for exact step text and Playwright selectors)

## Dev Notes

### Scope boundary — read first

This story makes the 5 fields on an **expanded** Reservation row (provider, start anchor, end anchor, confirmation code, notes) individually click-to-edit. Explicitly OUT of scope:

- Delete affordance on a row — **Story 1.4**.
- Document rows / "Add confirmation document" affordance — **Story 1.5**. Do not add document UI to `reservation-row.tsx` in this story.
- Linked Events on the Itinerary, the FR-9 CTA, `?tab=res&action=...`/`?highlight=...` orchestration — **Epic 2**. `updateReservation` must call `revalidatePath` (so Epic 2's query-layer merge, once it exists, picks up the change automatically), but this story adds no Itinerary-side code or tests.
- The collapsed-state preview line (`renderPreview`/`getNextUpcoming`) and accordion header are unchanged — editing only applies to the **expanded** row list.
- `type` is never editable anywhere — confirmed by AC5; do not add any UI that could change `reservation.type`.

### Task 1 — `UpdateReservationPatch` and `updateReservation`

Add to `src/data/types.ts`, immediately after `CreateReservationInput` (~line 663):

```ts
export interface UpdateReservationPatch {
  provider?: string;
  startAt?: string;
  endAt?: string;
  confirmationCode?: string;
  notes?: string;
}
```

All fields optional; only keys present in the patch are changed. `startAt`/`endAt` set to an empty string (`""`) means "clear this anchor" (mirrors `combineAnchor`'s `undefined` semantics in the drawer — see below for how `ReservationRow` decides between "no change", "set", and "clear"). `confirmationCode`/`notes` set to `""` means "clear".

Add to `src/app/(app)/trips/[tripId]/reservations/actions.ts` (current file is 38 lines; the existing `REQUIRES_END_AT` const at the top is reused):

```ts
export async function updateReservation(reservationId: string, patch: UpdateReservationPatch): Promise<void> {
  const user = await requireUser();

  const [existing] = await db.select().from(reservations).where(eq(reservations.id, reservationId));
  if (!existing) {
    throw new Error("Reservation not found.");
  }

  await assertTripAccess(existing.tripId, user.id!, "editor");

  if (patch.provider !== undefined && !patch.provider.trim()) {
    throw new Error("Provider is required.");
  }

  const type = existing.type as ReservationType;
  const nextStartAt = patch.startAt !== undefined ? patch.startAt || undefined : existing.startAt?.toISOString();
  const nextEndAt = patch.endAt !== undefined ? patch.endAt || undefined : existing.endAt?.toISOString();

  if (REQUIRES_END_AT.includes(type) && !nextEndAt) {
    throw new Error("An end date and time is required for this reservation type.");
  }

  if (nextEndAt && !nextStartAt) {
    throw new Error("A start date and time is required when an end date and time is set.");
  }

  if (nextStartAt && nextEndAt && new Date(nextEndAt).getTime() < new Date(nextStartAt).getTime()) {
    throw new Error("The end date and time must be after the start date and time.");
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.provider !== undefined) updates.provider = patch.provider.trim();
  if (patch.startAt !== undefined) updates.startAt = patch.startAt ? new Date(patch.startAt) : null;
  if (patch.endAt !== undefined) updates.endAt = patch.endAt ? new Date(patch.endAt) : null;
  if (patch.confirmationCode !== undefined) updates.confirmationCode = patch.confirmationCode || null;
  if (patch.notes !== undefined) updates.notes = patch.notes || null;

  await db.update(reservations).set(updates).where(eq(reservations.id, reservationId));

  revalidatePath(`/trips/${existing.tripId}`);
}
```

Notes:
- `import { eq } from "drizzle-orm";` and `import type { UpdateReservationPatch } from "@/data/types";` need adding to the existing import list (current file imports `ReservationType, type CreateReservationInput` from `@/data/types` — extend that line).
- The error message wording deliberately matches `createReservation`'s existing "An end date and time is required for this reservation type." (no per-type label substitution) — keeps both actions' error strings consistent and avoids importing `ANCHOR_LABELS` (a `"use client"` module) into this `"use server"` file.
- `Record<string, unknown>` for `updates` matches the variable shape Drizzle's `.set()` accepts; if `npx tsc` complains about the loosely-typed object, narrow to `Partial<typeof reservations.$inferInsert>` instead — either is acceptable as long as it type-checks under `strict: true`.

### Task 2 — moving `formatAnchorDateTime`

`reservation-type-section.tsx` currently defines and exports:

```ts
export function formatAnchorDateTime(iso: string): string {
  const date = new Date(iso);
  const datePart = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const timePart = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${datePart} · ${timePart}`;
}
```

`ReservationAnchorEditField` (Task 4, used by `ReservationRow`, Task 5) needs this same formatter for its anchor-field display mode. `ReservationRow` is rendered *by* `ReservationTypeSection`, so importing `formatAnchorDateTime` from `reservation-type-section.tsx` into `reservation-row.tsx`/`reservation-anchor-edit-field.tsx` would create an import cycle. Move the function verbatim into `reservation-type-badge.tsx` (which has no dependency on either file), and in `reservation-type-section.tsx` replace the definition with a re-export:

```ts
export { formatAnchorDateTime } from "@/components/packt/reservation-type-badge";
```

`reservation-type-section.test.tsx` imports `formatAnchorDateTime` from `"./reservation-type-section"` — the re-export keeps that working with zero test changes.

### Shared styling constants

`reservation-row.tsx` (Task 5) defines and passes these down to Tasks 3/4 components via their style props:

```ts
const FIELD_LABEL_STYLE: React.CSSProperties = { color: "var(--fg-3)", minWidth: 68, fontSize: 13 };
const FIELD_VALUE_STYLE: React.CSSProperties = { color: "var(--fg-2)", fontSize: 13 };
const PLACEHOLDER_STYLE: React.CSSProperties = { color: "var(--fg-3)", fontSize: 13, fontStyle: "italic" };
const EDIT_INPUT_STYLE: React.CSSProperties = {
  flex: 1,
  fontFamily: "var(--font-body, ui-sans-serif)",
  fontSize: "calc(14px * var(--font-scale))",
  color: "var(--fg)",
  background: "transparent",
  border: "none",
  borderBottom: "1px solid var(--accent-brand)",
  outline: "none",
  padding: 0,
};
```

`ReservationInlineTextField` (Task 3) and `ReservationAnchorEditField` (Task 4) use `EDIT_INPUT_STYLE` (merged with per-field overrides) as their default edit-mode style and accept `displayStyle`/`PLACEHOLDER_STYLE`-equivalents via props so the constants stay defined once, in `reservation-row.tsx`, and are threaded down rather than duplicated.

### Task 3 — `reservation-inline-text-field.tsx`

```tsx
"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

export interface ReservationInlineTextFieldProps {
  value: string;
  placeholder: string;
  ariaLabel: string;
  multiline?: boolean;
  displayStyle?: React.CSSProperties;
  inputStyle?: React.CSSProperties;
  renderDisplay?: (value: string) => ReactNode;
  onSave: (value: string) => Promise<void>;
}
```

A generic click-to-edit text/textarea field implementing the `doc-row.tsx` inline-rename pattern. It is **uncontrolled with respect to persistence** — `value` is the parent's display-state mirror, and `ReservationInlineTextField` calls `onSave` but never updates `value` itself; the caller (`ReservationRow`, Task 5) updates its own state on a successful save.

State: `editing`, `draft`, `cancelRef` (`useRef(false)`), `displayRef` (`useRef<HTMLButtonElement | null>(null)`), `wasEditingRef` (`useRef(false)`) — the focus-return effect mirrors `doc-row.tsx`:

```ts
useEffect(() => {
  if (wasEditingRef.current && !editing) {
    displayRef.current?.focus();
  }
  wasEditingRef.current = editing;
}, [editing]);
```

**Display mode** — always a real `<button type="button">` (AC4), focusable, `ref={displayRef}`, `onClick={() => { setDraft(value); setEditing(true); }}`:
- If `value` is non-empty: render `renderDisplay ? renderDisplay(value) : value`, styled with `displayStyle`.
- If `value` is empty: render `placeholder` styled with `PLACEHOLDER_STYLE` (muted `var(--fg-3)`, italic) — this is the "Add ..." affordance from AC1/AC4.

**Edit mode**:
- `multiline === false` (default): `<input>` with `{ ...EDIT_INPUT_STYLE, ...inputStyle }`, `autoFocus`, `aria-label={ariaLabel}`, `value={draft}`, `onChange`.
  - `onKeyDown`: `"Enter"` → `event.preventDefault(); void save();`. `"Escape"` → `event.preventDefault(); cancelRef.current = true; setEditing(false);`.
  - `onBlur`: if `cancelRef.current`, reset it to `false` and return (no save); otherwise `void save();`.
- `multiline === true`: `<textarea>` with `{ ...EDIT_INPUT_STYLE, ...inputStyle, minHeight: 60, resize: "vertical" as const, whiteSpace: "pre-wrap" }`, `autoFocus`, `aria-label={ariaLabel}`, `value={draft}`, `onChange`.
  - `onKeyDown`: **only** `"Escape"` is handled (same `cancelRef`/`setEditing(false)` as above) — Enter is left to insert a newline.
  - `onBlur`: same cancel-or-save logic as the single-line case.

**`save()`**:
```ts
async function save() {
  if (draft === value) {
    setEditing(false);
    return;
  }
  try {
    await onSave(draft);
    setEditing(false);
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Failed to save reservation.");
    // stay in edit mode with the draft preserved so the user can fix and retry, or press Escape to cancel
  }
}
```

Note the rejection path does **not** call `setEditing(false)` — this satisfies the Task 3 test requirement that an `onSave` rejection leaves the field editable with the draft intact.

**Usages by `ReservationRow` (Task 5)**:
- **Provider** — `ariaLabel="Provider"`, `multiline={false}`, `placeholder=""` (provider is always populated, so the placeholder path is unreachable but the prop is still required by the interface), `displayStyle={{ fontSize: "calc(var(--fs-card-title) * var(--font-scale))", fontWeight: 600, color: "var(--fg)" }}`, `inputStyle={{ fontSize: "calc(var(--fs-card-title) * var(--font-scale))", fontWeight: 600 }}`. `onSave={async (next) => { await updateReservation(reservation.id, { provider: next }); setProvider(next); }}` — server-side "Provider is required." rejection (empty/whitespace) surfaces via the `toast.error` path above.
- **Confirmation code** — `ariaLabel="Confirmation code"`, `multiline={false}`, `placeholder="Add confirmation code"`, `inputStyle={{ fontFamily: "var(--font-mono-family, ui-monospace)", fontSize: 12 }}`, `renderDisplay={(code) => (/* existing Wallet-icon chip: inline-flex, var(--surface-2) background, mono font, 2px 8px padding, wrapping the Wallet icon + code text */)}`. `onSave={async (next) => { await updateReservation(reservation.id, { confirmationCode: next }); setConfirmationCode(next || undefined); }}` — `next === ""` clears the code (the action's `patch.confirmationCode || null` handles this).
- **Notes** — `ariaLabel="Notes"`, `multiline={true}`, `placeholder="Add notes"`, `displayStyle={{ color: "var(--fg-2)", fontSize: 13, whiteSpace: "pre-wrap", textAlign: "left", width: "100%" }}`. `onSave={async (next) => { await updateReservation(reservation.id, { notes: next }); setNotes(next || undefined); }}`.

### Task 4 — `reservation-anchor-edit-field.tsx`

```tsx
"use client";

export interface ReservationAnchorEditFieldProps {
  label: string;
  value: string | undefined;
  onSave: (iso: string) => Promise<void>;
}
```

A click-to-edit date+time pair. Unlike Task 3's fields, editing requires two inputs (date + time) confirmed together via explicit Save/Cancel icon buttons rather than Enter/blur.

State: `editing`, `dateDraft`/`timeDraft` (`string | undefined`), `error` (`string | undefined`), `displayRef`/`wasEditingRef` (same focus-return pattern as Task 3).

**Display mode** — always a real `<button type="button">` (AC4), `ref={displayRef}`:
- If `value` is set: text = `formatAnchorDateTime(value)` (imported from `reservation-type-badge.tsx`, Task 2), styled `FIELD_VALUE_STYLE`, **`aria-label={`${label}: ${formatAnchorDateTime(value)}`}`**.
- If `value` is unset: text = `Add ${label.toLowerCase()}`, styled `PLACEHOLDER_STYLE`, **`aria-label={`Add ${label.toLowerCase()}`}`**.

These `aria-label`s are a hard requirement (accessibility AC4 + the stable selector Task 7's E2E scenario relies on), not just an E2E nicety.

`onClick` → `openEdit()`: if `value` is set, split it into `dateDraft = value.slice(0, 10)` / `timeDraft = value.slice(11, 16)` (both derived from the ISO string directly — no `Date` round-trip needed); otherwise both `undefined`. Clears `error`. Sets `editing = true`.

**Edit mode**:
```tsx
<div
  className="flex flex-col gap-1"
  onKeyDownCapture={(event) => {
    if (event.key === "Enter") { event.preventDefault(); void save(); }
    else if (event.key === "Escape") { event.preventDefault(); cancel(); }
  }}
>
  <div className="flex items-center gap-2">
    <DatePicker value={dateDraft} onChange={setDateDraft} aria-label={`${label} date`} aria-invalid={!!error} />
    <TimePicker value={timeDraft} onChange={setTimeDraft} aria-label={`${label} time`} aria-invalid={!!error} />
    <button type="button" title="Save" aria-label={`Save ${label}`} onClick={() => void save()}
      className="inline-flex items-center justify-center size-8 rounded"
      style={{ border: "none", background: "transparent", color: "var(--accent-brand)", cursor: "pointer" }}>
      <Check size={16} strokeWidth={1.5} aria-hidden="true" />
    </button>
    <button type="button" title="Cancel" aria-label={`Cancel editing ${label}`} onClick={cancel}
      className="inline-flex items-center justify-center size-8 rounded"
      style={{ border: "none", background: "transparent", color: "var(--fg-3)", cursor: "pointer" }}>
      <X size={16} strokeWidth={1.5} aria-hidden="true" />
    </button>
  </div>
  {error && (
    <p role="status" aria-live="polite" style={{ fontSize: 11, color: "var(--destructive)" }}>{error}</p>
  )}
</div>
```

`onKeyDownCapture` on the wrapping `<div>` is the chosen approach for Enter/Escape (avoids adding `onKeyDown` passthrough props to the shared `DatePicker`/`TimePicker` primitives in `src/components/ui/**`).

**`save()`**:
```ts
async function save() {
  const hasDate = !!dateDraft;
  const hasTime = !!timeDraft;
  if (hasDate !== hasTime) {
    setError("Enter both a date and a time.");
    return;
  }
  const nextIso = hasDate ? `${dateDraft}T${timeDraft}:00.000Z` : "";
  try {
    await onSave(nextIso);
    setEditing(false);
  } catch (error) {
    setError(error instanceof Error ? error.message : "Failed to save reservation.");
    // stay in edit mode
  }
}
```

**`cancel()`**: `setEditing(false)` with no `onSave` call — drafts are discarded (re-derived from `value` next time `openEdit()` runs). Focus returns to the display button via the `wasEditingRef` effect, same as Task 3.

**Usages by `ReservationRow` (Task 5)**, each wrapped in the row layout `<div className="flex items-start gap-2" style={{ fontSize: 13 }}><span style={FIELD_LABEL_STYLE}>{label}</span><ReservationAnchorEditField ... /></div>`:
- **Start anchor** — `label={ANCHOR_LABELS[type].start}`, `value={startAt}`, `onSave={async (iso) => { await updateReservation(reservation.id, { startAt: iso }); setStartAt(iso || undefined); }}`.
- **End anchor** — `label={ANCHOR_LABELS[type].end}`, `value={endAt}`, `onSave={async (iso) => { await updateReservation(reservation.id, { endAt: iso }); setEndAt(iso || undefined); }}`.

### Task 5 — `reservation-row.tsx`

```tsx
"use client";

import { useState } from "react";
import { ANCHOR_LABELS } from "@/components/packt/reservation-type-badge";
import { ReservationInlineTextField } from "@/components/packt/reservation-inline-text-field";
import { ReservationAnchorEditField } from "@/components/packt/reservation-anchor-edit-field";
import { updateReservation } from "@/app/(app)/trips/[tripId]/reservations/actions";
import { ReservationType, type Reservation } from "@/data/types";

export interface ReservationRowProps {
  reservation: Reservation;
  type: ReservationType;
  isLast: boolean;
}
```

`ReservationRow` is the orchestrator: it owns the outer row wrapper and the per-field display-state mirrors, and composes Tasks 3/4's shared components for the 5 editable fields. It does not implement any edit-mode logic itself — that lives entirely in `ReservationInlineTextField`/`ReservationAnchorEditField`.

State (initialized from `reservation` props): `provider` (string), `startAt`/`endAt` (`string | undefined`), `confirmationCode`/`notes` (`string | undefined`). Each field's `onSave` callback awaits `updateReservation` and, on success, updates the corresponding state setter — this is how the row reflects the persisted value immediately without a full page reload (AC2).

**Return shape** — same outer `<div>` wrapper as the prior inline JSX, field order unchanged (provider, start anchor, end anchor, confirmation code) with notes appended last as new UI surface:

```tsx
return (
  <div className="px-4 py-3.5" style={{ borderBottom: isLast ? "none" : "1px solid var(--line)" }}>
    <ReservationInlineTextField
      value={provider}
      ariaLabel="Provider"
      placeholder=""
      displayStyle={{ fontSize: "calc(var(--fs-card-title) * var(--font-scale))", fontWeight: 600, color: "var(--fg)" }}
      inputStyle={{ fontSize: "calc(var(--fs-card-title) * var(--font-scale))", fontWeight: 600 }}
      onSave={async (next) => { await updateReservation(reservation.id, { provider: next }); setProvider(next); }}
    />
    <div className="flex items-start gap-2" style={{ fontSize: 13 }}>
      <span style={FIELD_LABEL_STYLE}>{ANCHOR_LABELS[type].start}</span>
      <ReservationAnchorEditField
        label={ANCHOR_LABELS[type].start}
        value={startAt}
        onSave={async (iso) => { await updateReservation(reservation.id, { startAt: iso }); setStartAt(iso || undefined); }}
      />
    </div>
    <div className="flex items-start gap-2" style={{ fontSize: 13 }}>
      <span style={FIELD_LABEL_STYLE}>{ANCHOR_LABELS[type].end}</span>
      <ReservationAnchorEditField
        label={ANCHOR_LABELS[type].end}
        value={endAt}
        onSave={async (iso) => { await updateReservation(reservation.id, { endAt: iso }); setEndAt(iso || undefined); }}
      />
    </div>
    <ReservationInlineTextField
      value={confirmationCode ?? ""}
      ariaLabel="Confirmation code"
      placeholder="Add confirmation code"
      inputStyle={{ fontFamily: "var(--font-mono-family, ui-monospace)", fontSize: 12 }}
      renderDisplay={(code) => (/* Wallet-icon chip, as in the current implementation */)}
      onSave={async (next) => { await updateReservation(reservation.id, { confirmationCode: next }); setConfirmationCode(next || undefined); }}
    />
    <ReservationInlineTextField
      value={notes ?? ""}
      ariaLabel="Notes"
      placeholder="Add notes"
      multiline
      displayStyle={{ color: "var(--fg-2)", fontSize: 13, whiteSpace: "pre-wrap", textAlign: "left", width: "100%" }}
      onSave={async (next) => { await updateReservation(reservation.id, { notes: next }); setNotes(next || undefined); }}
    />
  </div>
);
```

`FIELD_LABEL_STYLE` (and the other shared constants from the "Shared styling constants" section above) are defined at module scope in `reservation-row.tsx`.

### Task 6 — `reservation-type-section.tsx` changes

Current expanded-row block (lines ~144-170 of `reservation-type-section.tsx`):

```tsx
{open &&
  sortReservationsByStartAt(reservations).map((reservation, index, all) => (
    <div key={reservation.id} className="px-4 py-3.5" style={{ borderBottom: index < all.length - 1 ? "1px solid var(--line)" : "none" }}>
      <div style={{ fontSize: "calc(var(--fs-card-title) * var(--font-scale))", fontWeight: 600 }}>{reservation.provider}</div>
      {renderAnchorLine(ANCHOR_LABELS[type].start, reservation.startAt)}
      {renderAnchorLine(ANCHOR_LABELS[type].end, reservation.endAt)}
      {reservation.confirmationCode && (/* chip */)}
    </div>
  ))}
```

Replace with:

```tsx
{open &&
  sortReservationsByStartAt(reservations).map((reservation, index, all) => (
    <ReservationRow key={reservation.id} reservation={reservation} type={type} isLast={index === all.length - 1} />
  ))}
```

`renderAnchorLine` becomes unused by `ReservationTypeSection` after this change — remove it (it is a module-private function, not exported, so no other file references it). `Wallet` import becomes unused in `reservation-type-section.tsx` too (the confirmation chip now lives in `reservation-inline-text-field.tsx`'s `renderDisplay`, via `reservation-row.tsx`) — remove that import as well; keep `ChevronDown`.

`ReservationTypeSectionProps` is unchanged — `Reservation` already carries `tripId` (`src/data/types.ts` line 211), and `ReservationRow` only needs `reservation.id` for `updateReservation`; the action itself looks up `tripId` from the DB row via `existing.tripId` (Task 1). No new props are threaded through `ReservationsTab` → `ReservationTypeSection` → `ReservationRow`.

### Task 7 — E2E scenario

Add to `tests/e2e/features/reservations.feature`:

```gherkin
  Scenario: Edit a reservation's provider and check-in time inline
    Given the trip has a Lodging reservation
    And the "Lodging" reservation section is expanded
    When I edit the reservation provider to "Updated Hotel Name"
    And I edit the "Check-in" anchor to tomorrow at "10:00"
    And I reload the page
    And the "Lodging" reservation section is expanded
    Then the reservation provider shows "Updated Hotel Name"
    And the "Check-in" anchor shows a time of "10:00"
```

Add to `tests/e2e/steps/reservations.steps.ts`:

```ts
Given("the trip has a Lodging reservation", async ({ page, scenario }) => {
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
      },
      setCurrent: true,
    },
  });
  await scenario.gotoCurrentTrip(page);
  await page.getByRole("button", { name: "Reservations" }).click();
});

Given("the {string} reservation section is expanded", async ({ page }, sectionLabel: string) => {
  const section = page.getByRole("button", { name: new RegExp(`^${sectionLabel}, `) });
  await expect(section).toBeVisible({ timeout: 10_000 });
  if ((await section.getAttribute("aria-expanded")) === "false") {
    await section.click();
  }
});

When("I edit the reservation provider to {string}", async ({ page }, newProvider: string) => {
  await page.getByRole("button", { name: "Original Hotel Name" }).click();
  const input = page.getByRole("textbox", { name: "Provider" });
  await input.fill(newProvider);
  await input.press("Enter");
  await expect(page.getByRole("button", { name: newProvider })).toBeVisible({ timeout: 10_000 });
});

When("I edit the {string} anchor to tomorrow at {string}", async ({ page }, anchorLabel: string, time: string) => {
  // ReservationAnchorEditField (Task 4) gives the anchor display button a stable
  // aria-label of "{label}: {formatted value}" — select on that rather than visible text.
  await page.getByRole("button", { name: new RegExp(`^${anchorLabel}: `) }).click();
  await page.getByRole("button", { name: `${anchorLabel} date` }).click();
  await page
    .locator('[data-slot="popover-content"]')
    .getByRole("button", { name: /^Tomorrow,/ })
    .click();
  await page.getByLabel(`${anchorLabel} time`).fill(time);
  await page.getByRole("button", { name: `Save ${anchorLabel}` }).click();
});

Then("the reservation provider shows {string}", async ({ page }, provider: string) => {
  await expect(page.getByRole("button", { name: provider })).toBeVisible({ timeout: 10_000 });
});

Then("the {string} anchor shows a time of {string}", async ({ page }, anchorLabel: string, time: string) => {
  // Assert via the anchor button's aria-label ("{label}: {formatted value}") rather than visible
  // text, matching only the minutes portion since formatAnchorDateTime's hour formatting is
  // timezone-dependent (see deferred-work.md).
  await expect(
    page.getByRole("button", { name: new RegExp(`^${anchorLabel}: .*${time.split(":")[1]}\\s*(AM|PM)`) })
  ).toBeVisible({ timeout: 10_000 });
});
```

**Caveats the dev agent must resolve while implementing this task** (flagged rather than guessed, per the project's testing-first gate):
- "Tomorrow" depends on the E2E run date and Calendar's relative-label rendering (`/^Tomorrow,/` mirrors the existing `/^Today,/` pattern from the Add-Reservation scenario — verify the `Calendar` component actually renders a "Tomorrow, ..." label; if not, pick an explicit fixed future date instead and select it by day-of-month).
- The "anchor shows a time of" assertion's timezone caveat: `formatAnchorDateTime` uses `toLocaleTimeString` with no `timeZone` (a known, deferred, app-wide issue per `deferred-work.md`) — the displayed time depends on the E2E runner's local timezone. The regex above only checks the minutes portion to stay robust to AM/PM and hour shifts; if that proves insufficient, derive the full expected string with the same `toLocaleDateString`/`toLocaleTimeString` calls in the step definition rather than hardcoding "10:00".

### Validation summary for `updateReservation`

| Condition | Result |
| --- | --- |
| `patch.provider` provided and empty/whitespace | throws "Provider is required." |
| `type` is Lodging/Rental Car/Cruise AND resulting `endAt` would be empty | throws "An end date and time is required for this reservation type." |
| Resulting `endAt` set but resulting `startAt` empty | throws "A start date and time is required when an end date and time is set." |
| Resulting `endAt` < resulting `startAt` | throws "The end date and time must be after the start date and time." |
| Otherwise | updates only the provided keys, sets `updatedAt`, `revalidatePath` |

"Resulting" = the patch value if provided, else the existing DB value — i.e. validation considers the *post-patch* state, not just the changed field in isolation, so editing only `endAt` on a Reservation whose `startAt` is already unset correctly triggers the second rule.

### Testing standards summary (NFR2/NFR3)

- Coverage ≥95% lines/functions, ≥90% branches on `src/lib/**` and `src/components/packt/**` — applies to `reservation-inline-text-field.tsx`, `reservation-anchor-edit-field.tsx`, `reservation-row.tsx`, the edited `reservation-type-section.tsx`/`reservation-type-badge.tsx`, and `reservations/actions.ts`.
- `reservation-inline-text-field.test.tsx`, `reservation-anchor-edit-field.test.tsx`, `reservation-row.test.tsx`: mock `updateReservation` (`vi.mock("@/app/(app)/trips/[tripId]/reservations/actions", () => ({ updateReservation: vi.fn() }))`) — do not hit the DB from component tests. Use `userEvent` for click/type/keyboard interactions.
- `reservations/actions.test.ts`: follow the existing action-test pattern for `createReservation` (check for a `reservations/actions.test.ts` sibling if one already exists from Story 1.1 — if `createReservation` has no test file yet, create one covering both `createReservation` and `updateReservation`; if it exists, extend it).
- E2E: the new scenario must create its own trip+reservation via `scenario.materialize(...)` (Object Mother) — do not add rows to `global-setup.ts`.

## Project Structure Notes

- New files: `src/components/packt/reservation-inline-text-field.tsx` (+ `.test.tsx`), `src/components/packt/reservation-anchor-edit-field.tsx` (+ `.test.tsx`), `src/components/packt/reservation-row.tsx` (+ `.test.tsx`), `src/app/(app)/trips/[tripId]/reservations/actions.test.ts` (new, or extended if it already exists).
- Modified files: `src/data/types.ts` (+ `UpdateReservationPatch`), `src/app/(app)/trips/[tripId]/reservations/actions.ts` (+ `updateReservation`), `src/components/packt/reservation-type-badge.tsx` (+ `formatAnchorDateTime`), `src/components/packt/reservation-type-section.tsx` (re-export + use `ReservationRow`, remove `renderAnchorLine`/`Wallet` import), `src/components/packt/reservation-type-section.test.tsx` (verify existing tests still pass + 1 new integration smoke test), `tests/e2e/features/reservations.feature`, `tests/e2e/steps/reservations.steps.ts`.
- No new top-level directories or routes. `reservation-inline-text-field.tsx`, `reservation-anchor-edit-field.tsx`, and `reservation-row.tsx` follow the existing `src/components/packt/` flat-file convention (no subdirectory), consistent with `reservation-type-section.tsx`/`reservation-edit-drawer.tsx`.

### References

- [Source: _bmad-output/epics.md#Story 1.3: Edit a Reservation] — full AC text (Given/When/Then), FR3
- [Source: _bmad-output/epics.md#UX Design Requirements] — UX-DR10 (click-to-edit focus/keyboard contract), UX-DR3 (row field list and styling), UX-DR12 (icon `aria-hidden`/`strokeWidth` conventions)
- [Source: src/components/packt/reservation-type-section.tsx] — current expanded-row JSX being replaced; `formatAnchorDateTime`/`sortReservationsByStartAt`/`getNextUpcoming` (the latter two are unaffected by this story)
- [Source: src/components/packt/doc-row.tsx] — inline-rename click-to-edit pattern (state machine, teal-underline input, Enter/Escape/blur handlers) that provider/confirmation-code/notes editing follows
- [Source: src/components/packt/reservation-edit-drawer.tsx] — `combineAnchor`, `ReservationAnchorFieldset` usage, `REQUIRES_END_AT`, and the existing date/time split-input pattern that the anchor inline-edit mirrors
- [Source: src/components/packt/reservation-anchor-fieldset.tsx, src/components/ui/date-picker.tsx, src/components/ui/time-picker.tsx] — `DatePicker`/`TimePicker` prop signatures
- [Source: src/app/(app)/trips/[tripId]/actions.ts#updateEvent] — the `requireUser()` → `assertTripAccess` → `db.update` → `revalidatePath` shape `updateReservation` follows
- [Source: src/db/schema.ts#reservations] — column types (`startAt`/`endAt` nullable `timestamp`, `confirmationCode`/`notes` nullable `text`)
- [Source: src/data/types.ts#Reservation, #CreateReservationInput] — existing Reservation shape; `UpdateReservationPatch` is added alongside `CreateReservationInput`
- [Source: tests/e2e/e2e-seed-data.ts, tests/e2e/scenario-fixture.ts] — `ReservationSeed`/`cloneTripMother()` Object Mother (Story 1.1) reused for the new E2E scenario
- [Source: tests/e2e/features/reservations.feature, tests/e2e/steps/reservations.steps.ts] — existing scenarios/steps extended by Task 7
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — timezone-naive `formatAnchorDateTime` (pre-existing, flagged again for the new E2E anchor-edit assertion), `REQUIRES_END_AT` duplication (this story adds a third copy in `updateReservation` — still deferred, not in scope to fix)
- [Source: _bmad-output/implementation-artifacts/1-2-view-reservations-grouped-by-type-with-empty-state.md] — prior story's accordion/row implementation and review findings

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created

### File List

## Change Log

| Date | Change |
| --- | --- |
| 2026-06-15 | Story 1.3 created via `bmad-create-story` (ultimate context engine analysis). Status set to `ready-for-dev`. |
