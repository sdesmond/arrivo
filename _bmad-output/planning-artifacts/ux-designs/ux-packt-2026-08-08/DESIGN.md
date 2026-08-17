---
name: Packt — Trip Notes
description: Trip Notes visual delta for Packt's existing shadcn/Base UI responsive web system.
status: final
sources:
  - ../../prds/prd-packt-2026-08-07/prd.md
  - ../../../project-context.md
  - .memlog.md
updated: 2026-08-08
components:
  notes-tab:
    visual-system: "Existing Packt trip-detail tab"
  empty-state:
    visual-system: "Existing Packt Empty composition"
  new-note-action:
    variant: "Existing Packt outline action"
    minimum-target: "44px"
  note-row:
    background: "var(--surface)"
    foreground: "var(--fg)"
    preview-foreground: "var(--fg-2)"
    border: "var(--line)"
  note-editor:
    background: "var(--surface)"
    foreground: "var(--fg)"
    focus: "var(--accent-brand)"
  reorder-handle:
    foreground: "var(--fg-3)"
    icon: "Lucide GripVertical, strokeWidth 1.5"
    minimum-target: "44px"
  delete-note-confirmation-dialog:
    visual-system: "Existing Packt confirmation Dialog with destructive action"
  failure-toast:
    visual-system: "Existing Packt Sonner error toast"
---

# Packt Trip Notes — Design Spine

## Brand & Style

Trip Notes is a feature-level extension of Packt, not a new visual identity. It inherits Packt's current responsive trip-detail shell, shadcn components, Base UI primitives, CSS-token theme, dark mode, typography, motion, focus treatment, and Lucide icon rules. This spine specifies only Trip Notes deltas.

Trip Notes must read as a lightweight memory aid inside an existing trip: compact enough to scan, calm enough to revisit, and visually distinct from task controls by never showing checkbox or completion styling.

`DESIGN.md` and `EXPERIENCE.md` are authoritative. Mockups, wireframes, and imports illustrate these spines and lose on conflict.

## Colors

No new color tokens. Use current Packt semantic CSS variables and their existing light/dark mappings. WCAG 2.2 AA is target except accepted SC 2.5.7 deviation for inherited Event-style pointer reorder. Normal text reaches 4.5:1, large text 3:1, and interactive boundaries, icons, and focus indicators 3:1 against adjacent colors.

Load-bearing combinations remain Packt defaults: `var(--fg)` on `var(--surface)` for Note titles and editor text, `var(--fg-2)` on `var(--surface)` for previews, `var(--line)` for separation, `var(--accent-brand)` for focus, and existing destructive tokens inside Delete Note confirmation. Reorder handle uses `var(--fg-3)`, measured at 4.00:1 on light `var(--surface)` and 5.43:1 on dark `var(--surface)`. Focus uses `var(--accent-brand)`, measured at 3.86:1 light and 6.91:1 dark.

## Typography

No typography delta. Note title uses current Packt emphasized body treatment; one-line preview uses current secondary body treatment. Note editor uses current form typography and font scaling. Do not introduce a display face, all-caps label, or Notes-specific type ramp.

## Layout & Spacing

Notes tab stays inside existing trip-detail content width and responsive shell. Notes form one vertical list. Empty state uses existing Packt `Empty` composition. Once Notes exist, New Note action occupies existing compact-action position at upper right; list follows below.

Spacing, tab padding, list gaps, editor padding, and responsive margins inherit Packt/Tailwind defaults. No Notes-specific breakpoint, width, or spacing scale.

## Elevation & Depth

No elevation delta. Note row, Note editor, Delete Note confirmation dialog, and Failure toast inherit existing Packt/shadcn depth rules. Do not add decorative shadows or raised cards to distinguish Notes.

Under `prefers-reduced-motion: reduce`, suppress nonessential disclosure transitions, list-shift animation, drag overlays, and toast entrance/exit motion. Motion never communicates saved, moved, or failed state by itself.

## Shapes

No shape delta. Use current Packt radii for rows, controls, editor fields, focus rings, and confirmation dialog. Reorder handle retains existing Packing List target shape and size.

## Components

→ [Trip Notes key screen](mockups/key-notes-tab.html) illustrates inherited itinerary Event anatomy, inline editing, Reorder handle, Trash action, and Empty composition. Spines win on conflict.

| Component | Visual specification |
| --- | --- |
| Notes tab | Existing trip-detail tab chrome and selected-state styling; no Notes-specific tab decoration or badge. |
| Empty state | Existing Packt `Empty` icon/title/description/action anatomy. Icon is decorative and hidden from assistive technology unless it adds meaning not present in title/description. |
| New Note action | Empty state: existing Packt `Empty` action treatment labeled `New Note`. Populated state: existing compact outline action at upper right, matching current trip-detail add actions. Minimum interactive target remains 44×44px. |
| Note row | Follow existing itinerary Event row anatomy: lightweight row, left Note glyph, inline title/preview content, right Reorder handle, and right Trash action. Collapsed hierarchy always shows title or implicit first-line title plus one body-preview line. No card-like field chrome, checkbox, completion mark, status badge, or task color. |
| Note editor | Expanded in place within Note row. Title and body edit where displayed using transparent inline fields and existing accent underline/focus treatment; no boxed inputs, separate form panel, Save button, or saved badge. |
| Reorder handle | Existing itinerary Event drag-handle treatment: `GripVertical`, `strokeWidth={1.5}`, inherited muted foreground, focus treatment, and 44×44px target. Handle itself moves Note; no visible Move up/down controls. Visibility follows Event-row responsive behavior. |
| Delete Note confirmation dialog | Trash icon uses existing itinerary Event action treatment and opens existing Packt/Base UI confirmation `Dialog`. Pending and failure text uses current inline status/error styling. No text Delete button inside expanded row and no Notes-specific modal styling. |
| Failure toast | Existing bottom-center Packt/Sonner error toast; no Notes-specific color, placement, icon, or motion. |

Empty-state icon glyph, empty-state title/description copy, and confirmation copy are not visually specified by confirmed sources; implementation must not treat an arbitrary choice as a design-system delta.

## Do's and Don'ts

| Do | Don't |
| --- | --- |
| Inherit Packt/shadcn/Base UI unless a delta appears above | Create a separate Notes visual language |
| Keep title plus one-line preview visible in every collapsed Note row | Collapse a Note to title only |
| Use existing Packt outline, drag, confirmation-dialog, toast, focus, and dark-mode treatments | Introduce new button, drag, modal, toast, focus, or theme variants |
| Preserve 44×44px interactive targets and `strokeWidth={1.5}` icons | Shrink compact actions or drag handles below Packt accessibility floor |
| Keep Notes visually free of task state | Add checkboxes, completion marks, progress, or task-status colors |
