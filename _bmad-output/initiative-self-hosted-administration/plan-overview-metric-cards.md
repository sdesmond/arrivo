---
title: "Overview metrics as a card grid"
type: "feature"
ticket: ""
created: "2026-10-31"
status: "built"
baseline_revision: "a52f6aa2ed8f2457ebb8a5de9e57887c48ef2c71"
route: "full"
route_source: "auto"
risk: "low"
review: 'quick'
review_source: 'pinned'
lenses_ran: ["quick"]
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Admin Overview shows metrics as a dense settings-style list, with a text Refresh/Retry button and a visible "Checked HH:MM:SS UTC" on every row. Hard to scan, and UTC time makes admins convert in their head.

**Approach:** Render each metric as a card in a responsive grid: centered title, large centered hero value under it, refresh as an icon button in the card's lower-right corner. The checked timestamp moves into a tooltip on that icon button and is shown in the viewer's local time.

## Boundaries & Constraints

**Always:**
- Keep per-metric refresh semantics unchanged: independent refresh, Refresh/Retry labels (`aria-label` "Refresh X" / "Retry X"), disabled-while-pending with `focusableWhenDisabled`, live-region announcements, Stale indicator, Unavailable state.
- Icon button is `size-11` (44×44), Lucide icon with `strokeWidth={1.5}`, has `title`-equivalent tooltip; icon spins (`animate-spin`) while pending.
- Checked time stays programmatically available on every card without hovering: a `<time dateTime={checkedAt}>` referenced by the button's `aria-describedby`, visually hidden (`sr-only`), text `Checked <local time>`. The tooltip shows the same `Checked <local time>` text.
- Local time is hydration-safe: reuse the browser time-zone pattern from `app-activity-viewer.tsx:18-41` (UTC server snapshot, browser zone on client). Do not use `suppressHydrationWarning`, because React keeps the server-zone text. Checked: `toLocaleTimeString(locale, { timeZone })` with `locale` from `useBrowserLocale()` (`"en-US"` in the server/hydration snapshot, then `navigator.language`; renegotiated after review finding 1); admin-action entries: `formatInstant(occurredAt, timeZone)`, the same format the Activity page uses.
- Refresh icon button: `aria-label` names it. The Base UI tooltip replaces a native `title`, since a `title` would show a second tooltip. Touch devices get no tooltip, which is accepted; the sr-only described `<time>` keeps the checked time available to AT.
- Decision (Q1): Recent admin actions is a full-width card (`col-span-full`): centered title, list left-aligned below, refresh icon lower-right.
- Decision (Q2): Recent admin actions per-entry times also show in local time.
- Upload storage keeps human-readable bytes with exact bytes in `title`.
- Colors via CSS vars; no arbitrary Tailwind values (hero size via inline style if no Tailwind scale class fits); no horizontal scroll at 320px / 200% text.

**Never:**
- No change to server actions, readers, `Metric<T>` contract, or what metrics are shown.
- No new dependencies; reuse `src/components/ui/tooltip.tsx` and `Button`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Healthy number | `{status:"ok", value: 4}` | Card: "Users" title, "4" hero, refresh icon lower-right | — |
| Zero | `value: 0` | Hero "0", not Unavailable | — |
| Text value | `value: "Healthy"` / `"1.0.0"` | Text rendered as hero, wraps without overflow | — |
| Unavailable | `{status:"unavailable"}` | Hero "Unavailable" in `--fg-3`; button label "Retry X" | Tooltip still shows checked time |
| Stale after failed refresh | prior ok, refresh fails | Hero keeps old value, "Stale" shown under it, checked time unchanged | Announcement unchanged |
| Pending | refresh in flight | Icon spins, button `aria-disabled`, other cards enabled | — |
| Hover/focus icon | pointer hover or keyboard focus | Tooltip "Checked 3:04:05 PM" (viewer locale/zone) | — |

</frozen-after-approval>

## Code Map

- `src/components/arrivo/overview-metrics.tsx` -- builds the 10 metric rows + Recent admin actions inside one `<dl className="m-0 mt-2">`; becomes the grid container. Keep `<dl>` with `div > dt + dd` per card (valid HTML; E2E `metricRow()` relies on `dl > div`).
- `src/components/arrivo/metric-row.tsx` -- `MetricRow` row layout, `formatBytes`, visible `Checked … UTC` `<time>`. Becomes the card; drop its visible time (moves to controls). Consider renaming to `MetricCard` only if cheap — keeping the name avoids feature-map churn (`feature-map.mjs` lists this file under `admin-overview`).
- `src/components/arrivo/refreshable-metric.tsx` -- owns state + the text `Button`; `controls` render prop. Change button to icon (`RefreshCw`) wrapped in `Tooltip`/`TooltipTrigger render={<Button …/>}`/`TooltipContent`, plus sr-only `<time>` description. It already has `metric.checkedAt`.
- `src/components/arrivo/recent-admin-actions.tsx` -- list-valued metric; also renders `Checked … UTC` and per-event `formatInstant(…, "UTC")` (`src/lib/activity-dates.ts`). Becomes the full-width card; event times use the browser zone.
- `src/components/arrivo/app-activity-viewer.tsx:18-21,41` -- inline `subscribeToZone`/`readBrowserZone`/`readServerZone` + `useSyncExternalStore`; extract into `useBrowserTimeZone()` in new `src/lib/browser-time-zone.ts` and use it here unchanged in behavior (3 consumers).
- `tests/e2e/feature-map.mjs` -- register `src/lib/browser-time-zone.ts` under both `admin-overview` and the Activity feature entry (map test fails on unclassified `src/lib/**`).
- `src/components/arrivo/app-users-list.tsx:48-65` -- reference for Base UI Tooltip usage in this repo.
- `src/app/(app)/admin/overview/page.tsx` -- panel `max-w-3xl`; no change expected unless grid needs wider panel (keep `max-w-3xl` per DESIGN.md compact-content-width).
- `tests/e2e/steps/admin-overview.steps.ts` -- asserts `Checked \d{2}:\d{2}:\d{2} UTC` text (3 places), counts 11 `time` with `Checked `, reads `dd > span` for values, 44px button boxes, Refresh/Retry names. Update regexes to local format; structure selectors should still hold.
- Do not touch: `src/app/(app)/admin/overview/actions.ts`, `src/lib/overview-*.ts`.

## Tasks & Acceptance

**Execution:**

- [ ] `src/lib/browser-time-zone.test.ts` (new) -- client returns `Intl` resolved zone, falls back to `"UTC"` when empty; server render (`renderToString`) yields `"UTC"`.
- [ ] `src/lib/browser-time-zone.ts` (new), `src/components/arrivo/app-activity-viewer.tsx` (use the hook), `tests/e2e/feature-map.mjs` entries; `app-activity-viewer.test.tsx` must still pass unchanged.
- [ ] `src/components/arrivo/refreshable-metric.test.tsx` -- assert icon button keeps "Refresh Users"/"Retry Users" names, `aria-describedby` points to `<time datetime=checkedAt>` with text `Checked ${new Date(checkedAt).toLocaleTimeString()}`, tooltip shows same text on focus/hover, icon spins while pending -- tests first.
- [ ] `src/components/arrivo/metric-row.test.tsx` -- drop visible UTC time assertions; assert title (`dt`) and hero value (`dd > span`) render, Stale, Unavailable, bytes title still hold.
- [ ] `src/components/arrivo/recent-admin-actions.test.tsx`, `overview-metrics.test.tsx` -- update `Checked` text expectations; `overview-metrics` still finds updated `datetime` within the refreshed card.
- [ ] `src/components/arrivo/refreshable-metric.tsx` -- icon button + tooltip + sr-only described time.
- [ ] `src/components/arrivo/metric-row.tsx` -- card layout: bordered `var(--line)` surface, flex column, centered `dt` title, large centered hero, Stale under hero, controls aligned bottom-right; remove visible time.
- [ ] `src/components/arrivo/recent-admin-actions.tsx` -- full-width card; entry times `formatInstant(…, useBrowserTimeZone())`; remove visible checked time.
- [ ] `src/components/arrivo/overview-metrics.tsx` -- `<dl>` as grid: `grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3` (matches `app-users-list` gaps).
- [ ] `tests/e2e/steps/admin-overview.steps.ts` -- replace `Checked … UTC` regexes with local-time pattern (`/^Checked \d{1,2}:\d{2}:\d{2}/`), admin-action entry text expected as `formatInstant(iso, browserZone)` with `browserZone` read via `page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)`; add assertion that focusing a refresh button shows the tooltip with its checked time.

**Acceptance Criteria:**

- Given an admin on Overview at desktop width, when the page loads, then metrics appear as cards in a multi-column grid, each with centered title and large centered value, and no visible checked time.
- Given a card, when the admin hovers or keyboard-focuses its refresh icon, then a tooltip shows "Checked" plus the measurement time in the browser's local time zone.
- Given a 320px viewport at 200% text, when Overview renders, then cards stack in one column with no horizontal scroll and refresh buttons stay ≥44×44px.

## Implementation Notes

## Plan Change Log

## Review Triage Log

| # | Finding | Verdict | Route | Evidence |
| --- | --- | --- | --- | --- |
| 1 | `toLocaleTimeString(undefined, …)` in `refreshable-metric.tsx:60` hydrates with a server-vs-browser locale mismatch | medium | intent_gap | Real: zone is hydration-safe, locale is not; sr-only `<time>` is in the SSR HTML. Frozen Boundaries prescribe `undefined` locale and forbid `suppressHydrationWarning`, so the plan cannot settle the fix. |
| 2 | Base UI trigger may override `aria-describedby` | false | rejected | No `describedby` in `@base-ui/react/esm/tooltip`; the trigger never sets it. |
| 3 | Hover and Unavailable/Retry tooltip untested | low | defer-with-loopback (moot) | Test-only gap; revisit after intent_gap resolution. |
| 4 | `toHaveStyle` with CSS var unreliable in jsdom | false | rejected | Test passes in implementer's run; no evidence of false pass. |
| 5 | Admin actions card Unavailable not hero-style | false | rejected | Matches Q1 decision (list left-aligned, small text). |
| 6 | E2E `getByRole("tooltip")` unscoped | low | rejected | Only one element focused at a time; fix adds complexity. |
| 7 | AC3 (320px/200%) unverified | maybe-false | defer | Needs E2E/browser run; E2E DB was unavailable. |
| 8 | Test file `.tsx` vs plan `.ts` | false | rejected | Justified (JSX); no harm. |
| 9 | `context: []` empty | false | rejected | Process nit, no code effect. |

## Design Notes

Hero value: ~`1.875rem` semibold, `tabular-nums`, `wrap-anywhere`; text values (Healthy, version) use the same style. Card min-height keeps rows aligned; controls row is `flex justify-end` at card bottom so the icon sits lower-right.

## Verification

**Commands:**

- `npx vitest run src/components/arrivo/metric-row.test.tsx src/components/arrivo/refreshable-metric.test.tsx src/components/arrivo/recent-admin-actions.test.tsx src/components/arrivo/overview-metrics.test.tsx` -- expected: pass
- `build-validator` skill -- expected: PASS (lint, tsc, coverage, build, affected E2E `@feat:admin-overview`)

**Manual checks:**

- `/admin/overview` in dev: grid of cards, tooltip on hover/focus shows local time.
