---
title: Reconciliation — brainstorm-intent.md vs prd.md
scope: Trip Notes
created: 2026-08-07
---

# Reconciliation: brainstorm-intent.md → prd.md

Source of intent: `_bmad-output/brainstorming/brainstorm-trip-level-notes-2026-08-07/brainstorm-intent.md`
Drafted artifact: `_bmad-output/planning-artifacts/prds/prd-packt-2026-08-07/prd.md`

Per instructions, two decisions are known, explicit, user-directed supersessions and are **not** treated as gaps below:
- Search: brainstorm is silent; PRD explicitly rules it out for MVP (§6.2, FR-2 Out of Scope, UJ-3).
- Accordion expand behavior: brainstorm is silent on single-vs-multi; PRD resolves it to single-expand-at-a-time (FR-3).

## 1. Item-by-item capture check

| Brainstorm item | Captured in PRD? | Where |
|---|---|---|
| Trip-level Notes section, separate from per-day notes | Yes | §1 Vision, §3 Glossary "Trip Notes", §4.1 |
| Problem: admin thoughts not day-specific, not document-worthy (passport expiry, ask re: dietary, bring adapter) | Yes | §1 Vision (passport expiry, dietary question, "borrow a suitcase" — adapter example merged into UJ-2's "buy an adapter, borrow a suitcase") |
| Written during planning, revisited over time, occasional reference during trip | Yes, and extended | UJ-1/UJ-3 (capture/scan), UJ-5 + FR-2 consequence (works identically before/during/**after** trip — "after" added, benign extension, not a contradiction) |
| Not per-day notes | Yes | Glossary "Day Notes", §5 Non-Goals |
| Not documents | Yes | Glossary "Documents", §5 Non-Goals, §6.2 |
| Not a checklist/task tracker; checkbox/task state owned exclusively by Packing List **and Itinerary** | Yes, in §5 Non-Goals ("owned exclusively by the Packing List and Itinerary") | §5. But see Finding 4 below — §3 Glossary contradicts this. |
| Vertical list of discrete entries | Yes | §4.1 ("A vertical list of discrete Notes") |
| Not a single running note | **Dropped** | See Finding 1 |
| Not a grid/card layout | **Dropped (implicit only)** | See Finding 2 |
| Optional title + always-visible first-line preview (Keep-inspired); no title → first line is implicit title/preview; never title-only-collapsed | Yes | FR-1, FR-2, Glossary "Note"; "Keep-inspired" phrase itself only appears once, in §0 |
| No checkboxes/task state, ever | Yes | §5, Glossary, FR list |
| Empty state + "New Note" button matching packing-list/documents pattern (icon/title/description, not Keep-style input bar) | Yes, faithfully | FR-7, §5, §6.2 — explicitly contrasts with Keep-style capture bar |
| Tap row to expand in place — accordion, not dialog | Yes | FR-3 |
| Open Questions: none | Consistent | §8 "None" |

## 2. Findings — qualitative/rationale content dropped or diluted

**Finding 1 (highest severity) — rejected alternative "single running note" is entirely absent from the PRD.**
Brainstorm's Key Constraints: *"Discrete entries only — a single long-running note was considered and rejected: it breaks scan-ability and isn't independently searchable/findable the way separate entries are."* This is a real design alternative that was considered and rejected, with a concrete rationale (scan-ability, findability). The PRD states the *what* ("vertical list of discrete Notes") but never records that a single-note alternative was on the table, or why it lost. A future reader of the PRD alone has no way to know this was ever a live option — if someone later proposes "just make it one big note," there's no PRD-level artifact refuting it. Recommend adding a line to §4.1 or a "Rejected Alternatives" subsection under §5 Non-Goals.

**Finding 2 — rejected "grid/card layout" alternative is dropped, not just the running-note one.**
Brainstorm explicitly rejects two alternatives in the same bullet: "(not a single running note, not a grid/card layout)." The PRD's "vertical list of discrete Notes" phrasing implies list-not-grid but never states the grid/card option was considered and rejected. Lower severity than Finding 1 since the vertical-list requirement is unambiguous either way, but the "why not a grid" reasoning (if any existed beyond the brainstorm doc) isn't preserved.

**Finding 3 — the "deliberate one-off deviation from the packing-list collapse pattern" framing is lost.**
Brainstorm's Key Constraints call out explicitly: *"Collapsed-row content is title + one-line preview, not title-only (this is the one deviation from the packing-list collapse pattern, adopted from Keep's fast-scan trait)."* This is meta-commentary that matters for consistency review later: it flags that Trip Notes intentionally diverges from an established app convention (packing-list rows show title only when collapsed), and names why (Keep's fast-scan trait). The PRD captures the resulting behavior thoroughly (FR-1, FR-2, Glossary) but never states that it's a deliberate exception to the packing-list pattern specifically — a reviewer or future dev unfamiliar with the brainstorm could "fix" this as an inconsistency with Packing List rows, not realizing it was intentional. The "Keep-inspired" attribution survives once, in §0's document-purpose blurb, but isn't restated where the actual FR/consequence lives (FR-2).

**Finding 4 — internal PRD contradiction on checkbox-state ownership, introduced by the PRD itself (not present in brainstorm).**
Brainstorm consistently attributes checkbox/task-state ownership to two features together: "Packing List and Itinerary." PRD §5 Non-Goals correctly preserves this dual attribution. But PRD §3 Glossary's "Packing List" entry states: *"The sole owner of checkbox/task-completion state in the app"* — dropping Itinerary and asserting single ownership, which directly contradicts §5's own (correct) wording two sections later. This is a PRD-introduced inconsistency, not a brainstorm gap — but it's worth flagging because it waters down a constraint the brainstorm was precise about. Recommend fixing the Glossary entry to match §5.

## 3. Additions in the PRD with no grounding in the brainstorm doc (not contradictions, but not traceable either)

These aren't gaps against the brainstorm and may well reflect later user direction not visible in either file — flagging only because the PRD's Assumptions Index (§9) claims *"No inline [ASSUMPTION] tags were needed — all scope decisions in this PRD were explicitly confirmed during discovery,"* yet these have no antecedent in brainstorm-intent.md:

- **FR-6 Manual reordering of Notes** (with newest-first default, persists across sessions) — brainstorm never mentions sort order or reordering at all.
- **"No cap on the number of Notes per trip, and no cap on title or body length"** (FR-1 consequence) — not addressed in brainstorm.
- **"A persistent add action once Notes exist"** alongside the empty-state button (FR-1) — brainstorm only describes the empty-state button, not an ongoing add affordance.

If these were confirmed in the PRD-drafting conversation (as the user's framing implies for the two known supersessions), they're fine as-is; they just aren't verifiable against the brainstorm doc the way everything else is.

## 4. Overall assessment

Coverage of concrete functional requirements (create/view/expand/edit/delete, empty state, collapse/preview shape, no-task-state boundary, Documents/Day-Notes boundaries) is thorough and in most cases exact-phrase faithful to the brainstorm. The losses are entirely in the qualitative register the FR structure tends to flatten: the two rejected alternatives (running note, grid/card) and the "intentional deviation from packing-list convention" rationale are the real gaps. One PRD-introduced contradiction (Finding 4) also merits a fix.
