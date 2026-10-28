# First-run admin setup

Date: 2026-10-27. Status: approved in conversation; implementation authorized.

## Issue summary

Fresh installations advertise ordinary signup without explaining that the first account becomes instance admin. After initialization, the signup page still renders even though its action refuses creation. Operator requested an explicit welcome screen with Username, Name, Password and Confirm password, followed by removal of signup access.

## Impact analysis

CAP-1 and completed Instance foundation need one follow-up story. Architecture AD-2 retains durable initialization and transactional concurrency; pages gain eligibility checks. EXPERIENCE Flow 1, bootstrap states and navigation change; DESIGN gains first-run form composition. Account onboarding must use a separate route for later users' password setup. Initiative acceptance and self-hosting instructions adopt the welcome flow. No schema, infrastructure, recovery or Activity model change is required.

## Recommended approach

Direct adjustment: one small foundation follow-up before account onboarding. Moderate routing/test risk; timeline increases by one story. Retain existing bootstrap transaction and first-admin Activity. Rollback and MVP reduction add no value because the account lifecycle already enforces closure correctly.

## Approved changes

- CAP-1, old: first signup becomes admin and later submissions are refused. New: fresh entry automatically reaches `/setup`, first admin creation closes setup permanently, and later setup/signup visits redirect to sign-in.
- UX, old: ordinary signup asks Name, Username and Password and sign-in advertises signup. New: heading “Welcome to Arrivo!”, description “Let's get your admin account set up.”, required Username, Name, Password, Confirm password, and “Create admin account”. Success signs in to Trips. Sign-in has no signup link.
- Routing, old: `/sign-up` always renders a form. New: fresh `/sign-up` redirects to `/setup`; initialized `/setup` and `/sign-up` redirect to `/sign-in`. Eligibility is checked server-side on each request. Missing state fails closed; DB failures never open setup.
- Validation, old: no password confirmation. New: require matching confirmation on server. Stale submissions receive “Setup is already complete. Sign in to continue.” and cannot create another account.
- Backlog, old: foundation bootstrap stories completed. New: add First-run admin setup follow-up without rewriting their historical plans. Reserve `/setup` for instance initialization; later user setup links use another route.

## Handoff and success criteria

Minor scope: Developer implements foundation follow-up with tests first and plan-reviewer gate. Product planning records CAP-1, architecture and UX changes. Verify fresh entry, required fields and mismatch, desktop/mobile success, initialized redirects, absent signup links, stale submission refusal, exactly-one-admin concurrency, and retained Activity behavior. Run targeted tests followed by build-validator's affected E2E gate. No migration or operator configuration change expected.

User approved both incremental edit groups and complete proposal, then requested implementation. Work runs on `ticket/first-run-admin-setup`; existing local documentation changes are preserved.
