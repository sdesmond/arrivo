---
type: architecture-review
lens: adversarial
target: ../ARCHITECTURE-SPINE.md
spec: _bmad-output/specs/spec-trip-contributors/SPEC.md
created: "2026-08-31"
---

# Adversarial Review — trip-contributors Architecture Spine

## Method

For each AD, I constructed two engineers (or two eventual stories) that each satisfy the AD's literal
rule text, and asked whether their outputs would interoperate cleanly. Every pair below is a case where
both readings are defensible under the AD as written, but the two implementations produce incompatible
or unsafe behavior when combined. Findings are tiered BLOCKING (must close before story breakdown),
HIGH (should close), MEDIUM (worth a line), LOW (note for awareness).

---

## Finding 1 — BLOCKING: AD-9 never re-binds to AD-1's creator-protection invariant at the mutation boundary

AD-1 states the rule ("only the `isCreator` row is non-removable and non-demotable") but the rule lives
in the *data model* AD. AD-9 owns the only write path that can violate it (`saveContributorChanges`,
one transaction, `ContributorChange[]` keyed by id) and never restates the guard as something that
transaction must enforce.

- **Builder A** implements `saveContributorChanges` as a pure "apply what's staged" transaction — trusts
  that `trip-share-dialog.tsx` never lets the user stage a change against the `isCreator` row (control is
  disabled/hidden in the UI for that row), so the server performs no `isCreator` check.
- **Builder B** implements `trip-share-dialog.tsx` assuming the server is the enforcement point (per
  AD-8's "no new enforcement layer... enforcement stays server-side" philosophy applied by analogy), so
  the dialog does *not* specially disable controls on the creator's row — it relies on `saveContributorChanges`
  to reject/ignore any change targeting `isCreator=true`.

Both are individually consistent with the spine (AD-9's text says nothing about per-change validation
beyond atomicity; AD-8 sets a general precedent that enforcement belongs server-side, not UI-side).
Combined, wired together as separate stories, **neither layer enforces AD-1's creator protection** — a
crafted or buggy `ContributorChange[]` payload can demote or remove the one row the entire model depends
on always existing as a manager, silently succeeding because the transaction has no expected-state check
to fail on.

**Fix:** Add an explicit sentence to AD-9 (or a new AD-9a): "`saveContributorChanges` rejects the entire
batch if any `ContributorChange` targets a collaborator row where `isCreator=true`; this check happens
inside the transaction regardless of what the dialog does or does not expose in the UI."

---

## Finding 2 — BLOCKING: accept-vs-rescind/resend race has no mandated atomic check-and-transition

AD-7 says the accept route "resolves the token (hash + expiry + status check via `invitations.ts`), then
branches." It does not say whether that resolution and the eventual `collaborators` INSERT + `invitations`
status flip happen as one atomic step, nor does AD-2/AD-3 pin down who wins when a manager's
rescind/resend races a recipient's in-flight accept.

- **Builder A** writes `invitations.ts` to `SELECT ... WHERE tokenHash=X` for validation display, then —
  after the session-state branch resolves (possibly after a signup detour per AD-7's second branch) —
  issues a separate `INSERT INTO collaborators` followed by `UPDATE invitations SET status='accepted'`.
  Two statements, no row lock.
- **Builder B** writes it as `UPDATE invitations SET status='accepted' WHERE tokenHash=X AND status='pending' AND expiresAt > now() RETURNING *`, and only inserts into `collaborators` if that update actually
  returned a row — a single atomic status transition gates the side effect.

Both satisfy AD-7's plain-English description of "resolve then branch." But if a manager rescinds
(AD-2's `rescindInvitation`, presumably `UPDATE invitations SET status='rescinded'`) or resends
(AD-2's fresh `tokenHash` + `expiresAt` reset) in the window between Builder A's initial SELECT and its
later INSERT/UPDATE, Builder A's flow **still grants access** on a token the manager just invalidated —
the exact failure the "resend invalidates the prior token outright" language in AD-2 is trying to
prevent, but AD-7 doesn't close the read-check/write-commit gap where it actually matters. This gets
worse across the signup-detour branch in AD-7, where the token is resolved once at page load and the
gap before "complete acceptance on return" can be minutes, not milliseconds.

**Fix:** AD-7 (or AD-2) should mandate: "Acceptance re-validates and atomically transitions token state
in the same statement/transaction that grants access (e.g., `UPDATE invitations SET status='accepted' WHERE tokenHash=? AND status='pending' AND expiresAt>now() RETURNING id`); a zero-row result at
that final step is always treated as invalid, even if an earlier check in the same request passed." Also
state explicitly: for the signup-detour branch, token validity is re-checked at the *completion* step,
not trusted from the initial page-load check.

---

## Finding 3 — HIGH: no explicit resync rule for SSE reconnect leaves CAP-8 live-sync unmet for an open tab

AD-4's rationale for why missed events are safe is "a client that misses an event still sees correct
state on next navigation/refetch." But CAP-8's success criterion is state becomes visible "without
navigation or refresh" — for a tab that's simply left open across a reconnect, "next navigation" may
never come.

- **Builder A** treats AD-4 literally: `EventSource.onerror`/backoff only drives the offline indicator;
  on `onopen` after a reconnect, no special action is taken — the client trusts it'll catch the next live
  event and, failing that, whatever the user's next page navigation happens to be.
- **Builder B** adds an `onopen` handler that fires one authoritative refetch of trip state whenever the
  connection re-establishes after having been down, treating reconnect itself as a resync trigger.

Both comply with AD-4's rule text — it never mandates or forbids a reconnect-triggered refetch. But
Builder A's client can miss an event during exactly the outage window the offline indicator is
built to surface, and then silently sit on stale membership/itinerary state indefinitely if the tab
stays open, which is a direct CAP-8 violation the spine leaves unclosed.

**Fix:** Add to AD-4: "On `EventSource` reconnect (transition from error/backoff state to `onopen`), the
client performs exactly one authoritative refetch of trip state before resuming event-driven updates."

---

## Finding 4 — HIGH: no ordering/cancellation guarantee across back-to-back events for the same recipient

AD-5's in-process `Map<tripId, Set<subscriberCallback>>` carries no sequence number or event ordering
guarantee, and AD-4 never specifies how a client should sequence the async refetches its own event
handlers trigger.

Concrete pair: contributor X is promoted (`membership-changed`) and, moments later — a second manager
Save, or the same manager acting twice — removed (`membership-removed`), while X's tab is open.

- **Builder A** implements the client's `membership-changed` handler as "kick off a refetch of trip data,
  await it, then re-render" with no cancellation. If that refetch is still in flight when
  `membership-removed` arrives for the same user and the revocation modal is shown, the earlier refetch's
  response can resolve afterward and re-render trip content (now-forbidden) transiently on top of/behind
  the modal.
- **Builder B** implements the same handler with an `AbortController` per in-flight refetch, or a
  monotonic "ignore stale responses once `membership-removed` for self has landed" flag.

Both are valid readings of AD-4, which only specifies *that* a refetch happens on event receipt, not how
concurrent/superseded refetches are reconciled. The divergence is a real security/UX regression in
Builder A's case (revoked content flashing back into view), not just a cosmetic difference.

**Fix:** Add to AD-4: "A `membership-removed` naming the current user supersedes and cancels any
in-flight refetch triggered by an earlier event for this session; no later-resolving fetch may repaint
trip content after the revocation modal is shown."

---

## Finding 5 — MEDIUM: AD-9's "all land or none do" doesn't define behavior when a target row's state has moved

AD-9 guarantees transactional atomicity across the batch but says nothing about what happens when an
individual `ContributorChange`'s target row is no longer in the state the dialog staged it against —
e.g., another manager's concurrent Save already removed that collaborator, or the underlying invitation
transitioned `pending → accepted` (a fresh `collaborators` row now exists) between dialog-open and Save.

- **Builder A** writes each change as an unconditional `UPDATE ... WHERE id=?` / `DELETE ... WHERE id=?`.
  If the row's already gone, the statement affects 0 rows, no error is raised, and the transaction commits
  "successfully" — the batch technically "all landed," but one staged change silently did nothing and the
  manager gets no signal their promotion/removal didn't take effect.
- **Builder B** writes each change with an expected-state guard (`WHERE id=? AND role=<staged-from-role>`,
  or a pre-check `SELECT` inside the transaction) and aborts the entire batch with a conflict error if any
  guard fails, forcing the dialog to reload and re-stage.

Both satisfy "applies every change inside a single DB transaction — all staged edits land, or none do,"
because a 0-row no-op still "lands" as a completed SQL statement under Builder A's reading. The two
stories produce materially different guarantees for the exact scenario AD-9 exists to protect
(concurrent managers editing the same contributor list), and the spine doesn't say which is intended.

**Fix:** AD-9 should state whether a `ContributorChange` targeting a row whose observed state doesn't
match what was staged is (a) applied anyway on best-effort semantics, or (b) grounds to abort the whole
batch and surface a conflict — pick one, and specify how the dialog recovers in the reject case.

---

## Finding 6 — MEDIUM: `ownerName`/`ownerEmail` in the `membership-removed` payload is ambiguous after AD-1 flattens the hierarchy

AD-4's payload spec (`{removedUserId, tripName, ownerName, ownerEmail}`) and CAP-9's success text ("a
modal names the trip owner") both use pre-AD-1 "owner" language. AD-1 replaced the single-owner model
with `manager` (a peer rank) plus a separately-marked `isCreator` row, and explicitly allows *any*
manager — not just the creator — to remove a contributor. The spine never states whether "owner" in the
payload always means `trips.ownerId`/the `isCreator` row, or the manager who performed this specific
removal.

- **Builder A** resolves `ownerName`/`ownerEmail` from `trips.ownerId` (the `isCreator` collaborator),
  regardless of which manager triggered the removal.
- **Builder B** resolves it as "the manager who performed the removal" — a reasonable reading given AD-1
  says every non-creator manager is "a full peer" with equal removal authority, so the acting manager is
  the one the removed contributor would actually need to contact.

When a non-creator manager performs the removal, these two implementations show the removed contributor
two different names/emails to "request resharing" from — one of which may be a person who never made the
removal decision and has no context to act on the request.

**Fix:** AD-4 should state explicitly which identity `ownerName`/`ownerEmail` resolve to (recommend:
rename the fields to `creatorName`/`creatorEmail` to match AD-1's vocabulary, and confirm it's always
`trips.ownerId`, not the acting manager).

---

## Additional lower-severity notes (not expanded to full findings)

- **LOW — duplicate invitation rows for one email.** AD-2 doesn't state a uniqueness constraint on
  `invitations (tripId, email)` for `status='pending'`, nor on `collaborators (tripId, userId)`. Two
  pending invitations to the same email (e.g., a rescind/re-invite race) could both later be accepted,
  producing two `collaborators` rows for one user on one trip with no defined tie-break for which role
  `assertTripAccess()` resolves.
- **LOW — batch event fan-out granularity.** AD-9's batch can contain N role-changes/removals in one
  transaction; AD-4's event vocabulary (`membership-changed`, `membership-removed`) is singular/per-user.
  The spine doesn't say whether `saveContributorChanges` loops and publishes one event per affected user
  after commit, in staged order, or something else — worth a line so two builders don't diverge on
  publish-loop ordering relative to the `changes` array.
