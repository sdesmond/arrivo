---
name: Packt — Trip Contributors
status: final
sources:
  - _bmad-output/specs/spec-trip-contributors/SPEC.md
  - _bmad-output/planning-artifacts/architecture/architecture-trip-contributors-2026-08-31/ARCHITECTURE-SPINE.md
  - _bmad-output/brainstorming/brainstorm-trip-contributors-2026-08-31/brainstorm-intent.md
updated: 2026-08-31
---

# Packt — Trip Contributors Experience Spine

> Feature-scoped experience spine, paired with this workspace's `DESIGN.md`. Covers the trip-contributors capability set (SPEC-trip-contributors CAP-1..CAP-10): sharing, invitations, roles, live sync, and revocation. It does not re-document the rest of Packt's IA — only the surfaces this feature adds or changes.

## Foundation

Responsive web (existing Packt surface — no native mobile app). Next.js App Router, Tailwind CSS v4, shadcn + `@base-ui/react` primitives (Base UI's `Dialog` and `AlertDialog`, not Radix — see `DESIGN.md` for the visual identity these inherit). Single-tenant per trip, extended by this feature to multi-contributor: a trip now has exactly one creator plus zero or more managers/editors/viewers, per `ARCHITECTURE-SPINE.md` AD-1.

## Information Architecture

| Surface | Reached from | Purpose |
| --- | --- | --- |
| Share dialog | "Invite" button on the trip detail page's Collaborators rail (manager/creator only) | Control plane for invitations, active contributors, roles, removal, resend — the hub SPEC-trip-contributors calls out explicitly |
| Pending invitations list | Trips dashboard, for the signed-in user; surfaced everywhere via the sidebar's "Trips" nav badge | Shows invitations addressed to me (matched by account email); Accept grants access and redirects to the trip overview. No public route — this is an authenticated-only surface (SPEC requires a matched account at invite time) |
| Nav invitation badge | Sidebar "Trips" nav item, visible on every app page (persistent sidebar) | A count badge naming how many pending invitations await; the discovery mechanism that makes the pending invitations list findable without hunting — CAP-2's "invited person accepts" needs the invitee to notice the invitation exists |
| Trip overview (existing, first-visit-after-accept) | Redirect after acceptance | States trip identity, who shared it, and the recipient's access level explicitly (SPEC CAP-2) |
| Trips dashboard (existing) | App shell nav | Now also reflects contributor removal live — a revoked trip disappears without a refresh |
| Revocation modal | Fired by a live `membership-removed` event naming the current user, on whatever page they're on | A blocking notice, not a navigable surface — the user cannot dismiss it by clicking away |
| Sync status indicator | Global, fixed bottom-left when a problem persists | Signals reconnecting/offline without permanent healthy-state chrome; hidden while connected |

Modal stacks one level deep — the share dialog never opens another dialog on top of itself. A role-change or removal within it is staged inline, not a nested confirm; the unsaved-changes-on-close guard (see Component Patterns) is likewise rendered *inside* the same dialog — its content swaps to a discard-confirmation view rather than opening a second, stacked dialog.

→ Composition reference: `mockups/key-share-dialog.html` (share dialog at rest + the discard-confirm alternate state). Every other surface here was left spine-only by choice — see `DESIGN.md.Components` for their prose specs. Spine wins on conflict with the mock.

## Voice and Tone

Microcopy. Brand voice lives in `DESIGN.md.Brand & Style`. Packt's existing register (see `delete-trip-alert-dialog.tsx`'s "This cannot be undone...") is direct, unadorned, no exclamation points, states consequence plainly.

| Do | Don't |
| --- | --- |
| States consequence plainly, same directness as `delete-trip-alert-dialog.tsx`'s "This cannot be undone." | "Oops! You've lost access 😢" |
| "Invitation sent." / "Invitation resent." (shown via `toast.success()`, matching Packt's existing sonner convention for action confirmations) | "Yay, they're invited!" |
| "This invitation was rescinded by the trip owner." | "This invite is no longer valid." (vague about why) |
| "No Packt account found for this email." | "Invalid email." (vague — doesn't tell the manager what to do next) |
| "Invitation declined." (shown via `toast.success()`) | No toast at all (the row's disappearance alone is ambiguous — did it fail or succeed?) |
| "You no longer have access to this trip. Contact {removedByName} to request access again." | "Access denied." |
| "Unable to sync" | "Sync error!" |
| Role names in UI: Viewer, Editor, Manager (capitalized, matching existing "Owner/Editor/Viewer" pill labels) | Inventing friendlier synonyms ("Can edit", "Can view") that drift from the server-side role names |

## Component Patterns

Behavioral. Visual specs live in `DESIGN.md.Components`.

| Component | Use | Behavioral rules |
| --- | --- | --- |
| Share dialog | Trip detail, manager/creator only | Opens with email input + role select (default Viewer, per SPEC) at top, then one combined list of active contributors and pending invitations. Entering an email with no matching Packt account shows an inline error next to the input ("No Packt account found for this email.") instead of creating a pending row (SPEC CAP-1). Role changes and removals are staged client-side; Save applies them as one batch (`ARCHITECTURE-SPINE.md` AD-7). Clicking Cancel discards all staged changes immediately, no extra step. Attempting to close by backdrop-click or `Esc` *while a change is staged* instead swaps the dialog's own content to an inline discard-confirmation view ("Discard unsaved changes?" / Discard / Keep editing) — never a second stacked dialog, and never triggered by the explicit Cancel button, which already means discard. **This swap moves focus to the "Keep editing" button (the safe default) and is announced via `role="alertdialog"` + `aria-live="assertive"` on the swapped region** — a screen-reader user closing the dialog is told why it didn't close, not left in silence. |
| Pending invitation row | Share dialog | Same row shape as an active contributor, but shows the pending-invite badge instead of a role pill and offers Resend + Rescind actions instead of a role dropdown + remove. Resend issues a fresh 72h window silently (no separate confirmation — it's non-destructive). Rescind asks nothing extra either; it only affects a not-yet-accepted invite. Sending a new invite to an email that already has a pending row updates that same row in place (badge's "sent" timestamp refreshes) rather than adding a second row — the manager sees the existing row change, not a duplicate appear, confirming it merged. |
| Declined invitation row | Share dialog | The manager's visibility into CAP-11: when a recipient declines, that row stays in the dialog's list (moved out of the "pending" grouping) showing the declined-invite badge instead of the pending badge, with a single Dismiss control (same icon-button pattern as Rescind) in place of Resend/Rescind. Dismiss fires immediately, no confirmation — it only deletes the historical row, nothing live. Re-inviting the same email instead creates a fresh pending row (the old declined row is untouched until separately dismissed), since a decline doesn't block a new invite. |
| Creator row | Share dialog | Shows a lock icon, never a role dropdown or remove control — this is the one row nobody (including another manager) can touch. The icon carries `aria-label="Trip creator — access can't be changed"`, the same treatment as every other icon control in this dialog (Accessibility Floor). |
| Pending invitations list | Trips dashboard | Shows each invitation addressed to the signed-in user (trip name, inviter, role). Accept calls `acceptInvitation()` and redirects to the trip overview. Decline calls `declineInvitation()` (`ARCHITECTURE-SPINE.md` AD-5, CAP-11) and the row disappears from the list immediately — no confirmation step, matching Accept's directness and the manager-side Resend/Rescind pattern of "no extra step for a reversible-by-re-invite action." An invitation that expires or is rescinded also just drops out of this list — there is no separate terminal-state page, since acceptance/decline was never a public route. |
| Nav invitation badge | Sidebar, on the "Trips" `NavItem`, every app page | Reuses `NavItem`'s existing (currently unused) `count` slot: the number of pending invitations, tinted `{colors.warning}` instead of the neutral default (`DESIGN.md.nav-invite-badge`) — the only signal that draws attention to the invitation without a toast or interrupt. Absent entirely when the count is zero, matching `NavItem`'s existing `count == null` behavior. |
| Revocation modal | Any authenticated page, on a self-targeted `membership-removed` event | `AlertDialog`, no backdrop-dismiss, single "OK." Names the trip and the manager who removed them (`removedByName`/`removedByEmail` from the event payload — see AD-3; the acting manager, not necessarily the trip creator). OK returns to the dashboard; the trip is gone from history (browser Back re-hits `assertTripAccess()`'s existing `notFound()`, not a client-side route guard). **Global priority: if any other dialog is open when a self-targeted `membership-removed` arrives (e.g. a manager has the share dialog open and is removed by another manager) that dialog is force-closed — any of its staged changes are simply discarded, since the underlying access is already gone — and the revocation modal takes its place as the sole open surface.** This is the one exception to the one-level-deep modal-stacking rule (Information Architecture): a revocation is not a UI event competing for a layer, it's the access boundary itself closing. |
| Sync status indicator | Global, fixed bottom-left problem surface | Connected renders no visible chrome. Reconnecting appears only after a 2-second grace window as a warning `RefreshCw` icon; offline uses a static danger `WifiOff` icon. Each icon has a 44×44px focusable trigger, `aria-label`, and Base UI tooltip (`Reconnecting` / `Unable to sync`) reachable by hover, keyboard focus, and tap. State changes announce through a persistently mounted `aria-live="polite"` region, including recovery to `Connected`. Reconnecting pulse respects `prefers-reduced-motion`. Mobile placement clears the tab bar plus safe-area inset; desktop placement clears the sidebar. |
| Role pill / dropdown | Share dialog active-contributor rows | A `Select` (matching `trip-edit-collaborators.tsx`'s existing pattern) for anyone but the creator. Changing it doesn't write immediately — it stages the change, same as removal. |

## State Patterns

| State | Surface | Treatment |
| --- | --- | --- |
| No contributors yet | Share dialog | Reuses existing copy: "No collaborators yet." Single email input remains the primary action. |
| Unsaved staged changes, backdrop-click or `Esc` | Share dialog | Dialog content swaps in place to a discard-confirmation view (not a second dialog — see Component Patterns) before allowing close. The explicit Cancel button is exempt — it already means discard and closes immediately. |
| Invitation sent / resent | Share dialog | `toast.success("Invitation sent.")` / `toast.success("Invitation resent.")`, matching Packt's existing sonner convention for action-result confirmations elsewhere in the app. The row's pending badge timestamp also updates in place — the toast confirms the action fired, the row confirms the new state stuck. |
| Invitation expired | Pending invitations list (dashboard) | The row silently drops from the list once `expiresAt` passes — no terminal-state page, since there is no separate accept route to render one on. A fresh invite must come from the manager (implicit resend if the manager re-invites the same email while it's still pending, a fresh invite otherwise). |
| Invitation rescinded | Pending invitations list (dashboard) | The row disappears from the list immediately (SSE-pushed refresh) or on next reconnect. There is no separate "rescinded" message shown to the recipient beyond the row's absence — they never had a link to click that could surface one. |
| No matching Packt account | Share dialog (manager side) | Inline error next to the email input: "No Packt account found for this email." No invitation is created; this is the only rejection surface for this case (see Component Patterns). |
| Sync reconnecting | Global corner indicator | Hidden during the 2-second grace window, then warning-toned and pulsing (static under reduced motion) with tooltip `Reconnecting`. No blocking behavior — edits continue through existing server actions. |
| Sync offline | Global corner indicator | Danger-toned `WifiOff` icon, static, with tooltip `Unable to sync`. No toast; the problem indicator is the single visible signal for this ambient state. |
| Actively viewing, contributor removed | Wherever the user currently is | Revocation modal appears immediately (AD-4's event short-circuit) — no toast preamble, no navigation first. |
| Role changed while viewing | Trip page the affected user has open | New permissions apply on next server action call (already enforced server-side); the UI reflects the new capability set on the next itinerary/query refetch the SSE event triggers — no separate "your role changed" interstitial, since a promotion/demotion is not the trust-breaking event a removal is. |
| Viewer opens a shared trip | Trip detail page | The Budget tab/section is absent from trip navigation entirely for a viewer (CAP-3, AD-8) — not present-but-disabled. Nothing in the itinerary view references money; there is no "upgrade to see this" placeholder, since a viewer isn't meant to know budget data exists on this trip at all. |
| Editor opens a shared trip | Trip detail page | Editor sees and can edit itinerary and budget/money items exactly like the creator (CAP-4). The "Delete trip" action and the "Invite"/Share entry point are absent from their view, not disabled-with-tooltip — an editor has no membership-management surface to discover, matching the manager-only gating already on the Share dialog trigger (Information Architecture). |
| Concurrent edit collision | Itinerary (any shared trip) | No conflict UI by design (CAP-10, AD-8) — the last write silently wins and every open session converges to it on its next refetch. This is an intentional absence, not a gap: Packt does not surface "someone else changed this" for itinerary edits. |

## Interaction Primitives

Packt has no dedicated keyboard-shortcut surface (unlike a power-tool product); standard Base UI `Dialog`/`AlertDialog` keyboard semantics apply as inherited defaults: `Esc` closes (share dialog intercepts this when changes are staged, per Component Patterns above), `Tab` cycles focusable elements in document order, focus traps inside the open dialog, focus returns to the trigger on close. Mouse/touch is the primary interaction mode throughout — the share dialog and pending invitations list are click/tap-first, matching the rest of the app.

## Accessibility Floor

Behavioral. Visual contrast lives in `DESIGN.md` (inherits Packt's existing token contrast ratios).

- Every interactive target in the share dialog, revocation modal, pending invitations list, and sync-status tooltip trigger meets Packt's existing 44×44px minimum.
- Icon-only controls (remove, resend, rescind) carry a `title` attribute naming the action and the person, e.g. `title="Remove {name}"` — matching the existing icon-button convention.
- Role is never color-only: every role pill and the pending badge carry a text label, not just a tint (`DESIGN.md.Do's and Don'ts`).
- The sync status indicator's state changes are announced via `aria-live="polite"` — a screen-reader user learns `Reconnecting`, `Unable to sync`, and `Connected` on recovery. Visible icons use `aria-label` plus tooltip text rather than a duplicate native `title`; reconnecting pulse respects `prefers-reduced-motion`.
- The revocation modal traps focus (inherited from Base UI `AlertDialog`) and is announced on open, matching `delete-trip-alert-dialog.tsx`'s existing pattern. It takes priority over any other open dialog (Component Patterns) rather than competing with it for focus.
- Each accept/decline button in the pending invitations list carries a `title` attribute naming the trip, e.g. `title="Accept invitation to {tripName}"` / `title="Decline invitation to {tripName}"` — matching the existing icon-button/labeled-control convention used elsewhere in this feature.
- The nav invitation badge is exposed to screen readers via an `aria-label` on the "Trips" nav link that includes the count, e.g. `aria-label="Trips, 2 pending invitations"` — the badge is not color-only and not visual-only.
- The share dialog's discard-confirmation swap moves focus to "Keep editing" and announces via `aria-live="assertive"` (Component Patterns) — closing the dialog never silently fails to close.

## Responsive & Platform

| Breakpoint | Behavior |
| --- | --- |
| `md+` | Share dialog renders as a centered Base UI `Dialog` (inherited default). |
| `< md` | Share dialog adapts via the existing `useIsMobile()` behavior already built into `src/components/ui/dialog.tsx` — no new responsive logic needed, this feature inherits it. |
| All breakpoints | Revocation modal uses the same responsive treatment as any other Base UI `AlertDialog` already in the app — no feature-specific override. The pending invitations list inherits the dashboard's existing responsive list treatment. |

Packt is responsive web only; this feature adds no native-mobile-specific behavior.

## Key Flows

### Flow 1 — Priya shares her Lisbon trip with her sister (existing Packt user, Tuesday evening)

1. Priya, the trip's creator, opens her Lisbon trip and clicks "Invite" on the Collaborators rail.
2. The share dialog opens: empty state ("No collaborators yet."), email input and role select (defaulted to Viewer) at top.
3. She types her sister's email — already a Packt user — leaves the role at Viewer, and clicks Send Invite. A new pending row appears immediately with the pending badge.
4. She closes the dialog (no other staged changes, closes cleanly).
5. **Climax:** Her sister, a few minutes later, opens Packt and immediately sees a "1" badge on the sidebar's Trips nav item — she wasn't hunting for it. She clicks through, sees the pending invitation for the Lisbon trip in her dashboard's pending invitations list, and clicks Accept. She lands directly on the Lisbon trip overview — it states Priya shared it with her and that she has Viewer access. No email round-trip was needed; the whole loop happened inside the app both of them already had open.

Failure: Priya mistypes her sister's email and it happens to match a different real Packt account — the invite succeeds against the wrong person, since matching an existing account is the only check made. She reopens the share dialog, clicks Rescind on the wrong pending row, and re-invites with the correct address (an implicit resend if the corrected address happens to match an existing pending row, per `ARCHITECTURE-SPINE.md` AD-2 — otherwise a fresh invite).

### Flow 2 — A manager tries to invite someone with no Packt account yet (Thursday morning)

1. A manager enters `devon@example.com` in the share dialog — Devon has no Packt account.
2. **Climax:** The dialog shows an inline error next to the email field: "No Packt account found for this email." No invitation is created, no email is sent — nothing persists server-side.
3. The manager tells Devon out-of-band (a text, a call) to sign up for Packt first, then re-enters his email once he has an account. That invite proceeds exactly as Flow 1.

Failure: the manager doesn't notice the inline error and assumes the invite went through. There's nothing to reconcile server-side, since no invitation row was ever created — when Devon says he never got access, the manager just retries once Devon has signed up.

### Flow 3 — Mara loses access mid-session (Saturday, actively viewing)

1. Mara, a viewer on a shared trip, has the itinerary open on her phone at the airport, checking her flight's terminal.
2. Unrelated to her, the manager decides to remove her — a plan changed and she's no longer coming.
3. **Climax:** Mid-scroll, a modal appears over whatever she was looking at: "You no longer have access to this trip. Contact {removedByName} to request access again." She taps OK. She's back on her dashboard — the trip is simply gone from her list, not grayed out or archived. She can't get back to it by hitting Back on her phone's browser either.

Failure: her connection drops right as this happens (airport wifi). She doesn't see the modal until her `EventSource` reconnects and its resync fires — briefly, she could have kept scrolling stale content, but the next server action she attempts (or the reconnect-triggered refetch) hits the now-revoked `assertTripAccess()` check and the flow converges to the same modal, just a beat later than the live case.
