- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-invite-an-existing-packt-user-to-a-trip.md`
  summary: Add an index on `invitations.email` alone (the current partial unique index only covers `(tripId, email)` where `status = 'pending'`).
  evidence: Story 1.3 needs `getMyPendingInvitations` (per `src/lib/invitations.ts`'s design note) to look up invitations by invitee email across trips; without a standalone email index that query will full-scan the table.
