---
title: "Admin Users card redesign"
type: "feature"
ticket: ""
created: "2026-10-31"
status: "built"
baseline_revision: "27883a9ee1e84df637657a87fd93ab015c78bcd7"
route: "full"
route_source: "auto"
risk: "low"
review: "quick"
review_source: "pinned"
lenses_ran: ["quick"]
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Admin Users cards bury the username, omit the display name, share the page background, always print "Setup complete", and split role into a label plus a Make/Remove admin button with a text Delete button.

**Approach:** Restyle `AppUsersList` cards like Overview `MetricRow` cards, show name under a bolder username, show a status line only for unusual states, replace the role label+button with a role dropdown that keeps `ChangeRoleDialog` confirmation, and move delete to a top-right icon button.

## Boundaries & Constraints

**Always:** Card `background: var(--bg)` with `borderColor: var(--line)`, matching `MetricRow` (check light and dark). Colors via CSS vars; icon button `size-11`, `title`, `aria-label="Delete account: <username>"`, Lucide `strokeWidth={1.5}`. Role change still routes through `ChangeRoleDialog` (same copy, same `changeUserRoleAction`, same success toast/redirect). Last completed admin: role control and delete disabled with the existing "Make another user an admin first." tooltip. Role `Select` trigger has `aria-label="Role: <username>"`, is keyboard operable (Enter/Space/arrows open, Escape closes), and focus returns to the trigger when the confirm dialog closes. Pending users (setup incomplete) keep no role control (current behavior: not promotable).

**Never:** Add a pending-password-reset status (no such state exists in `AppUserSummary`; not derived today). Change server actions, dialogs' copy, or role semantics. Touch the DB schema.

## I/O & Edge-Case Matrix

| Scenario                     | Input / State                         | Expected Output / Behavior                                                    | Error Handling                       |
| ---------------------------- | ------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------ |
| Completed user with name     | `name: "Bob B"`, setupComplete        | Bold username, name beneath, role dropdown, no status line                    | n/a                                  |
| No name                      | `name` null/empty                     | Username only, no empty line                                                  | n/a                                  |
| Pending setup                | setupComplete false, link open        | Status "Pending setup · Expires …" (or "Pending setup"/"Setup expired")       | n/a                                  |
| Select other role            | Member → Admin in dropdown            | Confirm dialog opens; dropdown still shows Member until confirmed             | Cancel/error leaves role unchanged   |
| Last completed admin         | `isLastCompletedAdmin`                | Dropdown and delete disabled, tooltip explains                                | n/a                                  |

</frozen-after-approval>

## Code Map

- `src/components/arrivo/app-users-list.tsx` -- card layout, `SetupStatus`, role button, delete trigger; main edit.
- `src/components/arrivo/metric-row.tsx` -- reference for card style (`var(--bg)` inside outer container).
- `src/components/arrivo/change-role-dialog.tsx` -- takes `children` as `DialogTrigger render`; needs controlled open mode so a dropdown selection can open it.
- `src/components/arrivo/delete-account-dialog.tsx` -- trigger is inline text `Button`; becomes icon button (keep aria-label, dialog logic).
- `src/components/ui/select.tsx` -- Base UI Select primitives (`size` default is h-9; override to `h-11`).
- `src/data/types.ts:254` `AppUserSummary` -- add `name?: string`.
- `src/lib/app-users.ts` -- select `users.name`, map to `name` (omit when blank); `toAppUserSummaries` row type.
- Tests (all exist): `src/components/arrivo/app-users-list.test.tsx`, `src/components/arrivo/change-role-dialog.test.tsx`, `src/components/arrivo/delete-account-dialog.test.tsx`, `src/lib/app-users.test.ts`.
- E2E: `tests/e2e/steps/app-users.steps.ts` (Make/Remove admin button names), `integrated-onboarding.steps.ts:126`, `unfinished-account-deletion.steps.ts:111`, `setup-link-regeneration.steps.ts:168` (assert "Setup complete" text).

## Tasks & Acceptance

**Execution:**

- [ ] `src/lib/app-users.test.ts` -- name mapped, blank/null name omitted -- tests lead
- [ ] `src/components/arrivo/app-users-list.test.tsx` -- name display, no "Setup complete", dropdown opens confirm and reverts on cancel, disabled last admin (dropdown + delete) with tooltip, icon delete in card -- tests lead
- [ ] `src/components/arrivo/change-role-dialog.test.tsx` -- controlled open/close mode, confirm and cancel paths -- tests lead
- [ ] `src/components/arrivo/delete-account-dialog.test.tsx` -- trigger is now an icon button; keep accessible name "Delete account: <username>" assertions -- tests lead
- [ ] `src/data/types.ts`, `src/lib/app-users.ts` -- add optional `name` to summary and query -- surface display name
- [ ] `src/components/arrivo/change-role-dialog.tsx` -- support controlled `open`/`onOpenChange` without a trigger; unchanged copy and action -- reuse confirmations
- [ ] `src/components/arrivo/app-users-list.tsx` -- new card (bg `var(--bg)`, prominent username, name, status only when pending/expired, role `Select` h-11, top-right delete) -- requested UI
- [ ] `src/components/arrivo/delete-account-dialog.tsx` -- icon trigger (Trash2) -- requested UI
- [ ] `tests/e2e/steps/app-users.steps.ts` -- promote/demote via role dropdown (`Role: <username>`) then dialog confirm; assert dropdown value Admin/Member -- no `.feature` edits (wording has no button names)
- [ ] `tests/e2e/steps/integrated-onboarding.steps.ts`, `unfinished-account-deletion.steps.ts`, `setup-link-regeneration.steps.ts` -- replace `toContainText("Setup complete")` with `not.toContainText("Pending setup")` -- keep E2E green

**Acceptance Criteria:**

- Given a user with a name, when Users loads, then username is the most prominent text and name appears beneath it.
- Given a completed user, when Users loads, then no "Setup complete" text shows; pending/expired users show their setup status.
- Given a member, when Admin is chosen in the dropdown, then the existing confirm dialog opens and the role changes only after confirming.
- Given the last completed admin, when Users loads, then dropdown and delete are disabled with the tooltip.
- Given any card, then delete is an icon button in the upper right with name "Delete account: <username>" and at least 44×44px.
- Given light and dark themes, then cards are visibly distinct from the outer container.

## Implementation Notes

## Plan Change Log

## Review Triage Log

| Finding | Verdict | Route | Evidence |
| --- | --- | --- | --- |
| Disabled last-admin delete lacks `var(--fg-2)` color | low | patch | Active trigger sets it; disabled copy did not. Fixed. |
| Pending member shows no role | false | rejected | Matrix specifies "Pending setup · Expires …" only. |
| `statusLine` redundant | false | rejected | Guards against rendering an empty `<p>` since `SetupStatus` returns null. |
| `chooseRole` retry toggles open popup shut | medium | patch | Retry clicked trigger with popup possibly open. Now Escapes first. |
| `not.toContainText("Pending setup")` weaker | low | rejected | Plan-prescribed; row/delete-button assertions remain positive checks. |
| Role-change error path untested | low | rejected | Select is controlled to `user.role`; unchanged by construction. |

## Design Notes

Select value is controlled to the persisted role; `onValueChange` stores a pending role and opens `ChangeRoleDialog` (controlled). Cancel/close drops pending, so the control reverts.

## Verification

**Commands:**

- `npx vitest run src/lib/app-users.test.ts src/components/arrivo/app-users-list.test.tsx src/components/arrivo/change-role-dialog.test.tsx` -- expected: pass
- `npm run test:e2e:affected` -- expected: pass

**Manual checks (if no CLI):**

- `/admin/users` in light and dark: card background differs from container.
