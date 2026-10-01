# Rubric Walker Review — trip-contributors Architecture Spine

**Verdict:** Solid, well-grounded spine (verified nodemailer versions, correctly ratifies `assertTripAccess`/server-action/`globalThis` conventions) but it has two capability-breaking gaps — the dashboard-level live-removal requirement (CAP-9) and the status-bar offline indicator (CAP-8) — plus one under-specified security-critical mechanism (viewer field-omission), so it should not pass as-is.

---

## Critical

### C-1 — CAP-9's dashboard/shared-trip-list live update has no mechanism at all

SPEC CAP-9 success criterion: *"The trip disappears at once from the removed contributor's dashboard/shared-trip list"* — this is explicitly **not** limited to the case where the contributor is actively viewing the trip. But AD-4's SSE channel is scoped per-trip: `GET /api/trips/[tripId]/events`, and every description of its use (design paradigm, mermaid diagram, Capability→Architecture Map row for CAP-9) only covers a client already inside that trip's page. The dashboard (`src/app/(app)/trips/page.tsx`, confirmed to exist and to be a plain list) has no subscription in the Structural Seed, no event route, and no described mechanism to learn a trip vanished from someone's shared list while they're sitting on `/trips` instead of `/trips/[tripId]`.

Two implementers would diverge hard here: one might silently ship "modal only, dashboard just goes stale until next reload" (violating CAP-9's actual success bar), another might invent a second, undocumented SSE endpoint (e.g., a per-user "membership events" stream) with no architectural guidance on shape, auth gate, or fan-out registration key.

**Fix:** Either (a) add an AD establishing a per-user (not per-trip) SSE/notification channel the dashboard subscribes to — decide its route, its `trip-events.ts` fan-out key (would need a `userId`-keyed subscriber set alongside the `tripId`-keyed one, since AD-5's `Map<tripId, Set<callback>>` can't answer "which users are on this trip" without a reverse lookup), and how `membership-removed` reaches it; or (b) explicitly scope CAP-9 down to "immediate revocation while actively viewing; dashboard reflects it on next navigation/poll" and flag the stronger reading as a spec deviation requiring product sign-off. Silently building to the SSE-per-trip mechanism as decided today does not satisfy CAP-9 as written.

### C-2 — CAP-8's status-bar offline indicator has no home; no such surface exists in the codebase

AD-4 says the client's `EventSource.onerror`/reconnect-backoff state "drives the status-bar offline indicator (CAP-8)," as if a status bar already exists. It doesn't: `Grep` for `status-bar`/`StatusBar`/`offline` across `src/components/packt` and `src` returns nothing. There's no global chrome/footer/status region in the app today. The Structural Seed lists `trip-share-dialog.tsx` and `contributor-revocation-modal.tsx` as new components but names no offline-indicator component, no layout change, and no decision about scope (global app-wide indicator in `layout.tsx`, or per-trip-page-only).

This is a real divergence point: is it a new persistent element in `(app)` layout, or scoped to the trip page only (in which case it can't indicate offline status while browsing the dashboard, compounding C-1)? Whoever implements this has to invent the surface from scratch with zero guidance, which is exactly what a spine at this altitude exists to prevent.

**Fix:** Add the offline-indicator component to the Structural Seed (e.g., `src/components/packt/trip-sync-status.tsx`), state where it mounts (global layout vs. trip page), and add an AD rule (or extend AD-4) fixing that decision — since it's directly downstream of the same open question in C-1 about per-trip vs. per-user connection scope.

---

## High

### H-1 — AD-8's viewer field-omission mechanism is asserted as "no new enforcement," but the actual plumbing doesn't exist yet and isn't specified

Verified against the current code: `getTripDetail(tripId, userId)` in `src/lib/queries.ts` calls `assertTripAccess(tripId, userId)` purely as a pass/`notFound()` gate — it never retrieves or returns the caller's *resolved role*, and `db-mappers.ts`'s `dbTripToType()` maps `budget` unconditionally with no role parameter anywhere in its signature. A codebase-wide grep for `role === "viewer"` / `isViewer` / `CollaboratorRole.Viewer` returns zero hits — there is no existing viewer-gating logic anywhere, UI-only or otherwise, to "continue." AD-8's framing ("No new enforcement layer... already the sole place DB rows become Trip/Budget types") is accurate about file *location* but implies the *filtering behavior* is an extension of something existing, when it is entirely new logic that has to be authored, and the spine doesn't specify how the resolved role reaches `db-mappers.ts` from `queries.ts` — via a second query, via changing `assertTripAccess` to return the matched role instead of just gating, or via a separate `getCollaboratorRole()` call. For a security-load-bearing capability (CAP-3's server-enforced budget hiding), leaving this mechanism unfixed invites three different implementations with three different risk profiles (e.g., a second un-gated query racing the first, or forgetting to thread role through a payload object with a dozen call sites).

**Fix:** Add a rule (or extend AD-8) specifying exactly how the resolved role is obtained and threaded: e.g., "`assertTripAccess()` is extended to return the matched role rank (not just gate/reject); `getTripDetail` captures it and passes it to `dbTripToType(trip, { viewerRole })`, which strips `budget`/`budgetTotal`/`budgetPerPerson` and the expenses list when `viewerRole === 'viewer'`." Pin down the signature change so it's not left to the story author.

### H-2 — AD-7's "mismatched email" branch conflates two different real-world flows with different UX/security implications

AD-7 routes both "no session" and "signed-in session, mismatched email" into the same treatment: *"route into sign-up/sign-in pre-filled with (and locked to) the invited email."* But CAP-2's success criterion is that the link "is **rejected**" when opened from a different account — a stronger statement than "prompted to sign in again." If a user is already authenticated as `alice@example.com` and opens a link addressed to `bob@example.com`, redirecting them to a sign-in form implies either (a) silently keeping Alice's session and showing a form she can't productively use (since it's locked to Bob's email but she's already logged in — does the app force sign-out first, or does the sign-in form coexist with an active session?), or (b) something the rule doesn't actually describe. This is a real fork two implementers would resolve differently — one might force a sign-out before showing the locked sign-in form, another might show an explicit "you're signed in as the wrong account" rejection message per CAP-2's literal wording, with no path back into the flow.

**Fix:** Split AD-7's rule into three explicit branches: no session → sign-up/sign-in locked to invited email; matching session → immediate accept; **mismatched authenticated session → explicit rejection state naming both the invited email and the currently-signed-in email**, with an explicit "sign out and continue" affordance if the intent is to let them switch accounts. Don't let "mismatched" quietly share a branch with "no session."

---

## Medium

### M-1 — Re-inviting an email that already has a pending invitation is undefined

AD-2 defines `resendInvitation()` for reissuing a token, but nothing specifies what happens when a manager uses the *primary invite flow* (CAP-1, entering an email in the share dialog) for an email that already has a `status='pending'` row for that trip. Does `contributor-actions.ts` detect the existing pending row and treat it as a resend (update in place), insert a second `invitations` row (no unique constraint on `(tripId, email, status='pending')` is specified, unlike the existing `collaborators` table's `unique(tripId, email)`), or reject the second invite outright? All three are plausible readings of CAP-1 and CAP-6 and would produce different DB states.

**Fix:** State explicitly whether `invitations` gets a partial unique index on `(tripId, email) WHERE status = 'pending'`, and whether the invite action upserts (treating a duplicate submit as an implicit resend) or errors.

### M-2 — Design Paradigm's "every mutation... publishes a change event" is broader than AD-4's enumerated event types

The Design Paradigm section states the side-channel activates "after a mutation commits" for "every mutation," but AD-4's Rule only enumerates three `type` values: `itinerary-changed`, `membership-changed`, `membership-removed`. Budget/expense mutations (CAP-4, editor-only) aren't named — it's unclear whether they're folded into `itinerary-changed` as a catch-all, or don't publish an event at all (in which case the Design Paradigm's "every mutation" claim overstates scope, and CAP-8's live-sync guarantee wouldn't actually cover budget edits made by an editor, which might be a legitimate reading since CAP-8's own capability text doesn't list budget among the synced fields — but the internal inconsistency between sections should still be resolved).

**Fix:** Either explicitly fold budget/expense writes into `itinerary-changed`, or state that budget mutations are out of scope for the live-sync side-channel (matching CAP-8's literal wording), and adjust the Design Paradigm sentence to match rather than claiming "every mutation."

## Low

### L-1 — `CollaboratorRole` in `src/data/types.ts` isn't named as a binds target for AD-1

Project convention ("All domain types live exclusively in `src/data/types.ts`") means the existing `CollaboratorRole = { Owner, Editor, Viewer }` const-object/union pair must change to `{ Manager, Editor, Viewer }` alongside the DB enum and `assertTripAccess()` change AD-1 already covers. AD-1's binds list names `collaborators.role`, `assertTripAccess()`, call sites, and `trip-edit-collaborators.tsx`, but not `src/data/types.ts` itself — a small omission given the project's single-source-of-truth-for-types rule, but easy to catch at implementation time since TypeScript will fail to compile without it.

**Fix:** Add `src/data/types.ts`'s `CollaboratorRole` to AD-1's binds list for completeness.

### L-2 — New SMTP env vars aren't tied to `.env.example` / deployment docs

AD-6 introduces `SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM` (plus `EMAIL_STUB`). The project has an established, recent precedent (commits `3d9f960`, `2d1b6b6`) of documenting every new env var in `.env.example` and a deployment guide when adding an external-I/O adapter (see the storage-adapter spine's deployment mermaid diagram and its own env vars). This spine doesn't mention updating `.env.example` or deployment docs for the new SMTP vars. Likely below this altitude's required detail, but worth an explicit one-line acknowledgment given the fresh precedent.

**Fix:** Add a line to the Consistency Conventions "Test environment" row's sibling concern, or Deferred, noting `.env.example` and deploy-doc updates as an implementation-time task (not an architectural decision).
