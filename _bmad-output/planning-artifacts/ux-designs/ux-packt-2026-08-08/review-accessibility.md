# Accessibility Review — Packt Trip Notes

## Verdict

Implementation-ready for approved product direction, but not fully WCAG 2.2 AA conformant as written. Autosave, disclosure, focus, keyboard, screen-reader, delete, status, touch-target, responsive, contrast, and reduced-motion contracts are now strong; sole remaining issue is deliberate pointer-drag reorder decision.

Finding count: **0 critical · 1 high · 0 medium · 0 low**.

## High

- **Approved Event-style reorder is a WCAG 2.5.7 deviation, not a standards exception.** DESIGN.md requires pointer drag through Event handle with no visible Move controls; EXPERIENCE.md documents keyboard reorder and calls this an “explicit WCAG 2.5.7 exception” (DESIGN.md Components: Reorder handle; EXPERIENCE.md Component Patterns, Interaction Primitives, Accessibility Floor, FR-6 companion flow; `.memlog.md` override). Keyboard path satisfies keyboard access but does not give mouse/touch users a single-pointer operation without dragging. Reordering is not essential because same outcome already works through discrete keyboard moves, and dnd-kit behavior is author-controlled rather than determined by user agent. W3C classifies absence of non-drag single-pointer method as failure F108; permitted exceptions are only essential dragging or unmodified user-agent behavior ([W3C Understanding SC 2.5.7](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements), [W3C F108](https://www.w3.org/WAI/WCAG22/Techniques/failures/F108)). _Classification:_ user-approved, documented product/accessibility waiver; known Level AA non-conformance. _Fix:_ preserve Event visual anatomy while making click/tap on same handle open discrete Move up/Move down menu, or add another single-pointer non-drag method. If override remains, replace “exception” with “accepted deviation,” remove unqualified WCAG 2.2 AA conformance claim, and track shared Event-pattern remediation.

## Strengths

- Full-editor-composite blur, serialized latest-value save, `aria-busy`, delayed saving status, transition gating, dirty-value preservation, Retry, and contextual failure behavior close prior autosave/data-loss gap.
- ARIA tabs, semantic ordered list, disclosure button plus named region, deterministic focus lifecycle, duplicate-preview suppression, and exact keyboard reorder announcements provide clear screen-reader contract.
- Delete pending state is irrevocable and deterministic; focus moves to status, recovery, or next valid list control without targeting removed element.
- 44×44px targets, measured light/dark contrast, 200% text and 320 CSS px reflow, long-string handling, reduced motion, and nonessential decorative semantics are explicit.
