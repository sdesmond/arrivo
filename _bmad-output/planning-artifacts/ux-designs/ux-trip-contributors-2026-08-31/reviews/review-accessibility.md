# Accessibility Review — Trip Contributors (DESIGN.md + EXPERIENCE.md)

Reviewed: DESIGN.md, EXPERIENCE.md (both `status: final`, updated 2026-08-31)
Reviewed against: `_bmad-output/project-context.md` (44×44px targets, icon-button `title`, WCAG posture) and `AGENTS.md`.

## Verdict

Conditional pass — the spine gets the fundamentals right (text-plus-color role labels, 44×44px targets, `title` attributes, `AlertDialog` focus trap, per-state `h1`s) but leaves four behavioral gaps unresolved, one of which (silent dialog-close interception) is a genuine WCAG failure risk and should be closed before this goes to implementation-ready story form.

## Findings

### 1. BLOCKING — Discard-confirmation swap is not announced; screen-reader user gets silent non-closure

**Where:** EXPERIENCE.md `Component Patterns` (Share dialog row) and `State Patterns` ("Unsaved staged changes, backdrop-click or `Esc`").

The spec is explicit that `Esc`/backdrop-click on a dialog with staged changes swaps the dialog's *own content* to a discard-confirmation view instead of closing. For a sighted user this is visually obvious — the dialog body changes. For a screen-reader user, pressing `Esc` inside a Base UI `Dialog` normally either closes the dialog (expected, learned behavior) or does nothing perceptible. Nothing in either document specifies:

- Whether the swapped-in content is placed in a live region (`role="alert"` or `aria-live="assertive"`) so its appearance is announced without the user needing to re-explore the dialog.
- Whether focus is programmatically moved to the new content (e.g., to the "Discard unsaved changes?" heading or the "Keep editing" button) after the swap, or whether focus stays wherever it was (likely on a row control that no longer matches what's on screen).

Without one of these, a screen-reader user's `Esc` press produces total silence — the dialog doesn't close, nothing is announced, and unless they re-read from the top they won't discover why. This is exactly the scenario the task called out, and it's unresolved. This is the one finding in this review with real WCAG exposure (4.1.3 Status Messages) — recommend requiring an announced status message plus a focus move to the confirmation's primary heading/button as an explicit spec line before implementation.

### 2. SHOULD-FIX — Revocation modal's focus arbitration against an already-open modal is undefined

**Where:** EXPERIENCE.md `Information Architecture` ("Revocation modal ... fired ... on whatever page they're on"), `Component Patterns` (Revocation modal row), Flow 3.

The spine states the share dialog "never opens another dialog on top of itself" but that rule is scoped to the share dialog's own discard-confirmation — it says nothing about the revocation `AlertDialog` arriving while *some other* modal (most plausibly the share dialog itself, since a manager can be removed by another manager while their own share dialog is open) already holds the page's focus trap.

The task specifically asks "is there anything before it stealing focus back" — this is the concrete case: two Base UI modal roots contending for the DOM's single focus trap. Undefined behavior here could mean the revocation `AlertDialog` mounts but never receives focus (trapped inside the still-open share dialog), or it forcibly closes the share dialog with unstated data-loss consequences for whatever the manager had staged in it. Needs an explicit rule, e.g., "the revocation modal always takes priority; any open dialog is force-closed (staged changes discarded, no confirmation) before it mounts and receives focus."

### 3. SHOULD-FIX — Sync indicator's live-region contract omits the recovery announcement and motion accommodation

**Where:** EXPERIENCE.md `Accessibility Floor` ("announced via `aria-live=\"polite\"` — a screen-reader user learns 'reconnecting' / 'offline'") and `State Patterns` ("Sync reconnecting" / "Sync offline").

Two gaps:
- The `aria-live="polite"` contract is written only for the two "bad" transitions (→ reconnecting, → offline). It doesn't say a transition back to connected is announced. A screen-reader user who heard "offline" has no specified way to learn the connection recovered short of guessing — for a state that DESIGN.md itself says should stay "quiet," an announced recovery is the one moment that quiet default actually needs to speak.
- DESIGN.md specifies a "pulse animation" for reconnecting. Neither document mentions `prefers-reduced-motion`. Given the project's existing WCAG posture (44×44px enforcement, explicit accessibility floors elsewhere in this same spine), a persistent pulsing status-bar element with no reduced-motion fallback is an omission worth closing now rather than after a reviewer flags it at build time.

### 4. MINOR — Creator row's lock icon has no specified accessible name

**Where:** DESIGN.md `Components` ("The creator's row shows a lock icon...") and EXPERIENCE.md `Component Patterns` (Creator row).

EXPERIENCE.md's Accessibility Floor requires `title` attributes on the resend/rescind/remove icon buttons but is silent on the lock icon, which is the *only* thing communicating why the creator's row has no role pill and no remove control. A screen-reader user tabbing/reading through the row hits a non-interactive icon (or none, if it's not even in the accessibility tree) and no textual explanation for the missing controls other row types have. Add a `title`/`aria-label` (e.g., "Trip creator — access can't be changed") consistent with the pattern already required for the other icon controls in the same dialog.

### 5. MINOR — "Quiet" connected state's text-label presence is ambiguous

**Where:** DESIGN.md `Components` / `Colors` ("connected (quiet, `{colors.fg-4}`, easy to ignore)") vs. EXPERIENCE.md's own "role/state is never color-only" principle applied elsewhere.

DESIGN.md is explicit that role pills and the pending badge always carry a text label alongside color/tint — good, and the task's "role by more than color" check is satisfied there. But the sync indicator's connected state is only described as a quiet dot color, without confirming the `{typography.chip-meta}` text label DESIGN.md assigns to "Sync status indicator label" is actually rendered in the connected state too (vs. only appearing once state degrades). If the label is hidden by default, connected vs. "indicator not yet mounted" becomes indistinguishable to a colorblind user relying on shape/text rather than the fg-4 tint. Make explicit that the text label is always present (even if visually muted), only its color/emphasis changes.

## Areas confirmed compliant (no finding needed)

- Role communicated by text + tint everywhere it appears (role pills, pending badge) — DESIGN.md's Do's/Don'ts explicitly forbids color-only differentiation.
- Interactive targets (role select, resend/rescind/remove) held to the project's 44×44px floor.
- Icon-only resend/rescind/remove controls required to carry `title="Action {name}"`.
- Revocation modal uses `AlertDialog` (focus-trap + no backdrop-dismiss) rather than a dismissible `Dialog`, matching `delete-trip-alert-dialog.tsx` precedent — appropriate primitive choice for an unprompted interrupt, modulo Finding 2's stacking gap.
- Accept-invite page's four states are each a distinct `h1`, giving screen-reader users an immediate, unambiguous landing signal per state — this was the strongest explicit answer to the task's four-states question.
- Keyboard operability of resend/rescind/remove isn't explicitly re-stated beyond "matching existing icon-button convention," but since that convention is a real `<button>` with `title` (per `trip-edit-collaborators.tsx` precedent cited throughout), native keyboard operability is inherited correctly — no separate custom click-handler-on-div risk apparent in the spec.
