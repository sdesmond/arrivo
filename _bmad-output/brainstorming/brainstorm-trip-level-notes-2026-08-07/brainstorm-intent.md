# Trip-Level Notes — Intent

**Feature:** A trip-level "Notes" section holding discrete, titled note entries for logistics/reminders/thoughts not tied to a specific day.

## Problem / Job

Trip planning generates admin-type reminders and thoughts that aren't day-specific and aren't document-worthy: passport expiry check, "ask Jamie re: dietary needs," bring adapter, etc. Users write these during planning and revisit them over time; occasional reference during the trip itself.

**Not this feature:**
- Not per-day notes (those exist already, scoped to a specific day)
- Not documents (confirmation numbers, files — belongs in Documents)
- Not a checklist/task tracker — checkbox/task state is owned exclusively by Packing List and Itinerary; Trip Notes never gains checkboxes or task state

## Final Design

- New **Trip Notes** section at the trip level, separate from per-day notes
- Content is a **vertical list of discrete note entries** (not a single running note, not a grid/card layout)
- Each entry: **optional title** + **always-visible first-line preview** of the note body (Keep-inspired). When no title is given, the first line doubles as the implicit title/preview — never title-only-collapsed
- **No checkboxes or task state, ever**
- **Empty state + "New Note" button**, matching the existing packing-list/documents pattern (icon/title/description empty state, not a Keep-style always-visible input bar)
- **Tap a row to expand in place** — accordion behavior, not a dialog

## Key Constraints

- Discrete entries only — a single long-running note was considered and rejected: it breaks scan-ability and isn't independently searchable/findable the way separate entries are
- Collapsed-row content is title + one-line preview, not title-only (this is the one deviation from the packing-list collapse pattern, adopted from Keep's fast-scan trait)
- Entry point (empty state + button) must match existing app conventions (packing list, documents) rather than introducing a new capture-bar pattern

## Open Questions

None — session reached a resolved final design with no unresolved items noted in the log.
