# UX input reconciliation

Reviewed draft architecture spine against final EXPERIENCE.md, DESIGN.md, and UX decision log, with architecture coaching overrides supplied by user taking precedence.

Verdict: core UX outcomes survive. Two lifecycle seams need explicit wording before finalization; no additional screen design or implementation plan needed.

## High — Preserve explicit wrong-account sign-out boundary

EXPERIENCE.md registration-form contract, account-setup state, and voice rules require an already signed-in different account to use explicit Sign out and continue, followed by link revalidation. AD-3 admits setup context and permits ordinary authentication on completion but never binds existing-session handling. A setup-route builder could silently replace current session while lifecycle service correctly consumes the target account's token.

Fix: add to AD-3 that signed-in account differing from setup target cannot exchange/complete setup or switch session until explicit sign-out; preserve link through sign-out and revalidate before continuing. Do not let setup's eventual authentication replace another account silently.

## Medium — Make setup authorization inapplicable after account completion

EXPERIENCE.md regeneration state says setup completed or account deleted meanwhile requires refreshed state, with no duplicate/restored account. AD-3 requires atomic completion and AD-4 consumes successful token, but issuance contract does not explicitly reject setup issuance/regeneration for completed account. A regeneration builder could invalidate or generate unusable setup authorizations for completed accounts rather than reconcile current state.

Fix: state that setup issuance/regeneration requires account still unfinished under the same account lock; completion invalidates all setup contexts; expired links preserve unfinished account. Reset paths must not become an alternate first-time setup transition.

## Confirmed coverage

- In-app admin screen, shared account menu, Overview/Users/Activity sections and responsive UI remain governed by final UX references rather than redocumented.
- Bootstrap, sole-account upgrade, current admin authority, independent trip permissions, last-admin guard and unfinished-account promotion restriction land in AD-1/2.
- Immediate account creation, ID binding, resumable setup-only gate, single-use completion, and separate trip invitations land in AD-3/4.
- One-hour reset/recovery, preserved ordinary MFA, atomic CLI replacement, retired/replaced recovery codes, session/trusted-device revocation and cross-purpose invalidation land in AD-4/5/6.
- Role-tier/oldest-membership succession, deterministic tie-break, self-service choices, stale review and post-commit cleanup land in AD-7.
- Informational no-block Activity, summary-only storage, historical usernames, minimal trip metadata, no source IP, and tolerant opportunistic retention land in AD-8 through AD-11 and correctly override earlier UX details.
- Overview privacy, independent freshness/failure, storage boundary and operational envelope land in AD-1/12.

No blocking visual, tone, accessibility, or navigation requirement was dropped: final DESIGN.md/EXPERIENCE.md stay explicitly binding. Event catalog remains in EXPERIENCE.md Activity Rules; downstream specifications must use that catalog and not infer event coverage solely from AD-8's examples.
