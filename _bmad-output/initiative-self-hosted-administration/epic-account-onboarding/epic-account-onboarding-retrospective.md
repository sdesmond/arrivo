---
epic: epic-account-onboarding
date: 2026-10-28
verdict: accepted-with-open-items
criteria: declared
headless: false
---

# Retrospective: Account onboarding

## Epic summary

Epic 3, `epic-account-onboarding`, covers CAP-2 and CAP-3. Ten tickets. `tickets.py status` shows nine at `status: built`, `state: review`, and 3.2 at `status: in-progress`, so `pending_tickets` is `["3.2"]`.

**Unfinished ticket the user accepted retro-ing over:** 3.2 Setup-only context tracer. The user stated "3.2 is built". The evidence agrees on delivery: PR #353 merged (`bfe44407`) and `1587a38d` "record built plan". The ticket tree does not: `story-setup-only-context-tracer-plan.md` still has `status: in-progress`, `lenses_ran: []`, unchecked tasks, and empty Implementation Notes and Review Triage Log. The machine verdict is therefore **rejected**; the verdict above rests on the user's statement and is conditional on action item A1.

Tickets still at `built` (not yet `done`): 3.1, 3.3 through 3.10.

| Ref  | Ticket                                     | Risk (plan)              | Lenses run | Range                                      |
| ---- | ------------------------------------------ | ------------------------ | ---------- | ------------------------------------------ |
| 3.1  | Credential-authorization schema and module | high                     | quick      | `7efde8ac..97fbaa06` (5 commits, 15 files) |
| 3.2  | Setup-only context tracer                  | high                     | none       | `97fbaa06..bfe44407` (5, 16)               |
| 3.3  | Add User service and action                | high                     | quick      | `bfe44407..c439312b` (4, 18)               |
| 3.4  | Add User dialog and result                 | medium                   | quick      | `c439312b..96aed98e` (2, 9)                |
| 3.5  | Setup completion                           | high                     | quick      | `96aed98e..7cc64019` (4, 18)               |
| 3.6  | Regenerate link and expired state          | high (entry says medium) | quick      | `7cc64019..2cc27386` (1, 19)               |
| 3.7  | Delete unfinished account                  | high                     | quick      | `2cc27386..6780010a` (7, 16)               |
| 3.8  | Wrong signed-in account                    | medium                   | quick      | `6780010a..a2f79ac5` (3, 13)               |
| 3.9  | Refactor sweep                             | low                      | quick      | `a2f79ac5..1d384bf5` (2, 9)                |
| 3.10 | Integrated onboarding E2E suite            | low                      | quick      | `1d384bf5..HEAD` (5, 15), end inferred     |

Ranges come from each plan's `baseline_revision`, ordered by history. `git_evidence.py` ran once per range. `binary_revisions` was empty everywhere. Merge measurement was complete except 3.7 (3 merges, 2 measured) and 3.10 (2, 1).

**Evidence inventory.** Available: epic file with declared Done when, ten plans, `tickets.toml`, diff ranges, previous retro (`epic-activity-and-retention`). Missing: session logs (process-lesson analysis skipped). Not run: dependency-graph tool and `bmad-review` (see Findings, narrowed scope).

## Findings

### F1. 3.2, the isolation ticket, was never reviewed (fix now)

3.2 is `risk: high`, entry 2 pins review `authority-locking`, and it carries Done when 1. Its plan shows no review: `story-setup-only-context-tracer-plan.md:11-13` (`review: ""`, `lenses_ran: []`), and the Review Triage Log and Implementation Notes sections are empty (lines 60-90). Every other ticket records a "Review pass" block. The code did merge: `74683152`, `2bd701a9`, `d83996dc`, `bfe44407`.

Mitigation observed: I read the boundary by hand (`src/proxy.ts`, `src/lib/account-setup-session.ts`, `src/app/account-setup/actions.ts`, `src/app/(app)/admin/users/actions.ts`) and found no defect. The proxy allowlists `/account-setup`, the cookie is not an Auth.js session so protected paths redirect, and each request revalidates the token by digest. This is not a substitute for the lens.

**Update, 2026-10-28:** review run after the fact (A1 done). Result recorded in the 3.2 plan's Review Triage Log: 0 high, 1 medium (setup cookie is `Path=/`, so the raw token rides on every same-origin request), 4 low. No locking or authority defect; the throttle writes serialize and the setup cookie reaches no app surface. The medium finding is deferred to a follow-up ticket. F1 is closed; 3.2 still needs marking `built` through `bmad-ticket`.

### F2. The `authority-locking` pin did not reach the build (fix now, process)

Added finding from the A1 run: `authority-locking` is not a lens in the installed `bmad-review` (its lenses are adversarial, edge-case-hunter, verification-gap, structure, prose). A pin naming it has nothing to select, which is a likely cause here.

The previous retro's A1 asked for a stronger-than-`quick` lens on high-risk locking/authority tickets, placed in entry `notes`. The notes were written (entries 1, 2, 3, 5, 7: `tickets.toml`). No plan ran it: every reviewed plan has `review: 'quick'`, `review_source: 'pinned'`, `lenses_ran: [quick]` (3.1, 3.3, 3.5, 3.7 are high risk). The plans only mention the lens in prose (`story-setup-completion-plan.md:100`, `story-credential-authorization-schema-and-module-plan.md:99`). Likely cause: the note is free text and the build reads the `review:` frontmatter pin, but I did not verify the mechanism.

Related: 3.6's plan says `risk: high` while its ticket entry says `medium` and carries no review pin, so the pinning rule skipped it.

### F3. Minimum password length lives in three places (fixed 2026-10-28, low)

Fixed: `auth-forms.tsx` and `profile/actions.ts` now use `PASSWORD_MIN_LENGTH`; boundary test added in `src/app/(app)/profile/actions.test.ts`. Complexity rules are deferred to an ad hoc story between this epic and the next. Original finding:

`src/lib/password-policy.ts:1` (`PASSWORD_MIN_LENGTH`), a literal `8` at `src/components/arrivo/auth-forms.tsx:152`, and a literal `8` at `src/app/(app)/profile/actions.ts:237`. This is the residue of 3.5's open `unknown` (which shared policy applies); the plan left profile `changePassword` untouched. Not a defect today, but the rules can drift.

### F4. 3.5 retry patch was not re-run in E2E when built (accepted, resolved)

`story-setup-completion-plan.md` Auto Run Result: "patch not re-run in E2E". That plan also ran the full E2E suite where the project rule is the affected subset. Closed: the seven onboarding features pass at HEAD in this run (see Behavior verification).

### Aggregate views

- **Duplication.** Add User and Regenerate each carried their own setup-link result panel; 3.9 consolidated them (`4b00cb35`, `src/components/arrivo/setup-link-result.tsx`, `add-user-dialog.tsx` -35 lines, `regenerate-setup-link-dialog.tsx` -34). Resolved in-epic. Password min length: see F3.
- **Size growth.** Top five files by churn in each range were inspected. No source file grew past about 225 lines (`credential-authorizations.ts` 223, `account-creation.ts` 115); the largest additions are test and step files (`setup-link-regeneration.steps.ts` 320, `integrated-onboarding.steps.ts` 278). Checked clean for god-class growth.
- **Architecture delta (narrowed, inline).** No dependency tool was run. From the changed files: new server modules import `server-only` where they touch the DB (`account-setup-session.ts:1`); the client dialog imports only `password-policy`, which is client-safe. No layering violation found.
- **Pattern divergence.** None found beyond F3. Server actions follow the `requireAdmin()` then service then `revalidatePath` then `recordActivity` order.
- **Spec-to-implementation.** See Acceptance verdict; each Done-when item traced.

### Diff-scope review (narrowed)

`bmad-review` was not run on the full epic diff. Only the isolation boundary was hand-reviewed (F1). A full lens pass over the cross-ticket boundaries (3.3/3.5/3.6/3.7 locking) remains available and is recommended with A2.

## Behavior verification

- Vitest over the epic's files: 14 files, 221 tests passed.
- Playwright, `@feat:` credential-authorizations, account-setup, account-creation, add-user-dialog, setup-link-regeneration, unfinished-account-deletion, integrated-onboarding: 60 passed, exit 0, against `arrivo_e2e`.
- Isolation scenarios observed: cookie-only requests to `/trips`, `/api/storage/x.jpg`, `/api/users/me/events` redirect (`account-setup.feature:22-32`); a captured server action, stored file and both feeds refuse (`integrated-onboarding.feature:20-25`).

## Previous-retro follow-through

Previous: `epic-activity-and-retention`.

- A1 pin a stronger lens at slicing (owner: slicer of this epic). Notes written, effect not landed. See F2.
- A2 optional throttle or pre-check for expired rows (owner: maintainer). No evidence found; optional, load not observed.
- A3 add `import "server-only"` to `activity-maintenance.ts` (and `activity-retention.ts` if no client importer) (owner: next ticket touching Activity). Not landed: neither file begins with the import (`src/lib/activity-maintenance.ts` lines 1-3 checked; grep for `server-only` in both returned nothing). No client importer of either file found in `src/components`.
- A4 mark the 2.2 admin-view item in `deferred-work.md` resolved (owner: maintainer). Not landed: the item is still listed (`deferred-work.md:3-4`).
- A5 move 2.1-2.10 to `done` (owner: user). Landed: `tickets.py status` counts 10 done.

## Action items

Proposed, not applied.

- A1. DONE 2026-10-28 (review run, plan updated). Remaining: mark 3.2 `built` through `bmad-ticket`. Original text: run `authority-locking` (or the strongest available lens) over 3.2's range `97fbaa06..bfe44407`, fill the plan's Review Triage Log, then mark 3.2 `built`. Owner: user or developer. Closes F1.
- A2. Find why the entry-notes pin did not set the review lens, and fix the pin path (or put the pin where the build reads it) before epic 4 is sliced; reconcile 3.6's risk (plan high, entry medium). Owner: whoever maintains the ticket/build skills. Closes F2.
- A3. When epic 4 builds its first high-risk ticket, check the plan's `lenses_ran` before accepting. Owner: user. Closes F2 prevention.
- A4. DONE 2026-10-28: `PASSWORD_MIN_LENGTH` used in `auth-forms.tsx` and `profile/actions.ts`. Follow-up: password complexity rules as an ad hoc story between this epic and the next (user decision).
- A4b. DONE 2026-10-28 for three of the six 3.2 review findings: setup cookie narrowed to `Path=/account-setup`, dead `readAccountSetupToken` removed, `PUBLIC_PATHS` matches exact or sub-path only. Not fixed, by user decision: the throttle-budget exhaustion and the per-IP throttle that is skipped without a forwarded IP (both deferred), and the token in the link query string (accepted).
- A5. Carry over the open items from epic 2: A3 (`server-only` imports) and A4 (`deferred-work.md` entry). Owner: as before.
- A6. After A1, close the epic and move 3.1 through 3.10 to `done` via `bmad-ticket`. Owner: user.

## Decision records

One candidate proposed, awaiting the user's approval; none written. "Setup token is held raw in an HttpOnly cookie and revalidated by digest on every request, so replacement, expiry and deletion revoke instantly." Source: `story-setup-only-context-tracer-plan.md` Design Notes, commits `74683152`, `2bd701a9`. Hard to reverse and a real trade-off (no cookie-side state versus holding the raw token); no existing ADR in `docs/decisions/` covers it. The plan gives the reason; no session log exists to add more.

## Acceptance verdict

**accepted-with-open-items**, criteria declared. Machine verdict **rejected** because `pending_tickets` is `["3.2"]`; the user stated 3.2 is built, which overrides it, but its plan and review record are incomplete (F1, A1).

Done when:

1. Setup-only isolation (routes, actions, storage reads, live subscriptions): met. `account-setup.feature:22-32`, `integrated-onboarding.feature:20-25`; passing at HEAD.
2. Regeneration, expiry, resume, delete per CAP-3: met. `setup-link-regeneration.feature`, `unfinished-account-deletion.feature`, `account-setup.feature:109` (resume), `integrated-onboarding.feature:27,36`.
3. Wrong signed-in account requires explicit sign-out: met. `account-setup.feature:134-165`; `signOutAndContinueSetupAction` in `src/app/account-setup/actions.ts:103`.
4. Events through the Activity recording API: met. `recordActivity` for AccountCreated, SetupLinkGenerated, SetupLinkRegenerated, PendingAccountDeleted (`src/app/(app)/admin/users/actions.ts:47,70,99,100`) and SetupCompleted (`src/app/account-setup/actions.ts:72`).

Open items: F1, F2 (blocking for a clean accept until A1 lands), F3.

## Open questions

- Does the user want the 3.2 review run before the epic is closed, or accept the hand-read in F1 and close now?
- Which part of the build reads the review pin (A2)? A person who knows the skill can answer this faster than I can.
