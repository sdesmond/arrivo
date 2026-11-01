---
title: "Account menu and Manage instance shell"
type: "feature"
ticket: "2"
created: "2026-10-24"
status: done
baseline_revision: "b72df87818efc3c1e8b71cf62c9abb635b3bd4a8"
route: "full"
route_source: "auto"
risk: "medium"
review: "quick"
review_source: "pinned"
lenses_ran: [quick]
review_loop_iteration: 0
context:
  - "{project-root}/_bmad-output/initiative-self-hosted-administration/ux-self-hosted-administration/EXPERIENCE.md"
---

<!-- prettier-ignore-start -->

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Admins have no way into instance management, and the sidebar has a standalone sign-out icon the UX replaces with one shared account menu.

**Approach:** One account menu (Settings, Log out, admin-only Manage instance) opened from the desktop sidebar account control and the mobile Profile tab, plus an `/admin` shell whose authority is rechecked against the DB on every request.

## Boundaries & Constraints

**Always:** `requireAdmin()` reads current `users.role` from the DB (AD-1), never the session/JWT; denied access calls `notFound()`. Use the existing `DropdownMenu` primitive. Admin check lives in `src/lib/` with a colocated test.

**Never:** No Overview/Activity/Add User content; `/admin` only enables the Users section (later epics add sections). No standalone Log out button or Back-to-settings link. Admin role grants no trip access.

## I/O & Edge-Case Matrix

| Scenario              | Input / State                | Expected Output / Behavior                                      | Error Handling         |
| --------------------- | ---------------------------- | --------------------------------------------------------------- | ---------------------- |
| Admin opens menu      | role `admin`                 | Settings, Manage instance, Log out; Manage instance → `/admin`  | No error expected      |
| Member opens menu     | role `member`                | Settings, Log out only                                          | No error expected      |
| Member visits `/admin` | role `member`               | `notFound()`                                                    | 404                    |
| Demoted mid-session   | stale tab, role now `member` | Next `/admin` request 404s; menu drops entry on next navigation | `notFound()`           |
| Mobile Profile tab    | any user                     | Opens the menu instead of navigating to `/profile`              | No error expected      |

</frozen-after-approval>

<!-- prettier-ignore-end -->

## Code Map

- `src/lib/auth-helpers.ts` -- add `requireAdmin()` (server-only; coverage-excluded) wrapping the new lib check.
- `src/lib/instance-roles.ts` (new) -- `isInstanceAdmin(userId)` DB read of `users.role`; colocated test.
- `src/app/(app)/layout.tsx` -- compute `isAdmin` once per request, pass to `SidebarNav` and `BottomTabBar`.
- `src/components/arrivo/sidebar-nav.tsx` -- footer account control becomes menu trigger; remove sign-out form/`LogOut` button.
- `src/components/arrivo/bottom-tab-bar.tsx` -- Profile tab becomes a menu trigger (button), others stay links.
- `src/components/arrivo/account-menu.tsx` (new, `"use client"`, `AccountMenuProps { isAdmin; trigger; side }`) -- shared `DropdownMenu`; Log out posts `signOutAction`.
- `src/app/api/users/me/instance-role/route.ts` (new) -- authenticated, uncached role refresh for menu navigation; colocated route tests. Replaces the intermediate server-action transport to prevent router-state rollback.
- `src/components/arrivo/admin-section-nav.tsx` (new, `"use client"`, `AdminSectionNavProps`) -- active-section nav; only Users enabled.
- `src/app/(app)/admin/layout.tsx` + `page.tsx` (new) -- `requireAdmin()`, renders `AdminSectionNav`; `/admin` redirects to `/admin/users`.
- `tests/e2e/steps/profile.steps.ts` -- lines 16, 50, 72 select `a[href="/profile"][aria-label="View profile"]`; that link goes away, so they must open the menu and choose Settings, and read the name/username from the trigger.
- `src/app/(app)/admin/users/page.tsx` (new) -- placeholder panel for story 1.4.
- `tests/e2e/e2e-seed-data.ts`, `tests/e2e/scenario-fixture.ts` -- `role` on `UserSeed`, honored when materializing.
- `tests/e2e/feature-map.mjs` -- register `account-menu` feature; `sidebar-nav.tsx` is in `SHARED_GLOBS`, so touching it runs the full suite.
- Reuse the profile page's section-nav look (`profile/page-client.tsx`); do not change profile behavior.

## Tasks & Acceptance

**Execution:**

- [x] `src/lib/instance-roles.test.ts`, `account-menu.test.tsx`, `admin-section-nav.test.tsx`, `sidebar-nav.test.tsx`, `bottom-tab-bar.test.tsx` -- write failing tests first: admin vs member items, Log out submits, Profile tab opens menu, Users active state; rely on the global `next/navigation` mock (drop the existing per-file mock in `bottom-tab-bar.test.tsx` only if it still passes) -- tests precede code
- [x] `src/lib/instance-roles.ts`, `src/lib/auth-helpers.ts` -- `isInstanceAdmin`, `requireAdmin` -- AD-1 authority
- [x] `src/components/arrivo/account-menu.tsx`, `sidebar-nav.tsx`, `bottom-tab-bar.tsx`, `src/app/(app)/layout.tsx` -- menu and wiring; 44px targets -- CAP-11
- [x] `src/app/(app)/admin/**` -- shell, Users-only nav, `/admin` → `/admin/users` -- shell
- [x] `tests/e2e/features/account-menu.feature`, `steps/account-menu.steps.ts`, seed/fixture role support, `feature-map.mjs` -- admin reaches `/admin`; member has no entry and gets 404
- [x] `tests/e2e/steps/auth.steps.ts` (lines 24, 85) and `profile.steps.ts` -- "Sign out" button becomes menu item "Log out"; `View profile` link becomes menu item Settings -- standalone controls removed

**Acceptance Criteria:**

- Given a fresh install, when the first account opens the menu and chooses Manage instance, then it lands on `/admin/users`.
- Given a non-admin, when they open the menu or request `/admin`, then no entry shows and the route 404s.
- Given an admin demoted in another session, when they request `/admin`, then it 404s.

## Implementation Notes

- Pre-implementation plan review (scope, architecture, components, accessibility, tests): no blocking scope or component issues. Existing modified UI files remain under 250 lines. All five covered files have colocated tests planned; account-menu flow has feature and step files planned.
- Authority freshness needs explicit verification: Next.js preserves layouts on client navigation. Guard the Users page as well as the admin layout; ensure the account menu drops a demoted user's entry on next navigation rather than relying solely on an app-layout prop. Add a same-session demotion E2E scenario and test its next-navigation behavior.
- Add `src/lib/auth-helpers.test.ts` cases for authenticated admin, member, missing user row, and unauthenticated access. Follow existing fixture/mother patterns for fresh-install and role scenarios.
- Implementation handoff runs targeted tests only. Root agent owns final build-validator gate. Preserve pre-existing changes; implementation subagent performs no commits or remote operations.
- Role freshness uses authenticated `GET /api/users/me/instance-role` with `Cache-Control: no-store` and client `cache: "no-store"`. Read-only role refresh must stay outside Next's server-action queue: controlled resolution of two role actions around Settings navigation reproduced `/profile` being replaced by stale `/trips` router state. Server `requireAdmin()` guards remain unchanged.
- Transport regression tests: `account-menu.test.tsx` covers GET/cache/credentials, status/JSON validation, network failure, stale pathname responses and unmount; `src/app/api/users/me/instance-role/route.test.ts` covers session-bound lookup, no-store output, unauthenticated rejection and DB failure. Sidebar/bottom-bar tests mock fetch. `account-menu.feature` delays both mounted menus' GET responses across Settings navigation, then verifies fresh authority and stable `/profile`; profile navigation retains its original assertion timeout.
- Authority freshness includes serialized search parameters as well as pathname. Three new unit cases failed before the query fix; all 17 account-menu tests and the Travel History query-navigation demotion E2E scenario pass afterward.

## Plan Change Log

- Replaced menu role-refresh server action with an authenticated uncached GET after reproducing a Next router-state rollback; removed unused action and updated E2E feature mapping. Added deterministic delayed-response navigation regression coverage.

## Review Triage Log

- medium / patch — `tests/e2e/steps/account-menu.steps.ts`: confirmed existing-layout demotion scenario used `page.goto`, recreating layouts instead of exercising client navigation. Retain document-request denial and add Users-link client navigation with a retained admin layout and a verified RSC request.
- medium / patch — `src/components/arrivo/account-menu.tsx`: verified Travel History uses query-only `router.push()` for view/range changes while role refresh depends only on pathname. Include search parameters in freshness identity and test demotion followed by query-only navigation.
- Resolution: both patches implemented and their focused E2E scenarios passed. No findings deferred.

## Design Notes

Menu opens upward from the sidebar footer (`side="top"`). Base UI `Menu` supplies keyboard open (Enter/Space/ArrowDown), Escape dismiss, focus into the menu and back to the trigger; tests assert Escape returns focus. Triggers keep visible text (username / "Profile"), carry an accessible name, and are at least `h-11`/44px; the sidebar trigger must still show name and `@username`. Colors via CSS variables only. Mobile Profile tab becomes a `button` with `aria-haspopup`; Settings in the menu is the new route to `/profile` on mobile.

## Verification

**Commands:**

- `npx vitest run src/lib/instance-roles.test.ts src/components/arrivo` -- expected: pass
- `npm run test:e2e:affected` -- expected: account-menu, auth, profile features pass (full suite via SHARED_GLOBS)

**Matrix audit:** admin entry and fresh bootstrap are covered by account-menu and instance-bootstrap E2E; member menu and route denial by account-menu E2E; demotion by pathname, retained-layout RSC navigation and query-only navigation scenarios; mobile Profile by the account-menu mobile scenario. All matrix scenarios passed focused runs. Component tests also verify Log out and Escape focus restoration. The delayed-GET scenario protects against navigation rollback.

**Final results:** ESLint, TypeScript, production build and affected E2E pass. Vitest: 289 files, 4,599 tests; coverage 96.94% lines, 96.72% functions, 91.63% branches. Playwright: 292 passed. The TypeScript-only query mock correction also passed its 17 targeted component tests and a fresh type check. Production build generated 15 pages, including dynamic admin routes. Both quick-review findings resolved; none deferred.
