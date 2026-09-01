---
name: Packt
description: Travel itinerary planning app. Next.js App Router, Tailwind CSS v4, shadcn + @base-ui/react primitives. This is Packt's first DESIGN.md — it documents the existing brand-layer tokens wholesale (none existed before) plus the component deltas the trip-contributors feature adds.
colors:
  # Existing Packt brand tokens (src/app/globals.css), documented here for the first time.
  bg: "#FFFFFF"
  bg-dark: "#0E1014"
  surface: "#F6F6F4"
  surface-dark: "#161922"
  surface-2: "#EFEFEC"
  surface-2-dark: "#1D212C"
  surface-3: "#E6E6E2"
  surface-3-dark: "#262B38"
  line: "rgba(20,20,18,0.08)"
  line-dark: "rgba(255,255,255,0.07)"
  line-strong: "rgba(20,20,18,0.14)"
  line-strong-dark: "rgba(255,255,255,0.13)"
  fg: "#131311"
  fg-dark: "#ECEDEF"
  fg-2: "#4A4A45"
  fg-2-dark: "#B8BBC4"
  fg-3: "#7A7A72"
  fg-3-dark: "#8B8F9A"
  fg-4: "#A0A098"
  fg-4-dark: "#61656E"
  accent-brand: "#0E8B80"
  accent-brand-dark: "#2BB5A6"
  accent-soft: "#D6EFEC"
  accent-soft-dark: "rgba(43,181,166,0.14)"
  accent-fg: "#FFFFFF"
  accent-fg-dark: "#07151A"
  accent-ink: "#0A4A44"
  accent-ink-dark: "#B6ECE6"
  warning: "#B6790A"
  warning-dark: "#E3A83A"
  warning-soft: "#FBEACB"
  warning-soft-dark: "rgba(227,168,58,0.16)"
  warning-ink: "#6B4406"
  warning-ink-dark: "#F5D9A0"
  danger: "oklch(0.577 0.245 27.325)"
  danger-dark: "oklch(0.704 0.191 22.216)"
  danger-soft: "#FBE4E1"
  danger-soft-dark: "rgba(255,99,71,0.14)"
  danger-ink: "#7A261D"
  danger-ink-dark: "#FFB3A8"
  popover: "#FFFFFF"
  popover-dark: "#1D212C"
typography:
  # Font families inherit from shadcn/next/font vars (--font-body, --font-heading-family,
  # --font-mono-family) with system fallbacks. Packt's delta is a global font-scale multiplier
  # (small/default/large, user preference) applied to every text-size token below via
  # calc({size}px * var(--font-scale)) — never a hardcoded px value in a component.
  body:
    fontFamily: "var(--font-body, ui-sans-serif)"
  mono:
    fontFamily: "var(--font-mono-family, ui-monospace)"
  chip-name:
    fontSize: 14px
  chip-meta:
    fontSize: 11px
  card-title:
    fontSize: 15px
  card-sub:
    fontSize: 13px
rounded:
  sm: "calc(var(--radius) - 4px)"
  md: "calc(var(--radius) - 2px)"
  lg: "var(--radius)"
  xl: "calc(var(--radius) + 4px)"
  DEFAULT: "0.625rem"
  full: "9999px"
spacing:
  # Tailwind's default 4-based scale, unmodified. No Packt override, no feature-specific token.
components:
  share-dialog:
    surface: "{colors.popover}"
    border: "{colors.line}"
    radius: "{rounded.lg}"
    pending-row-background: "{colors.surface-2}"
    active-row-background: "transparent"
    creator-row-lock-icon-color: "{colors.fg-4}"
  role-pill:
    manager-background: "{colors.accent-soft}"
    manager-foreground: "{colors.accent-ink}"
    editor-background: "{colors.surface-2}"
    editor-foreground: "{colors.fg-2}"
    viewer-background: "{colors.surface-2}"
    viewer-foreground: "{colors.fg-3}"
  pending-invite-badge:
    background: "{colors.warning-soft}"
    foreground: "{colors.warning-ink}"
    radius: "{rounded.full}"
  declined-invite-badge:
    background: "{colors.surface-2}"
    foreground: "{colors.fg-3}"
    radius: "{rounded.full}"
  revocation-modal:
    icon-color: "{colors.danger}"
    title-color: "{colors.fg}"
    body-color: "{colors.fg-2}"
  remove-control:
    idle-color: "{colors.fg-3}"
    hover-color: "{colors.danger}"
  sync-status-indicator:
    connected-color: "{colors.fg-4}"
    reconnecting-color: "{colors.warning}"
    offline-color: "{colors.danger}"
  pending-invitations-list:
    row-background: "{colors.surface-2}"
    row-radius: "{rounded.md}"
    accept-button: "primary variant, {colors.accent-brand}"
    decline-button: "outline/ghost variant, {colors.fg-2}"
  nav-invite-badge:
    color: "{colors.warning}"
    fontFamily: "{typography.mono.fontFamily}"
---

## Brand & Style

Packt is a quiet, editorial travel planner — the aesthetic is "well-kept trip notebook," not "flashy consumer app." A single teal accent (`{colors.accent-brand}`) marks anything live/active/actionable; everything else lives in a restrained warm-neutral grayscale. The trip-contributors feature inherits this wholesale: sharing and collaboration are treated as a natural extension of trip-keeping, not a separate "social" surface bolted on. Nothing about invitations, roles, or live sync gets a distinct visual language — it uses the same rails, dialogs, and typographic scale as the rest of the app.

The one deliberate new color vocabulary this feature introduces is a **danger register** for anything irreversible or security-sensitive (`{colors.danger}` family, already established for budget-overage warnings, now reused for removal/revocation) and a **pending register** (`{colors.warning}` family, already established for budget near-limit warnings, now reused for "invitation not yet accepted"). Both are reuses of existing tokens, not new colors — Packt's palette discipline is not to add a color without a reason shared elsewhere in the app.

## Colors

- **`{colors.accent-brand}`** (teal) — the only "this is actionable/live" signal. Used for the manager role pill, primary buttons in the share dialog (Send Invite, Save), and the connected state of the sync indicator is deliberately *not* teal (see below — connected is the quiet default, not an accent moment).
- **`{colors.warning}` family** — repurposed for "pending" states: the pending-invitation badge in the share dialog, and the sync indicator's reconnecting state. Already means "attention, not alarm" from its budget-threshold use elsewhere.
- **`{colors.danger}` family** — repurposed for irreversible/security actions: remove-contributor controls (on hover, matching `delete-trip-alert-dialog.tsx`'s existing destructive-button pattern), the revocation modal's icon and heading accent, and the sync indicator's offline state.
- **`{colors.fg-3}` / `{colors.fg-4}`** — the quiet default. The sync indicator's normal "connected" state uses `{colors.fg-4}`, not teal — a working connection is not an event worth an accent color; only its absence (reconnecting/offline) earns one.
- **`{colors.surface-2}`** — role pills for editor/viewer and the pending-row background in the share dialog, matching the existing `trip-edit-collaborators.tsx` row treatment.

Avoid: introducing any color not already in the token set above; using `{colors.danger}` for anything reversible (a role change is not danger-toned, only removal and revocation are); using the teal accent decoratively (it means "act on this" or "this is live," never chrome).

## Typography

Inherits Packt's existing font-scale system wholesale: every text size is `calc({base-px}px * var(--font-scale))`, never a bare pixel value, so the feature respects the user's small/default/large font-size preference automatically. New surfaces use the existing size vocabulary rather than inventing new steps:

- Share dialog row name → `{typography.chip-name}` (14px scaled)
- Share dialog row email / role meta → `{typography.chip-meta}` (11px scaled)
- Revocation modal title → `{typography.card-title}` (15px scaled)
- Revocation modal body → `{typography.card-sub}` (13px scaled)
- Sync status indicator label → `{typography.chip-meta}` (11px scaled), matching other status-bar-scale chrome

## Layout & Spacing

Tailwind's default spacing scale, unmodified — no Packt override exists today and this feature introduces none. The share dialog follows the existing `trip-edit-collaborators.tsx` row rhythm (`gap-2`, `padding: 6px 8px`, `{rounded.md}` per row) rather than a new layout language.

## Elevation & Depth

Inherits the existing three-tier shadow scale (`--shadow-1/2/3`) used across dialogs and popovers. The share dialog and revocation modal use `{shadow.2}` (the standard Base UI Dialog elevation already in use for `delete-trip-alert-dialog.tsx`); no new elevation tier is introduced.

## Shapes

Inherits Packt's existing radius scale (`{rounded.sm/md/lg/xl}`, base `0.625rem`). Dialogs use `{rounded.lg}`; pills (role badges, pending-invite badge) use `{rounded.full}`, matching existing badge components.

## Components

- **Share dialog** — a Base UI `Dialog` (`src/components/ui/dialog.tsx`), same primitive as `delete-trip-alert-dialog.tsx`. Structure: email input + role select at top (replacing `trip-edit-collaborators.tsx`'s inline "Add person" form), then one list mixing active contributors and pending invitations, each row showing avatar-initials chip (`{colors.accent-soft}`/`{colors.accent-ink}` tint, matching `collaborators-rail.tsx`'s existing initials-chip pattern), name/email, a role pill, and a remove control. The creator's row shows a lock icon (`{components.share-dialog.creator-row-lock-icon-color}`) instead of a remove control — never a disabled trash icon, which reads as broken rather than protected.
- **Role pill** — small pill, three tints per `{components.role-pill}`. Manager gets the accent tint (it is the "full trust" tier); editor and viewer share the neutral `{colors.surface-2}` tint, differentiated by label only — visually similar because both are "not full trust," distinguished by text.
- **Pending-invite badge** — small `{colors.warning-soft}`/`{colors.warning-ink}` pill reading "Pending," attached to a pending row instead of a role pill, since a pending invitation has no active role yet, only a role it *will* grant.
- **Declined-invite badge** — small `{colors.surface-2}`/`{colors.fg-3}` pill reading "Declined," neutral-toned (not the warning or danger register — a decline is an outcome, not something needing the manager's attention the way "pending" or "irreversible" do). Attached to a declined row in the share dialog, paired with a Dismiss control in place of Resend/Rescind.
- **Revocation modal** — a Base UI `AlertDialog` (not a plain `Dialog` — it has no dismiss-by-backdrop-click, matching `delete-trip-alert-dialog.tsx`'s pattern, because this is a state the user must acknowledge, not a passive notice). Single "OK" action, no Cancel — there is nothing to cancel, the trip is already gone.
- **Remove control** — a trash icon matching `trip-edit-collaborators.tsx`'s existing icon-button, but its hover color changes from `{colors.fg-3}` to `{colors.danger}` (today's version has no color change on hover — this is the one visual delta the feature adds to that pattern, making the destructive weight of "remove a person's access" legible before the click).
- **Sync status indicator** — a small text+dot chip in the app's status-bar position (new real estate — no status bar exists in Packt today; see `EXPERIENCE.md.Foundation`). Three states per `{components.sync-status-indicator}`: connected (quiet, `{colors.fg-4}`, easy to ignore), reconnecting (`{colors.warning}`, a pulse animation), offline (`{colors.danger}`, static — a pulse on a persistent problem reads as nagging).
- **Pending invitations list** (dashboard) — same row shape and tokens as the share dialog's pending-invite row (`{components.share-dialog.pending-row-background}`, `{components.pending-invite-badge}`), each row ending in an Accept button (primary variant) and a Decline button (outline/ghost variant, `{colors.fg-2}` — a plain secondary action, not the danger register, since declining only affects the recipient's own choice, not someone else's access). No new visual language — this is the share dialog's pending row, reused outside the dialog, with a second button.
- **Nav invitation badge** — the existing `NavItem` component (`src/components/packt/nav-item.tsx`) already has an unused `count` slot, today rendered in `{colors.fg-4}`. When count reflects pending invitations, it's tinted `{colors.nav-invite-badge.color}` (the same warning register as the pending-invite badge) instead of the neutral default — the only visual delta this feature adds to `NavItem`. No new component; a `highlight` boolean on the existing prop set switches the tint.

## Do's and Don'ts

| Do | Don't |
| --- | --- |
| Reuse `{colors.warning}`/`{colors.danger}` families from budget UI for pending/destructive states here | Invent a new "sharing" color vocabulary |
| Keep the sync indicator's connected state visually quiet (`{colors.fg-4}`) | Make a working connection an accent-teal moment |
| Use `AlertDialog` (no backdrop-dismiss) for the revocation modal | Let a revocation notice be dismissed by clicking outside it |
| Show a lock icon on the creator's row | Show a disabled/grayed-out trash icon on the creator's row |
| Match `trip-edit-collaborators.tsx`'s existing row rhythm and icon-button pattern | Introduce a new list-row layout for the share dialog |
