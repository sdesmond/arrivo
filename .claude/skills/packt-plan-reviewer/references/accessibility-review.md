# Accessibility Review

Assess every proposed UI element in the plan for accessibility gaps and design token violations. Catch these before implementation — fixing them post-build is significantly more expensive than adding a `title` attribute at planning time.

## Design Token System

All colors must route through CSS custom properties. Valid tokens:

- **Backgrounds:** `var(--bg)`, `var(--surface)`, `var(--surface-2)`
- **Borders:** `var(--line)`
- **Text:** `var(--fg)`, `var(--fg-2)`, `var(--fg-3)`, `var(--fg-4)`
- **Accent:** `var(--accent-brand)`, `var(--accent-soft)`, `var(--accent-ink)`
- **Font families (always with fallbacks):** `var(--font-body, ui-sans-serif)`, `var(--font-heading-family, ui-sans-serif)`, `var(--font-mono-family, ui-monospace)`

If the plan references hex codes, `rgb()`, named colors ("teal", "gray"), or font names without CSS variable notation ("DM Sans", "Manrope"), flag it — always BLOCKING.

## Accessibility Standards

**Touch targets (mobile)**
Interactive elements on mobile must be at least 44×44px. Flag small icon buttons or inline links with no sizing consideration. WARNING.

**Icon-only buttons**
Any interactive element showing only an icon (no visible text) must have a `title` attribute. Flag icon buttons that don't mention accessible labels. BLOCKING.

**Color-only state communication**
States (active, error, disabled, selected, highlighted) communicated only by a color change must also have a text, icon, or ARIA indicator. BLOCKING.

**Keyboard navigation for complex widgets**
Modals, dialogs, dropdown menus, date pickers, and multi-step flows must address:
- How the widget is opened via keyboard
- How it is dismissed (Escape key)
- Where focus goes when it opens and when it closes

Flag any complex widget in the plan that doesn't address keyboard behavior. BLOCKING.

**Screen reader context**
Buttons or links whose visible label depends on surrounding context ("Delete", "Edit", "View" with no descriptor) must plan for `aria-label`. Decorative images must plan for `alt=""`. Meaningful images must plan for descriptive `alt` text.

**Form fields**
Every input, select, textarea, or checkbox must be associated with a `<label>`. Flag form fields without this. BLOCKING.

**Heading hierarchy**
Headings must not skip levels (h1 → h3 is invalid). Decorative large text must not use heading elements. Flag violations in layout sections.

**Focus management**
When a dialog, drawer, or panel opens, focus must move into it. When it closes, focus must return to the trigger element. Flag dialogs or panels that don't mention focus management. BLOCKING.

## Output Format

```
ACCESSIBILITY REVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[Category]: [finding]
  Severity: BLOCKING / WARNING
  Element: [what in the plan triggered this]
  Suggested Fix: [concrete change — e.g., "Add `title=\"Remove event\"` to the icon button described in step 3." or "Replace `color: #3B82F6` with `color: var(--accent-brand)`."]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLOCKING: N  |  WARNINGS: M
```

BLOCKING: missing keyboard nav for complex widgets, color-only state, icon buttons without labels, hardcoded colors, missing form labels, missing focus management.
WARNING: touch target sizes not explicitly considered, focus return behavior not mentioned, alt text not planned.

If no accessibility issues: "No accessibility issues found."
