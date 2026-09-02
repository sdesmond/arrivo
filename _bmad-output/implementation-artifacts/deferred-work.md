- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-invite-an-existing-packt-user-to-a-trip.md`
  summary: Add an index on `invitations.email` alone (the current partial unique index only covers `(tripId, email)` where `status = 'pending'`).
  evidence: Story 1.3 needs `getMyPendingInvitations` (per `src/lib/invitations.ts`'s design note) to look up invitations by invitee email across trips; without a standalone email index that query will full-scan the table.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-3-manager-has-full-trip-control.md`
  summary: Wire `trip-edit-sheet.tsx`'s People section to real collaborator data and server actions — it doesn't hydrate a shared trip's existing collaborators (`TripEditCollaborators` renders "No collaborators yet" for a seeded shared trip), and its `removeCollaborator`/`updateCollaboratorRole`/`addCollaborator` handlers only mutate local draft state, never calling the real `removeCollaborator`/`updateCollaboratorRole`/`addCollaborator` server actions in `actions.ts`.
  evidence: Discovered via live-browser E2E testing while implementing story 2.3 (`isCreator` creator-seat protection) — the pre-existing gap made it impossible to exercise the creator-lock UI end-to-end, so that story shipped with unit/component coverage only. Likely best addressed alongside epic 3's share dialog work, which replaces this inline list per DESIGN.md.

## Deferred from: code review of spec-2-3-manager-has-full-trip-control (2026-09-02)

- Validate collaborator role at the Server Action boundary in `src/app/(app)/trips/actions.ts:928`: `updateCollaboratorRole` receives runtime input without the existing `isCollaboratorRole` check, while `collaborators.role` is unconstrained text. A crafted request can persist an invalid role. Pre-existing issue outside this creator-seat change.

## Deferred from: code review of spec-2-4-viewer-s-shared-trips-are-excluded-from-personal-expense-rep (2026-09-02)

- Duplicate collaborator rows for the same trip+user could yield duplicate trip entries in `listExpensesForUserInRange`: the `innerJoin` matches on `eq(collaborators.tripId, trips.id)` + `eq(collaborators.userId, userId)`, but the table's unique constraint is on `(tripId, email)`, not `(tripId, userId)` — so two collaborator rows with different emails but the same linked `userId` on one trip would both match the join. Pre-existing join shape, unrelated to this story's `ne(role, "viewer")` addition. `src/lib/queries.ts:257`.
