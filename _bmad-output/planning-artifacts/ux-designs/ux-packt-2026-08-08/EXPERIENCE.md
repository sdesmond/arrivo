---
name: Packt — Trip Notes
status: final
sources:
  - ../../prds/prd-packt-2026-08-07/prd.md
  - ../../../project-context.md
  - .memlog.md
updated: 2026-08-08
---

# Packt Trip Notes — Experience Spine

## Foundation

Single responsive web surface inside Packt's existing Next.js trip-detail experience. UI inherits current Packt components, shadcn, Base UI primitives, Tailwind behavior, collaboration access, privacy rules, dark mode, motion, focus, and error-toast conventions. WCAG 2.2 AA is target except accepted SC 2.5.7 deviation for inherited Event-style pointer reorder; inherited primitives are implementation aids, not proof of conformance. `DESIGN.md` owns visual identity and visual deltas; this spine owns Trip Notes information architecture and behavior.

`DESIGN.md` and `EXPERIENCE.md` are authoritative. Mockups, wireframes, and imports illustrate these spines and lose on conflict.

Trip Notes is one trip-wide memory surface before, during, and after a trip. It remains separate from Day Notes, Documents, Packing List, and Itinerary. It never gains checkbox or task-completion state.

## Information Architecture

| Surface or state | Reached from | Purpose |
| --- | --- | --- |
| Notes tab — empty | Existing `Notes` tab on trip detail, when trip has zero Notes | Packt `Empty` composition with `New Note`; begins first capture without an always-visible capture bar. |
| Notes tab — populated | Existing `Notes` tab on trip detail, when one or more Notes exist | Upper-right compact outline add action plus newest-first or manually ordered vertical Note list. |
| Note expanded state | Activating a collapsed Note row | Reveals full body and edit/delete controls in place; no route change, drawer, or dialog. |
| Delete confirmation | Delete control on every Note row, collapsed or expanded (updated 2026-08-12 — see Story 1.3 review) | One lightweight confirmation using existing Delete Note confirmation dialog before permanent removal. |

Collapsed Note row always contains title or implicit first-line title plus a one-line body preview. Title-only Notes repeat title as preview. Only one Note is expanded at a time. Expanding another Note waits for current Note save; only confirmed save collapses current Note and opens next. Manual order persists; new Notes enter at top.

No Notes search, capture bar, attachments, links/files, per-Note permission surface, day scope, or trip-date mode switch. Files and confirmation numbers remain in Documents; day-specific reminders remain in Day Notes; task state remains in Packing List and Itinerary.

→ [Trip Notes key screen](mockups/key-notes-tab.html) illustrates empty, populated, and expanded states. Delete confirmation and save-failure recovery are spine-only. Spines win on conflict.

Trip-detail navigation uses ARIA tabs for in-place panel switching. Container uses `tablist`; Notes control uses `tab`, `aria-selected`, roving `tabindex`, and `aria-controls`; Notes panel uses `tabpanel` and `aria-labelledby`. Left/Right move among tabs, Home/End jump boundaries, and Enter/Space activates manual selection without moving focus unexpectedly.

## Voice and Tone

Microcopy inherits Packt's concise, direct product voice. Brand voice lives in `DESIGN.md`.

| Use | Avoid |
| --- | --- |
| `New Note` for confirmed empty-state action | Task language such as `Add task`, `Complete`, or `Done` |
| Current compact add-action wording in populated Notes tab | New Notes-specific jargon or Note types |
| Current Packt failure-toast pattern when a save, delete, or reorder fails | Silent failure or custom technical error language |
| `Title` as optional and `Body` as Note content | Copy implying title, search, attachment, or checkbox is required |

Confirmed sources do not set empty-state title/description, confirmation sentence, or exact failure text. Keep those working-copy choices aligned with existing Packt patterns; do not encode new product meaning.

## Component Patterns

Behavioral rules below pair exactly with `DESIGN.md.Components`.

| Component | Use | Behavioral rules |
| --- | --- | --- |
| Notes tab | Trip detail | `{components.notes-tab}`. Existing tab activation reveals Trip Notes without navigation. Same surface and behavior before, during, and after trip dates. |
| Empty state | Zero Notes | `{components.empty-state}`. Existing icon/title/description/action anatomy; icon is decorative unless it conveys unique meaning; title and description identify purpose for New Note action. No capture bar. |
| New Note action | Empty and populated Notes tab | `{components.new-note-action}`. Empty state exposes `New Note`; populated state exposes existing compact outline add action at upper right. Begins a blank Note editor in Notes tab. Fully blank title and body discard only when focus leaves full editor composite or collapse is requested. |
| Note row | Populated Notes tab | `{components.note-row}`. Semantic `ol` contains `li` rows in persisted visual order. Follow itinerary Event anatomy: left glyph, inline summary/disclosure, right Reorder handle, right Trash icon, and expanded inline region. Disclosure has stable `id`, `aria-expanded`, and `aria-controls`; expanded region has matching `id`, `role="region"`, and `aria-labelledby`, and leaves accessibility tree when collapsed. Handle/Trash events never trigger disclosure. |
| Note editor | Note expanded state | `{components.note-editor}`. Optional title plus body form one editor composite. “Blur” means focus leaves complete composite by `relatedTarget`/focus-within semantics; movement among title, body, Retry, Delete, disclosure, and row controls does not commit or discard. Requested commit serializes latest value, sets editor `aria-busy`, announces delayed “Saving note,” and queues or blocks later transition requests. Collapse, row switch, Notes-tab change, and client-controlled route navigation occur only after server confirmation. Failure keeps dirty editor open with linked inline error and Retry. |
| Reorder handle | Each persisted Note row | `{components.reorder-handle}`. Matches itinerary Event drag handle; handle itself moves Note, with no visible Move up/down controls. Keyboard: Space/Enter lift/drop, Up/Down move vertically, Escape cancels; Left/Right do nothing. Announce instructions, `position X of N`, invalid boundary, drop, cancel, failure rollback, and restored position through one live region. New Notes still insert at top. |
| Delete Note confirmation dialog | Note expanded state | `{components.delete-note-confirmation-dialog}`. Existing Event-style Trash icon opens dialog. Initial focus is Cancel. Confirm makes mutation irrevocable, moves focus to status container, disables Cancel/Delete, marks dialog busy, and announces “Deleting note.” Failure keeps dialog open, enables recovery controls, shows persistent error, and focuses Retry; success removes Note and moves focus by list-focus rules. |
| Failure toast | Save, delete, or reorder failure | `{components.failure-toast}`. Existing Packt error toast supplements persistent contextual error/rollback state; toast never owns essential recovery instructions. |

## State Patterns

| State | Surface | Treatment |
| --- | --- | --- |
| Cold load | Notes tab | Inherit existing trip-detail loading behavior; no Notes-specific skeleton or staged reveal. |
| Empty | Notes tab | Existing Packt `Empty` icon/title/description/action composition with `New Note`; no capture bar. |
| Collapsed list | Notes tab | Ordered vertical rows; every row shows title/implicit title plus one-line preview. |
| Expanded/editing | Note row | Full body and edit/delete controls remain in place; one expanded row maximum. |
| Blank draft | Note editor | Both title and body blank when focus leaves full editor composite or collapse is requested: discard; do not add Note. Explicit discard with no new target returns focus to New Note; user-initiated row/tab/route transition keeps its normal destination. |
| Title only | Note row | Display title as title and preview; never show an empty-preview state. |
| Untitled | Note row | First body line becomes implicit displayed title; preview remains non-empty. |
| Save in progress | Note editor | Keep dirty values visible and editor mounted. Requested collapse, row switch, tab change, or client-controlled route navigation waits for server result. No explicit Save button. |
| Save success | Note editor | Commit server-confirmed value, update collapsed summary, then complete requested transition. Announce “Note saved” once per mutation through polite status region; suppress duplicate blur/collapse announcements. |
| Save failure | Note editor | Keep dirty editor open and focus within it; show persistent linked inline error plus Failure toast; announce failure; Retry repeats same mutation. Do not collapse, switch row, or navigate. Browser close/refresh retains existing app limits and makes no local-persistence promise. |
| Delete failure | Delete confirmation | Keep dialog and Note open, retain persistent error, announce failure, and focus safe recovery control. Failure toast supplements dialog error. |
| Reorder failure | Notes tab | Restore last persisted DOM/visual order, announce failure and restored `position X of N`, show Failure toast, and return focus to same Reorder handle. |
| Offline | Notes tab | No Notes-specific offline-write guarantee. Network failure follows save/delete/reorder failure contracts and does not claim local persistence. |
| Permission denied | Trip detail | Inherit trip access; no separate Notes permission-denied surface or per-collaborator Note permissions. |
| Reordering | Notes tab | Event-style drag handle controls pointer and keyboard reorder. Lifted item, candidate position, boundaries, drop/cancel, persistence result, and rollback are announced through one live region; DOM order matches visual order. |
| Delete pending | Delete Note confirmation dialog | Confirm is irrevocable: move focus to dialog status container, disable Cancel/Delete, set busy state, and announce progress. Success removes row immediately and moves focus to next disclosure, else previous, else New Note. |

## Interaction Primitives

- Click, tap, `Enter`, or `Space` on disclosure button exposes expanded content in place; row container itself is not interactive.
- Activating second disclosure requests save; only successful save collapses first and expands second. Failure keeps current editor open.
- Focus leaving complete editor composite or requested collapse commits nonblank creation/edit. Fully blank creation discards; focus follows initiating destination, or returns to New Note when no target exists.
- Pointer drag and keyboard reorder through Event-style handle share one persisted-order operation and recovery contract; no Move up/down buttons appear.
- Delete is available from every Note row, collapsed or expanded (updated 2026-08-12 — see Story 1.3 review), and always crosses one Delete Note confirmation dialog.
- Banned: title-only collapse, explicit Save button, checkbox/task state, Notes search, always-visible capture bar, attachments/files, route change for expansion, dialog-based editing, date-dependent mode switch.

## Accessibility Floor

Behavioral accessibility inherits current Packt standards; visual contrast and focus appearance live in `DESIGN.md`.

- All interactive targets, including New Note action, disclosure button, Reorder handle, inline editor controls, and Trash action, remain at least 44×44px.
- Note disclosure exposes state through stable `id`, `aria-expanded`, and `aria-controls`; sibling panel uses matching `id` and `aria-labelledby`. Inputs, Reorder handle, move actions, and delete controls are never nested inside disclosure button.
- Optional title and body editors have persistent accessible names. Optional status belongs in label/help text, not placeholder alone. Exact duplicate visible preview remains visual but is omitted from disclosure accessible description; distinct preview is referenced once.
- Keyboard order follows visible reading order: New Note, then each `li` in order—disclosure, Reorder handle, Trash action, and, when expanded, inline title/body—before next row.
- Reorder handle name contains visible Note label and position: `Reorder {Note label}, position X of N`; duplicate labels remain distinguishable by position. Space/Enter lifts/drops, Arrow keys move, Escape cancels, and one live region announces instructions and outcomes.
- Confirmed product direction inherits current itinerary Event reorder pattern: pointer drag plus keyboard drag, without separate pointer-only Move controls. This is accepted WCAG 2.5.7 non-conformance and remains until Packt's shared Event pattern changes.
- Focus lifecycle: New Note → title field; expand → title field; cancel delete → invoking Delete; successful delete → next disclosure, else previous, else New Note; blank discard → New Note; failed save → failed editor; failed delete → safe dialog recovery control; reorder success/failure → same handle.
- Delete Note confirmation dialog inherits focus trap and `Esc`/cancel path; successful deletion never attempts focus return to removed trigger.
- Polite status announces server-confirmed create/save/delete/reorder; assertive or persistent contextual error announces failure. Never announce optimistic state as saved or duplicate same mutation message.
- Accessibility acceptance checks cover keyboard-only reorder through existing Event handle; tab/disclosure name-role-value; focus order and visibility; status/error announcements; 44×44px targets; 200% text resize; 320 CSS px reflow; reduced motion; and light/dark contrast.

## Responsive & Platform

| Context | Behavior |
| --- | --- |
| Existing desktop/laptop trip detail | Notes tab remains within current content container. Populated-state New Note action stays upper right. Reorder handle follows Packing List desktop visibility and focus behavior. |
| Existing mobile/touch trip detail | Single vertical list, in-place expansion, and no horizontal dependency. Reorder handle and Trash icon follow itinerary Event touch visibility; all controls retain 44×44px targets. |
| Keyboard and assistive technology | Same information and actions as pointer/touch; expansion, editing, deletion, and reorder remain operable without drag-only or hover-only access. |

Use existing Packt breakpoints and responsive rules; this spine introduces no Notes-specific breakpoint, native-app behavior, or alternate mobile IA. At 200% text size and 320 CSS px viewport width, title, preview, body, controls, and long unbroken strings wrap without two-dimensional page scrolling or clipped focus. Editor grows or provides keyboard-operable vertical scrolling. Controls wrap without obscuring content. Under reduced motion, suppress nonessential disclosure, list-shift, drag-overlay, and toast transitions.

## Inspiration & Anti-patterns

- **Lifted from Keep:** collapsed entries remain scannable through title or implicit title plus always-visible one-line preview; activation expands content in place.
- **Rejected from Keep:** no always-visible capture bar. Packt uses Empty plus New Note, then compact add action.
- **Rejected:** task state, checkboxes, completion, search, attachments, Note types, day scope, and date-dependent modes. Existing Packt surfaces already own those responsibilities.

## Key Flows

| Requirement | Covered by |
| --- | --- |
| FR-1: Create a Note | UJ-1 |
| FR-2: View the Trip Notes list | UJ-2, UJ-4 |
| FR-3: Expand a Note in place | UJ-2, UJ-3, UJ-4 |
| FR-4: Edit a Note | UJ-3 |
| FR-5: Delete a Note | UJ-3 |
| FR-6: Reorder Notes manually | FR-6 companion flow |
| FR-7: Empty state | UJ-1 |

### UJ-1. Harrison captures a thought before it slips.

1. Harrison is mid-planning on trip detail and activates existing Notes tab.
2. Empty Notes tab offers `New Note`; populated Notes tab offers compact upper-right add action.
3. Harrison activates action and writes optional title and body in Note editor.
4. Focus leaves full editor composite or Harrison requests collapse; nonblank Note autosaves without Save button.
5. **Climax:** New Note appears immediately at top of list, showing title or implicit first-line title plus one-line preview, with no checkbox or task state.
6. Harrison returns to planning knowing thought remains findable.

Failure paths:

- Both title and body remain blank → draft is discarded and no row appears.
- Save fails → editor remains open with dirty value, linked inline error, announced failure, Failure toast, and Retry; requested transition does not occur.

### UJ-2. Harrison scans his Notes to check whether he's already written something down.

1. Harrison opens Notes tab containing one or more Notes.
2. He scans ordered vertical list using visible title/implicit title and one-line preview on every row.
3. When preview is insufficient, he activates row; it expands in place to show full body.
4. If another Note was open, save completes before current Note collapses and selected row expands.
5. **Climax:** Harrison finds existing Note and avoids duplicate, or confirms thought is absent from scan.
6. If absent, he uses New Note action and continues through UJ-1; no search surface appears.

Failure paths:

- Scan does not find thought → absence remains valid result, not an error; Harrison may create Note from same tab.
- Current Note fails to save during row switch → it remains open with dirty value and Retry; selected row does not open.

### UJ-3. Harrison edits and deletes Notes as plans change.

1. Harrison activates stale Note row and expands it in place.
2. For edit, he changes optional title and/or body in Note editor.
3. Blur autosaves in place; requested collapse waits for confirmed save, then collapses; edit does not change manual order.
4. **Climax:** When Note collapses, title and one-line preview reflect saved wording immediately.
5. For delete, Harrison activates delete control from expanded Note.
6. Delete Note confirmation dialog asks for one lightweight confirmation; cancel leaves Note intact, confirmation removes row with no undo requirement.

Failure paths:

- Edit save fails → editor stays open with dirty value, linked inline error, announced failure, Failure toast, and Retry.
- Delete fails → confirmation stays open with persistent error and recovery focus; Note remains in list.

### UJ-4. Harrison references a trip-general Note during the trip itself.

1. During trip's active date range, Harrison opens same trip detail and activates Notes tab.
2. He scans same ordered collapsed rows used during planning.
3. He activates relevant Note when one-line preview is insufficient.
4. **Climax:** Full trip-general reminder appears in place without hunting through a day's Itinerary or Day Notes.
5. Harrison leaves Note unchanged or uses same edit/create behaviors available before trip.

Failure path: relevant Note is absent → Harrison remains on same Notes tab and may create one through UJ-1; no trip-mode switch, search, or day-scoped fallback appears.

### FR-6 companion flow — Harrison organizes scan order.

1. Harrison opens populated Notes tab and decides one reminder should appear earlier.
2. With pointer, he drags Reorder handle; with keyboard, he focuses handle, presses Space/Enter to lift, uses Up/Down, then Space/Enter to drop.
3. Live region announces lift instructions and each candidate `position X of N`; invalid boundary leaves order unchanged and is announced.
4. Packt persists new order while DOM and visual order remain aligned.
5. **Climax:** Server-confirmed order remains after reload, and status announces move completion.
6. Focus returns to same Reorder handle in its new position.

Failure path: persistence fails → list restores previous persisted order, Failure toast and live region announce rollback and restored position, and focus returns to same handle. Escape before drop cancels and restores original order without mutation.
