---
title: 'Profile page sidebar nav layout'
type: 'refactor'
created: '2026-05-17'
status: 'done'
baseline_commit: '5e06b65b4e9e9cb8eb1a4bc6be7182c42e0114c8'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The profile page renders all sections as a single long scrolling column, making it hard to navigate to a specific settings area without scrolling past unrelated content.

**Approach:** Refactor `page-client.tsx` to use the existing `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` primitives from `ui/tabs.tsx` in a two-panel layout — vertical sidebar on the left at desktop (≥640px), horizontal tab bar on top at mobile — rendering only the active section's panel.

## Boundaries & Constraints

**Always:**
- Five tabs: Identity, Traveler (contains LoyaltySection + PassportSection + WishlistSection stacked), Preferences, Appearance, Account
- Use `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` from `src/components/ui/tabs.tsx` as the structural foundation — Base UI handles `role="tablist"`, `aria-selected`, and keyboard navigation automatically
- Responsive layout via CSS: mobile default (tabs on top, content below); `sm:flex-row` override on root for desktop sidebar
- `aria-label="Profile sections"` on `TabsList`
- Mobile `TabsTrigger` items must have minimum height 44px for touch targets
- `ProfileSection` union type defined in `src/data/types.ts` (not in component files)
- Active section defaults to `'identity'` on load
- All colors via CSS custom properties — no hardcoded hex/rgb; override Tabs primitive visual styles to match project tokens
- `cn()` for className merging

**Ask First:**
- If Account tab should use a distinct destructive/warning color treatment

**Never:**
- URL-based routing or searchParams for section state
- New database queries or server-side changes
- Modify individual section component files (loyalty-section, passport-section, etc.)
- Custom keyboard navigation logic — rely on Base UI Tabs for that

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Default load | Page mounts | Identity tab is active (`aria-selected="true"`), Identity content visible | N/A |
| Tab switch | Click any TabsTrigger | That tab's panel renders; previously active panel hidden by Base UI | N/A |
| Traveler tab | Click Traveler trigger | LoyaltySection, PassportSection, and WishlistSection all render in the panel | N/A |
| Mobile viewport | Viewport < 640px | Horizontal tab bar above content; no left sidebar column | N/A |
| Desktop viewport | Viewport ≥ 640px | Left sidebar list of tabs, content panel to the right | N/A |
| Keyboard nav | Arrow keys while focus in TabsList | Focus moves between tabs; Enter/Space activates focused tab | N/A |

</frozen-after-approval>

## Code Map

- `src/data/types.ts` — add `ProfileSection` union type here
- `src/app/(app)/profile/page-client.tsx` — owns layout shell; replaces `flex-col` stack with `Tabs`-based two-panel layout
- `src/components/ui/tabs.tsx` — `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` from Base UI; supports `orientation` prop and handles all ARIA
- `src/app/(app)/profile/identity-section.tsx` — content for Identity panel (no changes)
- `src/app/(app)/profile/loyalty-section.tsx` — part of Traveler panel (no changes)
- `src/app/(app)/profile/passport-section.tsx` — part of Traveler panel (no changes)
- `src/app/(app)/profile/wishlist-section.tsx` — part of Traveler panel (no changes)
- `src/app/(app)/profile/preferences-section.tsx` — Preferences panel (no changes)
- `src/app/(app)/profile/account-section.tsx` — Account panel (no changes)
- `src/components/packt/theme-select.tsx` — used inline in Appearance panel (no changes)
- `tests/e2e/features/profile.feature` — update existing scenarios + add section-nav scenarios
- `tests/e2e/steps/profile.steps.ts` — fix `.first()`/`.last()` Save selectors to navigate to the section first; add section-nav step definitions

## Tasks & Acceptance

**Execution:**
- [ ] `src/data/types.ts` — add `export const ProfileSection = { identity: 'identity', traveler: 'traveler', preferences: 'preferences', appearance: 'appearance', account: 'account' } as const; export type ProfileSection = (typeof ProfileSection)[keyof typeof ProfileSection]`
- [ ] `src/app/(app)/profile/page-client.tsx` — replace the `flex-col gap-8` stack with a `<Tabs defaultValue="identity">` root; `TabsList` gets `aria-label="Profile sections"` and responsive classes (`flex-row overflow-x-auto sm:flex-col sm:w-44 sm:shrink-0`); five `TabsTrigger` items with `min-h-[44px]`; five `TabsContent` panels; Traveler panel wraps all three sub-section components; Appearance panel wraps the inline ThemeSelect block; visual styles override Tabs defaults to match `var(--fg)`, `var(--fg-2)`, `var(--surface)`, `var(--accent-brand)` tokens
- [ ] `src/app/(app)/profile/page-client.test.tsx` — create: Identity tab is active by default; clicking Traveler shows all three sub-sections; clicking Preferences hides Identity; clicking Account shows the password form; Appearance panel contains theme select
- [ ] `tests/e2e/features/profile.feature` — add scenarios: (a) clicking the Traveler tab shows loyalty, passport, and wishlist sections; (b) clicking each tab shows only that section's content; update "save Identity section" and "save Preferences section" scenarios to click the tab before saving
- [ ] `tests/e2e/steps/profile.steps.ts` — update "I save the Identity section" step to click Identity tab before clicking Save; update "I save the Preferences section" step to click Preferences tab before clicking Save; add step definitions for the new E2E scenarios; update "#pref-currency" locator step to click Preferences tab before locating the input

**Acceptance Criteria:**
- Given the profile page loads, when no interaction has occurred, then the Identity tab is active (`aria-selected="true"`) and Identity content is visible
- Given the user clicks the Traveler tab, when the click registers, then LoyaltySection, PassportSection, and WishlistSection all render and Identity content is hidden
- Given any tab trigger, when activated via keyboard Enter or Space, then its panel becomes visible and `aria-selected` is true on that trigger
- Given a desktop viewport (≥640px), when the profile page renders, then tabs form a vertical list on the left and content fills the right
- Given a mobile viewport (<640px), when the profile page renders, then tabs appear as a horizontal scrollable row above the content
- Given the existing "Update display name" E2E scenario, when it runs after the refactor, then it still passes (Identity tab navigated to before saving)
- Given the existing "Update preferences" E2E scenario, when it runs after the refactor, then it still passes (Preferences tab navigated to before saving)

## Design Notes

Desktop layout (Tabs orientation vertical via CSS):
```
┌────────────────┬──────────────────────────────────┐
│  Identity ●    │  [active section content]         │
│  Traveler      │                                   │
│  Preferences   │                                   │
│  Appearance    │                                   │
│  Account       │                                   │
└────────────────┴──────────────────────────────────┘
```

Mobile layout (Tabs default horizontal):
```
┌────────────────────────────────────────────────────┐
│ Identity │ Traveler │ Prefs │ Appearance │ Account  │  ← scrollable
├────────────────────────────────────────────────────┤
│  [active section content]                          │
└────────────────────────────────────────────────────┘
```

The `Tabs` root at mobile is `flex-col` (default for `data-horizontal`); at `sm:` override to `flex-row` for desktop. `TabsList` is `flex-row overflow-x-auto` at mobile; at `sm:` override to `flex-col` for vertical stacking. Because we're overriding the Base UI styling significantly, use `cn()` to merge project-token styles on top rather than fighting the default CVA classes.

## Spec Change Log

_Rev 1 — accessibility reviewer: added `aria-label` on TabsList, touch target minimum, and keyboard nav constraints; specified use of `ui/tabs.tsx` to get ARIA tablist pattern for free._
_Rev 1 — architecture reviewer: moved `ProfileSection` type to `src/data/types.ts`._
_Rev 1 — test reviewer: added E2E tasks for section-nav scenarios; updated existing E2E step tasks to navigate to the correct tab before saving._

## Verification

**Commands:**
- `npm test -- page-client` -- expected: all tests pass
- `npm run test:e2e` -- expected: profile E2E scenarios pass including updated Identity/Preferences save flows
- `npm run build` -- expected: no TypeScript or lint errors

## Suggested Review Order

**Layout shell**

- Entry point: Tabs-based two-panel layout replaces flat stack
  [`page-client.tsx:53`](../../src/app/(app)/profile/page-client.tsx#L53)

- Five-section nav items array typed against ProfileSection
  [`page-client.tsx:15`](../../src/app/(app)/profile/page-client.tsx#L15)

- Traveler panel stacks all three sub-sections together
  [`page-client.tsx:77`](../../src/app/(app)/profile/page-client.tsx#L77)

**Accessibility & orientation**

- `isDesktop` hook drives vertical/horizontal orientation for correct arrow-key nav
  [`page-client.tsx:28`](../../src/app/(app)/profile/page-client.tsx#L28)

- TabsList: `aria-label`, `style={{height:"auto"}}` overrides Base UI 32px h-8 constraint
  [`page-client.tsx:55`](../../src/app/(app)/profile/page-client.tsx#L55)

- TabsTrigger: min-h-[44px] touch target, project token colors via data-active variants
  [`page-client.tsx:62`](../../src/app/(app)/profile/page-client.tsx#L62)

**Types**

- ProfileSection const-enum added to canonical types file
  [`types.ts:101`](../../src/data/types.ts#L101)

**Tests**

- Unit tests: default tab, section switching, Traveler sub-sections, Account/Appearance
  [`page-client.test.tsx:1`](../../src/app/(app)/profile/page-client.test.tsx#L1)

- E2E: tab navigation steps added before save operations; new section-switch scenarios
  [`profile.feature:1`](../../tests/e2e/features/profile.feature#L1)

- E2E steps: `.first()`/`.last()` selectors replaced; tab-click steps added
  [`profile.steps.ts:1`](../../tests/e2e/steps/profile.steps.ts#L1)
