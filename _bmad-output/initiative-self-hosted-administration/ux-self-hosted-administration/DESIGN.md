---
name: Arrivo self-hosted administration
description: Administration that inherits Arrivo Profile & Settings visual language and shared UI primitives.
status: final
updated: 2026-10-27
sources:
  - ../brainstorm-admin-page/brainstorm-admin-page.md
  - .memlog.md
colors:
  # UI-system inheritance: theme-resolved aliases, not a new palette.
  background: "var(--bg)"
  surface: "var(--surface)"
  selected: "var(--surface-2)"
  foreground: "var(--fg)"
  secondary: "var(--fg-2)"
  border: "var(--line)"
  primary: "var(--accent-ink)"
  primary-dark: "var(--primary)"
  primary-foreground: "var(--primary-foreground)"
  destructive: "var(--destructive)"
  warning: "var(--warning-ink)"
  focus: "var(--ring)"
typography:
  heading:
    fontFamily: "var(--font-heading-family, ui-sans-serif)"
    fontSize: "calc(22px * var(--font-scale))"
    fontWeight: "700"
    letterSpacing: "-0.02em"
  body:
    fontFamily: "var(--font-body, ui-sans-serif)"
    fontSize: "calc(14px * var(--font-scale))"
    lineHeight: "1.55"
  label:
    fontFamily: "var(--font-mono-family, ui-monospace)"
    fontSize: "calc(12px * var(--font-scale))"
    fontWeight: "600"
    letterSpacing: "0.08em"
rounded:
  lg: "var(--radius-lg)"
  xl: "var(--radius-xl)"
spacing:
  field-gap: 16px
  section-gap: 32px
  margin-mobile: 16px
  margin-desktop: 24px
  navigation-width: 160px
  compact-content-width: 768px
  target-min: 44px
components:
  account-menu:
    background: "{colors.surface}"
    foreground: "{colors.foreground}"
    minHeight: "{spacing.target-min}"
  settings-shell:
    background: "{colors.background}"
    foreground: "{colors.foreground}"
  section-navigation:
    selectedBackground: "{colors.selected}"
    foreground: "{colors.foreground}"
    minHeight: "{spacing.target-min}"
  section-field:
    labelColor: "{colors.secondary}"
    gap: "{spacing.field-gap}"
  action-button:
    primaryBackground: "{colors.primary}"
    primaryBackgroundDark: "{colors.primary-dark}"
    primaryForeground: "{colors.primary-foreground}"
    minHeight: "{spacing.target-min}"
    radius: "{rounded.lg}"
  entity-list:
    separator: "{colors.border}"
  confirmation-dialog:
    radius: "{rounded.xl}"
  share-link:
    foreground: "{colors.foreground}"
  status-feedback:
    foreground: "{colors.secondary}"
  instance-summary:
    foreground: "{colors.foreground}"
  activity-list:
    separator: "{colors.border}"
  auth-card:
    background: "{colors.surface}"
    border: "{colors.border}"
  registration-form:
    foreground: "{colors.foreground}"
  mandatory-password-dialog:
    foreground: "{colors.foreground}"
    radius: "{rounded.xl}"
  recovery-form:
    foreground: "{colors.foreground}"
---

## Brand & Style

User direction: controls feel intuitive and match existing settings. Administration inherits Arrivo's restrained surfaces, teal actions, typography, field labels, section rhythm, and light/dark preferences. Use existing shadcn/Base UI components and Arrivo wrappers. This document specifies administration's composition and accessibility deltas; it does not replace the app theme.

Grounding: `src/app/(app)/profile/page-client.tsx`, `preferences-section.tsx`, `delete-account-dialog.tsx`, `src/components/arrivo/form-section.tsx`, shared UI primitives, and `src/app/globals.css`. Repository paths are relative to repository root.

Confirmed decisions are recorded in [.memlog.md](.memlog.md). [Approved visual references](mockups/index.html) illustrate composition; both spines govern on conflict. Reference files use offline system-font substitutes; runtime retains Arrivo fonts and shared components. [Visual coverage](visual-coverage.md) records approved mocked and spine-only surfaces.

## Colors

Frontmatter uses named CSS aliases under the UI-system inheritance rule. Resolve each alias from current Arrivo theme in `globals.css`, including its `.dark` values. Do not copy a light-theme snapshot into administration or introduce new admin colors.

Use {colors.background} for canvas, {colors.surface} for supporting surfaces, {colors.selected} for selected navigation, {colors.foreground} for primary text, {colors.secondary} for labels/help, and {colors.border} for quiet separators. Destructive actions inherit {colors.destructive}; warnings use {colors.warning}. Every state also has words.

Approved primary-button variant uses {colors.primary} (`--accent-ink`) in light theme and {colors.primary-dark} (`--primary`) in dark theme, both with theme-resolved {colors.primary-foreground}. Do not resolve light-theme {colors.primary} against dark `--accent-ink`: switch background token by theme. Current inherited values yield 10.12:1 light (`#0a4a44` / `#ffffff`) and 7.30:1 dark (`#2bb5a6` / `#07151a`). These are calculated solid-color text ratios, not rendered-app conformance claims. Use shared accessible variant; this contract does not require a global app palette change.

Contrast targets: normal text at least 4.5:1, large text 3:1, meaningful control boundaries and focus indicators 3:1 against adjacent colors, in both themes. Essential labels use stronger secondary text rather than existing `--fg-4`. Verify hover, focus, disabled, and error states at implementation; decorative separators need not serve as sole control boundaries.

## Typography

Inherit locally supplied Manrope headings, DM Sans body, and JetBrains Mono labels through existing CSS variables and fallbacks. Page title uses {typography.heading.fontSize}. Body uses {typography.body.fontSize}; labels retain existing uppercase mono character with {typography.label.fontSize}, raised from existing 9px labels for legibility.

Every size honors `--font-scale`. Display names, usernames, IDs, and explanatory text wrap. Essential identity and destructive consequences must remain readable without ellipsis-only disclosure.

## Layout & Spacing

Administration retains settings-style subsection navigation. Activity uses available main-content width. Overview and Users use padded, narrower content, with settings-like {spacing.compact-content-width} maximum inside their content panel and balanced surrounding space. Keep {spacing.margin-mobile} side padding below 640px and {spacing.margin-desktop} above. At 640px and wider, section navigation occupies {spacing.navigation-width} beside content, separated by {spacing.section-gap}. Below 640px, navigation is horizontal above a single content column. Reuse {spacing.field-gap} between fields and {spacing.section-gap} between distinct groups. Activity's width does not force other sections or individual fields to stretch.

Manage app is a separate page with Overview, Users, and Activity subsections similar to settings. Users owns account creation/setup-link controls; retention is within Activity. Existing side or bottom navigation exits page; no Back to settings link. Shared account menu contains Settings and Log out for everyone, plus admin-only Manage app. No standalone logout button or settings-heading administration link. Crowded user rows use options menu; Activity retains table structure within horizontal overflow container.

[Overview](mockups/key-overview.html) and [Users](mockups/key-users.html) illustrate narrower panels and surrounding space. [Activity](mockups/key-activity.html) illustrates wide Table composition and contained overflow. [Account menu](mockups/key-settings-entry.html) shows admin and regular-user states: desktop uses sidebar account control, mobile uses existing Profile tab.

## Elevation & Depth

Inherit shared dialog/backdrop and popover treatment, including current theme shadows. Sections use spacing and separators. Instance counts appear as labeled values, without introducing a separate dashboard card aesthetic.

## Shapes

Inherit shared component radii: {rounded.lg} for actions and bounded rows, {rounded.xl} for dialogs and mobile sheet upper corners. Use shared Lucide icons with stroke width 1.5; icon actions need visible focus, accessible names, titles, and {spacing.target-min} square targets.

## Components

First-run admin setup focuses Username on entry and omits “Already set up?” text and sign-in navigation.

| Component | Visual contract |
| --- | --- |
| account-menu | Shared shadcn DropdownMenu anchored to account control, with minimum 44px trigger and menu targets. Settings and Log out for everyone; Manage app for admins. Shared separators, focus, and selected/hover treatments. [Reference](mockups/key-settings-entry.html) shows role variants. |
| settings-shell | Separate Administration page with settings title hierarchy, inherited fonts/theme and Overview/Users/Activity subsection navigation. Activity wide; Overview/Users padded and narrower. Existing side/bottom navigation exits page, with no Back to settings link. Retention within Activity. Entry comes from admin-only item in username menu. |
| section-navigation | Existing line-style tabs: secondary text at rest, selected text plus selected surface; persistent focus ring. Selected state is distinct from hover. |
| section-field | Existing Section/Field anatomy: heading with separator, label above control, help/error below; stronger labels at typography.label scale. Inputs and selects retain shared outlines and focus states. |
| action-button | Shared variants with approved theme-specific primary pairing above; every target at least 44×44px, including copy, close, row actions, and Activity pagination. Users has no pagination. Override undersized default/small primitive heights locally as needed. |
| entity-list | Simple separated account rows without search/pagination: identity first, textual role/setup status second, actions last. Keep Add User as section action. Where row actions crowd, use shared DropdownMenu with More actions icon trigger and username-specific accessible name; menu contains applicable existing actions. Unfinished accounts include link expiry; expired links show explicit “Setup link expired” and Generate new link in available actions. Same Delete account action before/after first login; no setup-link Rescind. Disabled-action reasons use tooltip, not inline labels. No private-trip previews. |
| confirmation-dialog | Shared Dialog: centered from 640px, bottom sheet below 640px; title, consequences, inline error, Cancel, explicit action. Admin deletion explains manager-first/editor-second succession and deletion when only viewers or no members remain, without showing unauthorized trip details or successor pickers. Shorter retention names duration and permanent deletion of older activity. Scroll body with actions reachable above mobile keyboard. |
| share-link | Creation result only: selectable plain URL text followed by copy icon button, recipient identity, expiry where applicable, and concise copy result. No input, textarea, or input-like box for reset link. Copy icon uses shared Lucide Copy with stroke width 1.5, title/accessible name “Copy link,” and minimum 44px target. Keep dialog concise; omit lifecycle instructions and copy-before-closing paragraphs. Lists and Activity do not offer full-URL retrieval. Long URLs wrap without widening dialog. |
| status-feedback | Shared toast for transient completion; persistent inline text for field errors, unknown outcomes, loading, and empty states. Danger/warning styling accompanies exact words. Skeletons follow final row geometry. |
| instance-summary | Section/Field rhythm for version, counts, storage usage, health, and freshness timestamp; labeled health values rather than color-only dots. |
| activity-list | Proper shadcn Table with TableHeader, TableBody, TableRow, TableHead, and TableCell composition. Columns identify account username, type, action, timestamp/range, and allowed trip ID. Use inherited table separators and typography. Failed sign-ins with unmatched usernames carry “Unknown account” text. Routine trip-edit batches show one summary-only “Updated trip” row; no expand chevron or detail panel. Retain semantic headers and horizontal scrolling on narrow screens rather than converting rows to cards. IDs wrap; omit private titles and values. |
| auth-card | Inherit current auth layout: centered max-w-sm card, surface background, line border, rounded-2xl, p-8, with existing brand treatment. Sign-in displays Username and Password fields; no email field. Instance bootstrap uses admin-setup-form; later user password setup uses mandatory-password-dialog. |
| admin-setup-form | One-time `/setup` uses auth-card with “Welcome to Arrivo!” heading, “Let's get your admin account set up.” description, required Username, Name, Password and Confirm password in reading order, and “Create admin account” primary action. Preserve persistent labels, associated errors, 44px targets, new-password autofill, keyboard access and theme preferences. This instance bootstrap is separate from mandatory-password-dialog for later account setup links. Initialized instances show sign-in without signup navigation. |
| registration-form | Existing auth-form language: admin creation asks username; recipient setup shows already-created account's username read-only plus new-password fields, with no old-password field. Username can be changed later in Profile. One primary completion action, inline validation and setup context; no separate admin branding. |
| mandatory-password-dialog | Shared dialog/sheet visual language with title, fixed username displayed as identity text rather than editable input, required Name field, new-password/confirmation fields, inline errors, and Save password action. Username can be changed later in Settings. No close icon, Cancel, or dismiss affordance. Background inert and contains no accessible app content before completion. Preserve 44px targets, reachable actions above mobile keyboard, and inherited theme/font preferences. |
| recovery-form | Existing password/security-form language: labeled password fields, replacement-MFA setup/verification with QR and selectable manual key plus copy fallback, explanatory status, explicit completion action, and sign-in link. CLI uses terminal's native presentation. |

[First-time password setup](mockups/key-password-setup.html) illustrates fixed username identity and required dialog/sheet. [Users reset-result state](mockups/key-users.html) illustrates plain URL text with adjacent copy icon and concise identity/expiry.

## Do's and Don'ts

- Reuse theme, settings structure, shared primitives, and explicit action labels.
- Preserve 44px targets, legible labels, verified contrast, and visible keyboard focus even where existing settings fall short.
- Keep copied/created/saved states distinct; creation does not imply copying or delivery.
- Do not introduce a new palette, dense console aesthetic, private-trip previews, email-sent claims, or registration/upload-limit controls outside approved scope.
