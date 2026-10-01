---
reviewer: rubric-walker
target:
  - DESIGN.md
  - EXPERIENCE.md
context:
  - _bmad-output/specs/spec-trip-contributors/SPEC.md
  - _bmad-output/planning-artifacts/architecture/architecture-trip-contributors-2026-08-31/ARCHITECTURE-SPINE.md
date: 2026-08-31
---

# Rubric Walk — trip-contributors DESIGN.md + EXPERIENCE.md

## Verdict

No BLOCKING findings. The pair is internally consistent, correctly reflects the architecture spine's committed mechanisms (two-channel SSE, 3-branch+terminal accept flow, atomic batch save with server-side creator-protection), and the five previously-fixed reconciliation issues all landed cleanly with no new fallout. Four SHOULD-FIX findings below are worth a pass before this is treated as final.

## Verification of prior reconciliation fixes

All five confirmed clean, nothing new introduced by the fixes:

1. **Dangling `{shadcn.*}` refs** — none remain in either file (grepped both); `danger`/`danger-dark` are now literal `oklch(...)` values and `popover`/`popover-dark` exist in the frontmatter and are used correctly by `share-dialog.surface`.
2. **Modal-stacking contradiction** — IA and Component Patterns now agree: discard-confirmation swaps the share dialog's own content, never a second stacked dialog. The `.working/key-share-dialog.html` mock's second panel matches this exactly.
3. **Confirm-discard scoping mismatch** — Component Patterns and State Patterns both now explicitly exempt the Cancel button from the discard-confirm intercept; consistent in both places.
4. **Implicit-resend UI signal** — Pending invitation row now states the manager sees the existing row update in place (badge timestamp refresh), not a duplicate appear; Flow 1's failure branch cross-references the same mechanism (AD-2). Consistent.
5. **Unused spacing token** — Layout & Spacing section now states no Packt spacing override/feature token exists; nothing dangling.

## Checklist findings

### 1. SPEC capability → IA/journey/state coverage

CAP-1, 2, 5, 6, 7, 8, 9 all have a clear IA surface and either a Key Flow or State Pattern landing on it. CAP-10 deliberately has no dedicated surface (SPEC's own success criterion is "no merge prompt," so absence is correct, though see finding D).

**Gap — CAP-3 and CAP-4:** SPEC's viewer/editor capability boundaries (a viewer's itinerary is free of budget/expense data at the server-mapper level per AD-8; an editor can mutate itinerary/budget but cannot delete the trip or manage sharing) have no surface in EXPERIENCE.md's Information Architecture, Component Patterns, or State Patterns. The Voice & Tone table names the three role labels but never describes what a viewer's or editor's screen actually looks like or omits. Since AD-8 is a real, new mechanism (not just an existing behavior), the experience doc should say *something* — even one State Patterns row like "Viewer views itinerary — budget/expense fields absent from the page, not just hidden" — so a builder can trace the capability to a rendered state, not just to the architecture doc.

**Tier: SHOULD-FIX**

### 2. Token cross-references (DESIGN.md ↔ EXPERIENCE.md)

EXPERIENCE.md doesn't use `{path.to.token}` syntax directly (it references DESIGN.md by section name in prose, e.g. "see `DESIGN.md`"), so there's nothing dangling to resolve. All `{...}` occurrences in EXPERIENCE.md are copy-interpolation placeholders (`{ownerName}`, `{invitedEmail}`, `{currentEmail}`, `{name}`) — a different syntax used for a different purpose, and not confusable with the token system in practice. No issue.

### 3. Component/State/Flow internal consistency

Spot-checked and consistent: discard-confirm scoping (see above), implicit-resend row-merge behavior between Component Patterns and Flow 1's failure branch, creator-row treatment (lock icon, no dropdown/remove) matching across DESIGN Components, EXPERIENCE Component Patterns, and the key-screen mock's actual lock-icon color (`#a0a098` = DESIGN's `fg-4`, exact match). Sync indicator's three states (quiet/warning-pulse/danger-static) match verbatim between DESIGN.md and EXPERIENCE.md Component/State Patterns. No contradictions found.

**One inconsistency — stale "no mockups" claim:** EXPERIENCE.md's Information Architecture section states "→ No composition mockups produced this run (Fast path, source material specified enough of the layout in prose...)." But `.working/key-share-dialog.html` exists and `.memlog.md`'s last entry confirms it was rendered ("key-screen mock rendered: .working/key-share-dialog.html"). The claim is now stale relative to the artifact set sitting next to it — a reader following EXPERIENCE.md's own pointer would wrongly conclude no visual reference exists. Update the line to point at the key-screen mock (or drop the disclaimer) now that one exists.

**Tier: SHOULD-FIX**

### 4. Voice & Tone followed by actual copy elsewhere

Mostly followed and even copy-for-copy exact in one place: Flow 3's revocation-modal line, "You no longer have access to this trip. Contact {ownerName} to request access again.," matches the Voice & Tone Do example verbatim. Terminal-state copy (expired/rescinded) also matches its Do row.

**Gap A — "This cannot be undone."** Voice & Tone lists this as "(existing pattern, reused for revocation)," implying the revocation modal's copy includes it. But the revocation modal's actual copy — in both Component/State Patterns and Flow 3 — is only "You no longer have access to this trip. Contact {ownerName}...," with no "This cannot be undone" sentence anywhere. Either add it to the modal's stated copy or correct/remove the Voice & Tone row's claim that it's reused there.

**Gap B — "Invitation sent." / "Invitation resent."** Voice & Tone lists these as Do examples, but State Patterns explicitly rules out a toast for this event ("no separate toast needed, the row itself is the confirmation") and describes only a non-textual signal (the pending badge's timestamp updating). There's no stated surface — not a toast, not a line of on-screen copy, not even called out as an `aria-live` announcement in the Accessibility Floor — where the literal string "Invitation sent."/"Invitation resent." would ever render. Either name where it appears (most likely a screen-reader-only `aria-live` announcement, given the row IS the confirmation for sighted users) or drop it from Voice & Tone as copy that has no home.

**Tier: SHOULD-FIX** (both A and B — copy promised in one section isn't realized in the sections that describe the actual UI)

### 5. DESIGN.md Components ↔ EXPERIENCE.md cross-reference

All six DESIGN.md Components entries (share dialog, role pill, pending-invite badge, revocation modal, remove control, sync status indicator) have a corresponding EXPERIENCE.md Component Patterns row. All EXPERIENCE.md Component Patterns rows trace back to a DESIGN.md Components entry or explicitly defer to it. No orphans in either direction.

### 6. Architecture spine fidelity

- **Two-channel SSE (AD-4):** correctly reflected without oversimplification — the Revocation modal's IA row ("on whatever page they're on") and the Trips dashboard's live-removal row together imply both the trip-scoped and user-scoped channels are in play, matching AD-4/AD-10's split without EXPERIENCE.md needing to name the routes itself.
- **3-branch + terminal accept flow (AD-7):** Accept-invite page's Component Patterns row and the Accessibility Floor's "four possible renders" both correctly render AD-7's three session-state branches plus the terminal-state overlay as four distinct outcomes — not collapsed to a simpler 2-state (logged in / not) model.
- **Atomic batch save + server-side creator-protection (AD-9):** Share dialog's Component Patterns row correctly describes client-side staging + single-batch Save without ever claiming the UI-level creator lock is the enforcement boundary — it doesn't contradict or overclaim past AD-9's server-side rejection backstop.

No architecture-fidelity issues found.

## Additional observation (not a rubric item, informational)

CAP-10 (concurrent-edit convergence) has no State Patterns row at all — arguably correct since SPEC's success criterion is explicitly "no merge prompt," i.e., invisibility is the intended UX. Consider one explicit line acknowledging this ("no conflict UI by design — latest write wins silently") so a future reader doesn't mistake the silence for an oversight the way CAP-3/CAP-4's silence reads as one. **Tier: NIT.**

## Summary of findings

| # | Tier | Finding |
| - | ---- | ------- |
| 1 | SHOULD-FIX | CAP-3/CAP-4 viewer/editor capability boundaries have no IA/Component/State surface in EXPERIENCE.md despite AD-8 being a real new mechanism |
| 2 | SHOULD-FIX | EXPERIENCE.md's "no composition mockups produced this run" line is stale — `.working/key-share-dialog.html` was produced after that line was written |
| 3 | SHOULD-FIX | Voice & Tone's "This cannot be undone." is claimed as reused revocation copy but never appears in the revocation modal's actual stated copy (Component/State Patterns, Flow 3) |
| 4 | SHOULD-FIX | Voice & Tone's "Invitation sent."/"Invitation resent." copy has no defined display surface — State Patterns explicitly rules out a toast and describes only a non-textual row change |
| 5 | NIT | CAP-10's silent latest-write-wins resolution has no explicit State Patterns row calling out the intentional absence of conflict UI |
