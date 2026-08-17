# Addendum: Trip Notes

Depth from prior inputs that doesn't belong inline in `prd.md` but is worth preserving for downstream readers (UX, architecture).

## Rejected alternatives (from brainstorm-intent.md)

- **Single running note.** Considered and rejected before this PRD's discovery began. A single long-running note breaks scan-ability and isn't independently searchable/findable the way separate discrete entries are. This is why Trip Notes is a list of discrete entries, not a notepad.
- **Grid/card layout.** Considered and rejected in favor of a vertical list. Not elaborated further in the source brainstorm beyond the layout choice itself.

## Design rationale: collapsed-row preview

The collapsed-row shape (title, or implicit first-line title, plus an always-visible one-line body preview) is a deliberate deviation from the app's existing Packing List collapse pattern, which collapses to title only. The deviation is intentionally adopted from Keep's fast-scan trait: a title-only row wasn't enough for scanning back through past Notes to check whether something was already captured (UJ-2). Downstream UX/implementation should not "correct" this back to title-only collapse to match Packing List — the mismatch is intentional.
