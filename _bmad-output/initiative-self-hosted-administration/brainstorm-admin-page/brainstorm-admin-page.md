# Self-hosted administration: brainstorming intent

User management is the organizing idea for Arrivo’s first administration release: control account entry, manage administrative authority, support account exit and recovery, and provide enough activity and instance visibility to operate a self-hosted installation.

This document records approved direction for downstream UX and specification work. It is not an implementation plan.

## Approved first-release scope

- **Bootstrap and registration:** First account created on a fresh installation becomes admin. Public signup closes after that account; subsequent accounts require an admin-issued invitation. For the existing pre-alpha installation, the sole account can become admin; no multi-account legacy selection flow is needed.
- **Invitations:** Admin supplies an email address and possibly a username, creates and copies an invitation link, and forwards it manually. Admin can rescind a pending invitation. No email integration or in-app resend action for this release.
- **User management:** Provide a user list and admin-initiated deletion. Reuse existing self-service account deletion behavior, including treatment of owned and shared trips. Consult that behavior during design rather than defining a separate admin deletion policy.
- **Admin management:** Support promotion and demotion, with protection against deleting or demoting the last admin.
- **Account recovery:** Support manually shared password-reset links and emergency server-side CLI recovery for admins.
- **Activity audit log:** Provide admin-visible events covering login/logout, trip creation/modification, invitation creation/acceptance, password changes, and username changes. Keep this scoped to user activity; broader application logging is a separate future effort.
- **Instance overview:** Include version, database and document-storage health, user/admin/pending-invitation counts, trip/document counts, storage usage, and recent admin actions and failed logins.

## Access and privacy boundaries

Admin status does not grant access to every trip or its contents. Existing trip sharing permissions remain authoritative.

For trips outside an admin’s sharing access, the user **provisionally accepted** audit metadata limited to actor, action, timestamp, and trip ID. Omit trip titles, destinations, and changed values. Preserve this provisional status through design rather than treating it as a settled privacy contract.

Server operators are trusted authorities for emergency recovery. CLI recovery is gated by deployment or database access; there must be no unauthenticated web recovery bypass.

## Deferred and unselected ideas

Explicitly deferred: email integration, broader diagnostic logging, account suspension, quotas, and backup integration.

Instance controls such as registration/upload-limit settings were suggested but not selected. Offline recovery codes and temporary recovery mode were coach alternatives, not accepted first-release requirements. Backup status was discussed only as a possible later addition if Arrivo can reliably observe it.

## Material open design questions

- Is username part of invitation creation, or left to the invited person?
- What exact CLI recovery interaction should ship? The user approved CLI recovery and its trust boundary, but did not choose between a CLI-generated reset link and an interactive password-setting command. Short-lived, single-use links, session revocation, and recovery audit events were coach recommendations, not separately confirmed decisions.
- Confirm the provisional private-trip audit metadata boundary and define the remaining audit event details. Coach suggestions such as outcome fields and affected-resource presentation were not independently approved.
