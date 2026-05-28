# Story 1.4: TripCover Image Display Wiring

Status: done

## Story

As a traveler,
I want my trip's cover to display on trip cards and the trip detail page,
so that trips with photos or graphics look rich and visually distinct from gradient-only trips.

## Acceptance Criteria

1. **Given** `src/components/packt/trip-cover.tsx` — **Then** the component accepts `coverImageUrl?: string` and `destinationCountry?: string` props

2. **Given** `coverImageUrl` starts with `graphic:` — **Then** `parseGraphicCover(coverImageUrl)` is called and the component renders the SVG color+icon graphic using the returned color and icon values — **And** no `<img>` element is rendered

3. **Given** `coverImageUrl` is a standard URL (not a graphic) — **Then** the component renders an `<img>` as a full-bleed background with `objectFit: "cover"` — **And** the gradient renders behind it as a loading placeholder

4. **Given** the `<img>` fails to load (`onError`) — **Then** `coverImageUrl` is cleared from local state and the gradient/icon fallback renders — **And** no broken image icon is ever visible

5. **Given** `coverImageUrl` is null or empty — **Then** the current gradient + icon fallback behavior is unchanged

6. **Given** `src/app/globals.css` cover stripes — **Then** stripe width is 28px, gap is 28px, and `filter: blur(2px)` is applied

7. **Given** all 9 call sites of `TripCover` across the codebase — **Then** each passes `coverImageUrl` (and `destinationCountry` where available) from the trip data

8. **Given** `src/components/packt/trip-cover.test.tsx` (new file) — **Then** tests cover: renders gradient when no imageUrl, renders `<img>` when imageUrl is a URL, renders SVG graphic when imageUrl is a `graphic:` string, `onError` triggers gradient fallback, stripes overlay is present in DOM

## Tasks / Subtasks

- [x] Update `TripCover` props: add `coverImageUrl?` and `destinationCountry?` (AC: 1)
  - [x] When `coverImageUrl` is a URL: render `<img>` as full-bleed background with `objectFit: "cover"`, gradient behind as loading placeholder
  - [x] When `coverImageUrl` starts with `graphic:`: call `parseGraphicCover`, render SVG with color fill + Lucide icon, no `<img>` rendered
  - [x] When `coverImageUrl` is null/empty: preserve existing gradient+icon behavior (unchanged)
  - [x] Add `onError` handler on `<img>`: clear URL from local state → gradient fallback renders
  - [x] Import `parseGraphicCover` from `@/lib/utils` and Lucide icon components as needed

- [x] Update CSS stripes in `globals.css` (AC: 6)
  - [x] Widen: 14px → 28px stripes, gap 14px → 28px
  - [x] Add `filter: blur(2px)` to `.cover-stripes`
  - [x] Update both light and `.dark` variants

- [x] Thread props through all 9 call sites (AC: 7)
  - [x] `TripCard` — pass `coverImageUrl`, `destinationCountry` from `trip`
  - [x] `NowCard` — pass `coverImageUrl`, `destinationCountry` from `trip`
  - [x] `PastTripsList` — pass `coverImageUrl` from `trip`
  - [x] `MobileUnscheduledTab` — pass `coverImageUrl` from `trip`
  - [x] `MobileUpcomingTab` — pass `coverImageUrl` from `trip`
  - [x] `MobileActiveTab` — pass `coverImageUrl`, `destinationCountry` from `trip`
  - [x] `MobilePastTab` — pass `coverImageUrl` from `trip`
  - [x] `page-client.tsx` — pass `coverImageUrl`, `destinationCountry` from `trip`
  - [x] `TripHero` — pass `coverImageUrl` from trip data

- [x] Create `trip-cover.test.tsx` (AC: 8)
  - [x] Test: renders gradient when no imageUrl
  - [x] Test: renders `<img>` when imageUrl is a URL
  - [x] Test: renders SVG graphic when imageUrl is a `graphic:` string
  - [x] Test: `onError` triggers gradient fallback (URL cleared from state)
  - [x] Test: stripes overlay present in DOM
  - [x] Test: `destinationCountry` prop forwarded for display (if applicable)

- [x] Verify existing tests still pass after TripCover prop changes
  - [x] `page-client.test.tsx` (mocks TripCover — verify mock still matches new props)

### Review Findings

**patch:**
- [x] [Review][Patch] Double scrim overlay for photo covers — Remove TripCover's internal scrim for photo covers; keep page-client.tsx's unconditional scrim. Single scrim for all modes. [trip-cover.tsx:86]
- [x] [Review][Patch] Unsafe type cast of entire lucide-react module [trip-cover.tsx:14]
- [x] [Review][Patch] Failed image URL cached permanently, no retry mechanism [trip-cover.tsx:48-49,55]
- [x] [Review][Patch] Race condition on onError when coverImageUrl changes mid-load [trip-cover.tsx:77]
- [x] [Review][Patch] Empty invisible &lt;div&gt; overlay rendered when Lucide icon lookup fails [trip-cover.tsx:92-96]
- [x] [Review][Patch] Malformed graphic: prefix falls through to photo rendering path [trip-cover.tsx:59-61]
- [x] [Review][Patch] Graphic icon uses hardcoded var(--accent-fg) instead of parsed color [trip-cover.tsx:29]

**defer:**
- [x] [Review][Defer] Image onError can update state after component unmount [trip-cover.tsx:74] — deferred, pre-existing
- [x] [Review][Defer] Hardcoded 48px icon size with no consumer override [trip-cover.tsx:29] — deferred, pre-existing
- [x] [Review][Defer] No srcSet/sizes on cover &lt;img&gt; [trip-cover.tsx:73-85] — deferred, pre-existing

## Dev Notes

### File Overview — Every File That Changes

| File | Operation | Notes |
|------|-----------|-------|
| `src/components/packt/trip-cover.tsx` | UPDATE | Add `coverImageUrl`, `destinationCountry` props; conditional rendering for photo/graphic/gradient |
| `src/components/packt/trip-cover.test.tsx` | NEW | Unit tests for all 3 visual modes + `onError` + stripes |
| `src/components/packt/trip-card.tsx` | UPDATE | Thread `trip.coverImageUrl`, `trip.destinationCountry` to TripCover |
| `src/components/packt/now-card.tsx` | UPDATE | Thread `trip.coverImageUrl`, `trip.destinationCountry` to TripCover |
| `src/components/packt/trips-past-list.tsx` | UPDATE | Thread `trip.coverImageUrl` to TripCover |
| `src/components/packt/mobile-unscheduled-tab.tsx` | UPDATE | Thread `trip.coverImageUrl` to TripCover |
| `src/components/packt/mobile-upcoming-tab.tsx` | UPDATE | Thread `trip.coverImageUrl` to TripCover |
| `src/components/packt/mobile-active-tab.tsx` | UPDATE | Thread `trip.coverImageUrl`, `trip.destinationCountry` to TripCover |
| `src/components/packt/mobile-past-tab.tsx` | UPDATE | Thread `trip.coverImageUrl` to TripCover |
| `src/components/packt/trip-hero.tsx` | UPDATE | Thread `coverImageUrl` from trip data (NOTE: TripHero receives individual props, not a Trip object — see call site in page-client.tsx) |
| `src/app/(app)/trips/[tripId]/page-client.tsx` | UPDATE | Thread `trip.coverImageUrl`, `trip.destinationCountry` to TripCover |
| `src/app/globals.css` | UPDATE | Widen stripes 14→28px, gap 14→28px, add `filter: blur(2px)` |

All work is additive or non-breaking. No new dependencies needed.

---

### Current `TripCover` Behavior (Before Changes)

Current file at `src/components/packt/trip-cover.tsx` (86 lines):

```tsx
"use client";
import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { getTint } from "@/lib/trip-tints";
import { cn } from "@/lib/utils";

interface TripCoverProps {
  name: string;
  country?: string;
  metaTag?: string;
  showCity?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function TripCover({ name, country, metaTag, showCity = true, className, style }: TripCoverProps) {
  const { resolvedTheme } = useTheme();
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const dark = mounted && resolvedTheme === "dark";
  const tint = getTint(name, dark);
  return (
    <div className={cn("relative overflow-hidden", className)} style={{ background: tint, ...style }}>
      <div className="cover-stripes absolute inset-0" />
      {metaTag && (...)}
      {showCity && (
        <div ...>
          {name}
          {country && <span...>{country}</span>}
        </div>
      )}
    </div>
  );
}
```

**What this story changes:**
- TripCoverProps gets `coverImageUrl?: string` and `destinationCountry?: string`
- When `coverImageUrl` is set and is a URL (not `graphic:`): render `<img>` as the background with the gradient behind it (the gradient shows as a loading placeholder until the image loads, and as fallback if `onError` fires)
- When `coverImageUrl` starts with `graphic:`: parse with `parseGraphicCover`, render an SVG with the color as background fill and the Lucide icon centered
- When `coverImageUrl` is null/empty: current behavior unchanged
- `destinationCountry` is used in the city overlay display (the existing `country` prop is used for metadata like "3 DAYS" — `destinationCountry` is the actual country name)

**Critical implementation notes:**
- The `<img>` must have `objectFit: "cover"` and `position: "absolute"` to fill the container
- The gradient/tint MUST render behind the `<img>` as a loading placeholder
- On `onError`, clear `coverImageUrl` from state (use `useState` — currently the component has no state, so add one)
- For the graphic SVG rendering, import Lucide icons dynamically based on the parsed icon name (use a lookup object mapping icon name strings to Lucide components)
- The SVG fill color should use the color value from `parseGraphicCover` directly (these are CSS variable references like `var(--accent-brand)`)

**Preserve these existing behaviors:**
- `metaTag` badge still renders top-left when provided
- `showCity` still controls the city overlay display
- `name` still shown as the city heading
- `country` (existing prop, metadata like "3 DAYS") still shown below city name
- `cover-stripes` overlay still present (updated for wider stripes)
- The component still has `"use client"` at the top
- The component still uses `cn()` for className merging
- Theme-aware gradient tints still work via `getTint` and `useTheme`

---

### `src/components/packt/trip-cover.tsx` — Implementation Plan

**New imports to add:**
```ts
import { useState } from "react";
import { parseGraphicCover } from "@/lib/utils";
// Dynamic icon resolution for graphic covers
import * as LucideIcons from "lucide-react";
```

**Updated interface:**
```ts
interface TripCoverProps {
  name: string;
  country?: string;
  metaTag?: string;
  showCity?: boolean;
  className?: string;
  style?: React.CSSProperties;
  coverImageUrl?: string;
  destinationCountry?: string;
}
```

**New state:**
```ts
const [imgError, setImgError] = useState(false);
```

**Rendering logic (pseudocode for the main div):**
```ts
// Determine background
const graphicCover = coverImageUrl && !imgError ? parseGraphicCover(coverImageUrl) : null;
const isPhoto = coverImageUrl && !imgError && !graphicCover && coverImageUrl.length > 0;

return (
  <div className={cn("relative overflow-hidden", className)} style={{ background: isPhoto ? tint : graphicCover ? graphicCover.color : tint, ...style }}>
    {/* Stripes — only show when NOT a photo (stripes would overlay the image) */}
    {!isPhoto && <div className="cover-stripes absolute inset-0" />}

    {/* Photo image — full bleed background */}
    {isPhoto && (
      <img
        src={coverImageUrl!}
        alt=""
        onError={() => setImgError(true)}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />
    )}

    {/* Graphic cover SVG */}
    {graphicCover && (
      <div className="absolute inset-0 flex items-center justify-center" style={{ background: graphicCover.color }}>
        {renderGraphicIcon(graphicCover.icon)}
      </div>
    )}

    {/* Scrim overlay on photos for text legibility */}
    {isPhoto && <div className="absolute inset-0 pointer-events-none" style={{ background: "var(--cover-scrim)" }} />}
    
    {metaTag && (...existing...)}
    {showCity && (
      <div ...>
        {name}
        {(country || destinationCountry) && (
          <span ...>{destinationCountry ?? country}</span>
        )}
      </div>
    )}
  </div>
);
```

**Graphic icon resolution:**
```ts
function renderGraphicIcon(iconName: string): React.ReactNode {
  const iconKey = iconName
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  const IconComponent = (LucideIcons as Record<string, React.ComponentType<{ size?: number; strokeWidth?: number }>>)[iconKey];
  if (!IconComponent) return null;
  return <IconComponent size={48} strokeWidth={1.5} style={{ color: "var(--accent-fg)" }} />;
}
```

This uses Lucide's named exports (e.g., `Plane`, `Map`, `Compass`). All icon names in `GRAPHIC_COVER_ICONS` map to valid Lucide exports.

**Note about `destinationCountry` usage:** The existing `country` prop is used for metadata like "3 DAYS" (day count). `destinationCountry` is the actual country name from the trip's destination data. In the city overlay:
- Show `destinationCountry` when available (actual country name)
- Fall back to existing `country` prop for backward compatibility
- This ensures trips with destination data show the country name, while existing trips still show the day count

---

### CSS Stripes Update (`globals.css`)

**Current (lines 272-289):**
```css
.cover-stripes {
  background: repeating-linear-gradient(135deg,
    rgba(0, 0, 0, 0.04) 0px, rgba(0, 0, 0, 0.04) 14px,
    transparent 14px, transparent 28px);
}
.dark .cover-stripes {
  background: repeating-linear-gradient(135deg,
    rgba(255, 255, 255, 0.04) 0px, rgba(255, 255, 255, 0.04) 14px,
    transparent 14px, transparent 28px);
}
```

**Change to:** Stripe width 28px, gap 28px, add `filter: blur(2px)`:
```css
.cover-stripes {
  background: repeating-linear-gradient(135deg,
    rgba(0, 0, 0, 0.04) 0px, rgba(0, 0, 0, 0.04) 28px,
    transparent 28px, transparent 56px);
  filter: blur(2px);
}
.dark .cover-stripes {
  background: repeating-linear-gradient(135deg,
    rgba(255, 255, 255, 0.04) 0px, rgba(255, 255, 255, 0.04) 28px,
    transparent 28px, transparent 56px);
}
```
The stripe width is 28px and gap is 28px because the gradient paints 28px of color then 28px of transparent (total period = 56px, stripe = first 28px, gap = second 28px).

---

### All 9 Call Sites — Prop Threading

Each call site currently uses the existing `TripCoverProps`. After the update, pass additional props where the data is available from the Trip object.

| # | File | Line | Current Usage | New Props to Add |
|---|------|------|--------------|-----------------|
| 1 | `trip-card.tsx` | 87 | `<TripCover name={trip.name} country={sub} metaTag="UPCOMING" showCity style={{ minHeight: 160 }} />` | `coverImageUrl={trip.coverImageUrl}` `destinationCountry={trip.destinationCountry}` |
| 2 | `now-card.tsx` | 59 | `<TripCover name={trip.name} country={sub} metaTag={statusLabel} showCity style={{ minHeight: 220 }} />` | `coverImageUrl={trip.coverImageUrl}` `destinationCountry={trip.destinationCountry}` |
| 3 | `trips-past-list.tsx` | 35 | `<TripCover name={trip.name} showCity={false} style={{ width: 52, height: 40, borderRadius: 6, flexShrink: 0 }} />` | `coverImageUrl={trip.coverImageUrl}` |
| 4 | `mobile-unscheduled-tab.tsx` | 30 | `<TripCover name={trip.name} showCity={false} style={{ width: 100, minHeight: 100 }} />` | `coverImageUrl={trip.coverImageUrl}` |
| 5 | `mobile-upcoming-tab.tsx` | 36 | `<TripCover name={trip.name} showCity={false} style={{ width: 100, minHeight: 100 }} />` | `coverImageUrl={trip.coverImageUrl}` |
| 6 | `mobile-active-tab.tsx` | 48 | `<TripCover name={trip.name} country="" metaTag={statusLabel} showCity style={{ minHeight: 160 }} />` | `coverImageUrl={trip.coverImageUrl}` `destinationCountry={trip.destinationCountry}` |
| 7 | `mobile-past-tab.tsx` | 33 | `<TripCover name={trip.name} showCity={false} style={{ width: 80, minHeight: 80 }} />` | `coverImageUrl={trip.coverImageUrl}` |
| 8 | `page-client.tsx` | 135 | `<TripCover name={trip.name} country="" metaTag={heroStatusLabel} showCity={false} style={{ minHeight: 260 }} />` | `coverImageUrl={trip.coverImageUrl}` `destinationCountry={trip.destinationCountry}` |
| 9 | `trip-hero.tsx` | 37 | `<TripCover name={name} country={`${countryCode} · DAY ${dayN} OF ${dayTotal}`} metaTag="ACTIVE TRIP · OFFLINE" showCity={false} style={{ minHeight: 260 }} />` | `coverImageUrl={coverImageUrl}` (add prop to TripHeroProps) |

**Note on TripHero:** `TripHero` receives individual props, not a `Trip` object. It must accept a new `coverImageUrl?: string` prop and pass it through to `TripCover`. The call site in `page-client.tsx` must pass `coverImageUrl={trip.coverImageUrl}` and `destinationCountry={trip.destinationCountry}` to TripHero (or to TripCover directly, whichever is more appropriate — TripHero wraps TripCover, so thread it through TripHero).

**Alternative approach for TripHero:** Since TripHero only renders TripCover and adds a scrim + info overlay, an alternative is to pass `coverImageUrl` and `destinationCountry` directly to TripCover inside TripHero, rather than threading them through TripHero's props. This keeps TripHero's interface clean:
```tsx
// In trip-hero.tsx — TripHero passes coverImageUrl to TripCover
// But it doesn't necessarily need to receive it as a prop if the caller
// passes it to TripCover directly... but TripCover is inside TripHero.
```
Thread through TripHero is required since TripCover is rendered inside TripHero. Add to TripHeroProps.

---

### `TripCover` Test File — `trip-cover.test.tsx` (NEW)

Location: `src/components/packt/trip-cover.test.tsx`

```ts
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TripCover } from "./trip-cover";

// Mock next-themes
vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));

// Mock lucide-react icon components — only need to verify they render
vi.mock("lucide-react", () => {
  const mockIcon = () => <div data-testid="lucide-icon" />;
  return {
    Plane: mockIcon,
    Map: mockIcon,
    Compass: mockIcon,
    Camera: mockIcon,
    // ... other icons can be plain mock
  };
});

describe("TripCover", () => {
  it("renders gradient when no coverImageUrl", () => {
    const { container } = render(<TripCover name="Tokyo" />);
    // Should render the gradient wrapper with stripes
    expect(container.querySelector(".cover-stripes")).toBeInTheDocument();
    expect(container.querySelector("img")).not.toBeInTheDocument();
  });

  it("renders img when coverImageUrl is a standard URL", () => {
    render(<TripCover name="Tokyo" coverImageUrl="https://images.unsplash.com/photo-123" />);
    const img = document.querySelector("img");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "https://images.unsplash.com/photo-123");
    expect(img).toHaveStyle({ objectFit: "cover" });
    // Stripes should NOT render over a photo
    expect(document.querySelector(".cover-stripes")).not.toBeInTheDocument();
  });

  it("renders SVG graphic when coverImageUrl is a graphic: string", () => {
    render(<TripCover name="Tokyo" coverImageUrl="graphic:var(--accent-brand)/plane" />);
    // Should NOT render <img>
    expect(document.querySelector("img")).not.toBeInTheDocument();
    // Should render the icon component
    expect(screen.getByTestId("lucide-icon")).toBeInTheDocument();
  });

  it("falls back to gradient on img onError", () => {
    render(<TripCover name="Tokyo" coverImageUrl="https://example.com/broken.jpg" />);
    const img = document.querySelector("img")!;
    // Trigger onError
    img.dispatchEvent(new Event("error"));
    // After error, img should be gone, gradient fallback should show
    expect(document.querySelector("img")).not.toBeInTheDocument();
    expect(document.querySelector(".cover-stripes")).toBeInTheDocument();
  });

  it("renders stripes overlay in DOM for gradient mode", () => {
    const { container } = render(<TripCover name="Tokyo" />);
    expect(container.querySelector(".cover-stripes")).toBeInTheDocument();
  });

  it("shows destinationCountry in city overlay when provided", () => {
    render(<TripCover name="Tokyo" destinationCountry="Japan" />);
    expect(screen.getByText("Japan")).toBeInTheDocument();
  });
});
```

**Important test notes:**
- The `next-themes` mock is needed because the component uses `useTheme`
- The lucide-react mock provides a minimal mock that renders a test ID
- For `onError`, dispatch a real DOM event on the `<img>` element
- Tests must not break existing test mocks (page-client.test.tsx mocks TripCover with minimal props — that mock doesn't need to change since it only destructures `name` and `metaTag`)

---

### Previous Story Intelligence (Story 1.3)

**Key learnings that apply here:**

1. **`parseGraphicCover`** exists in `src/lib/utils.ts` (line 105) — parses `graphic:{color}/{icon}` format into `{ color, icon }` or `null`
2. **`GRAPHIC_COVER_COLORS`** and **`GRAPHIC_COVER_ICONS`** are exported constants (lines 119-152) — used for graphic cover generation and rendering
3. **Graphic cover icons** map to Lucide named exports via PascalCase conversion (`plane` → `Plane`, `tent-tree` → `TentTree`, `map-pin` → `MapPin`, etc.)
4. **`Trip` type already has** `coverImageUrl`, `destinationCountry`, `destinationCountryCode`, `destinationName` (added in Story 1.1)
5. **No hardcoded hex/rgb** rule applies — use CSS variable references like `var(--accent-fg)` for icon colors
6. **`cn()`** from `@/lib/utils` for className merging — no string concatenation
7. **Lucide icons** use `strokeWidth={1.5}` always
8. **`"use client"`** must be the very first line of any interactive component

**Patterns established in Story 1.3:**
- Colocated test files (`*.test.tsx` next to source)
- `vi.mock` for module mocking at top of test file
- `vi.useFakeTimers` pattern (not needed here since no debounce)
- DOM event dispatch for simulating `onError`

---

### Git Intelligence

Recent commits:
```
9d124db Merge pull request #37: Story 1.3 — destination autocomplete auto-cover
9e18f14 add unsplash key example
fe7ada4 docs(bmad): record story 1.3 review findings and update sprint status
e0db64d feat(trips): implement destination autocomplete and auto-cover on create
17e00c9 add mapbox skills
```

**Key patterns:**
- Stories are PR-merged (`feat:` prefix for features)
- Review findings are committed alongside the feature
- BMad docs are tracked as docs commits
- Story files are in `_bmad-output/`

---

### Architecture Compliance

**Stack alignment:**
- React 19.2.4, Next.js 16.2.4 (App Router)
- TypeScript strict mode — no `any`, no single-letter vars
- Tailwind CSS v4 — no arbitrary values; use inline styles for dynamic values
- Lucide icons — `strokeWidth={1.5}` always
- All domain types from `src/data/types.ts`

**Component conventions:**
- `"use client"` at top of every interactive component
- Explicit `ComponentNameProps` interface before function
- `cn()` from `@/lib/utils` for className merging
- Props destructured in function signature
- No string concatenation for classNames

**Styling rules:**
- Colors via CSS custom properties only — no hardcoded hex/rgb
- Tailwind for static layout; inline `style` for dynamic values
- `var(--accent-fg)` for icon color on graphic covers (white/light icon on colored background)
- `var(--cover-scrim)` for the scrim overlay on photo covers (already defined at `globals.css` line 99)

**Testing requirements:**
- Colocated test file: `trip-cover.test.tsx`
- Coverage enforced: `src/components/packt/**` requires ≥95% lines/functions, ≥90% branches
- New component must be fully tested
- Do NOT re-mock `next/navigation` or `next/headers` — already in `vitest.setup.mts`

### Library/Framework Requirements

All libraries are already in the project:
- `lucide-react` ^1.14.0 — for graphic cover icons
- `next-themes` ^0.4.6 — for dark mode detection
- `@/lib/utils` — for `cn()`, `parseGraphicCover()`
- `@/lib/trip-tints` — for `getTint()` (existing gradient behavior)
- `vitest` + `@testing-library/react` — test framework

No new dependencies needed.

### Regression Risks

1. **`page-client.test.tsx` mocks TripCover** (line 24-31): The mock destructures `{ metaTag, name }` — this mock will still work because the new props are optional and simply won't be passed. **No change needed.**

2. **`TripCoverProps` backward compatibility:** All new props (`coverImageUrl`, `destinationCountry`) are optional (`?:`). Existing call sites that don't pass them will continue to work with gradient-only behavior. **Zero risk.**

3. **`TripCover` `country` prop vs `destinationCountry`:** The existing `country` prop is used for metadata text (e.g., "3 DAYS", ""). The new `destinationCountry` is the actual geographic country name. Both can coexist. In call sites that currently pass `country=""` (page-client.tsx, mobile-active-tab.tsx), the `destinationCountry` now provides the real country name.

4. **Graphic cover icon rendering:** All icon names in `GRAPHIC_COVER_ICONS` are Lucide icon names. The PascalCase conversion produces valid Lucide exports (verified against Story 1.3 patterns). **Low risk.**

5. **`onError` state:** Using `useState` for `imgError` means the component will re-render when an image fails. The `imgError` state is local — it resets if the component remounts (e.g., navigating away and back). This is correct behavior — a transient network error shouldn't permanently break the cover.

6. **Stripes shown on photo covers:** The stripes overlay should NOT render when a photo cover is displayed (it would visually interfere with the image). Control with `{!isPhoto && <div className="cover-stripes" />}`. **Critical to implement correctly.**

7. **`TripHero` prop threading:** TripHero needs a new `coverImageUrl` prop. The caller (`page-client.tsx`) passes `trip.coverImageUrl` to TripHero. Without this, the trip detail page won't show the photo cover. **Must not miss this.**

### References

- [Source: `_bmad-output/epics-cover-image.md` lines 231-265] — Story 1.4 ACs
- [Source: `_bmad-output/1-3-destination-autocomplete-and-auto-cover-on-create.md`] — Previous story dev notes, graphic cover constants, deriveGraphicCover patterns
- [Source: `src/components/packt/trip-cover.tsx`] — Current TripCover implementation (86 lines, 3 props)
- [Source: `src/lib/utils.ts` lines 105-117] — `parseGraphicCover()` implementation
- [Source: `src/lib/utils.ts` lines 119-165] — `GRAPHIC_COVER_COLORS`, `GRAPHIC_COVER_ICONS`, `deriveGraphicCover`
- [Source: `src/lib/trip-tints.ts`] — `getTint()` for gradient generation
- [Source: `src/app/globals.css` lines 271-289] — Current cover stripes implementation
- [Source: `src/data/types.ts` lines 336-367] — `Trip` interface with `coverImageUrl`, `destinationCountry` fields
- [Source: `_bmad-output/project-context.md`] — Project-wide conventions, testing requirements

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `npx vitest run 'src/components/packt/trip-cover.test.tsx'` — TripCover unit tests
- `npx vitest run 'src/app/(app)/trips/[tripId]/page-client.test.tsx' 'src/components/packt/trip-hero.test.tsx'` — Regression coverage for existing TripCover consumers
- `npm run lint` — ESLint
- `npx tsc --noEmit` — TypeScript check
- `npm run test:coverage` — Coverage check (95.24% lines, 96.00% functions, 90.22% branches)
- `npm run test:e2e` — Playwright BDD regression suite (67 scenarios passed)
- `npm run build` — Next.js production build

### Completion Notes List

- Added photo, graphic, and gradient fallback rendering paths to `TripCover`, including local image-error fallback and destination-country overlay support.
- Updated the shared cover stripes treatment and threaded `coverImageUrl` / `destinationCountry` through all required TripCover consumers.
- Added `trip-cover.test.tsx` and revalidated related trip detail tests plus full lint, typecheck, coverage, E2E, and production build checks.

### File List

- _bmad-output/implementation-artifacts/1-4-trip-cover-image-display-wiring.md
- _bmad-output/sprint-status.yaml
- src/components/packt/trip-cover.tsx
- src/components/packt/trip-cover.test.tsx
- src/app/globals.css
- src/components/packt/trip-card.tsx
- src/components/packt/now-card.tsx
- src/components/packt/trips-past-list.tsx
- src/components/packt/mobile-unscheduled-tab.tsx
- src/components/packt/mobile-upcoming-tab.tsx
- src/components/packt/mobile-active-tab.tsx
- src/components/packt/mobile-past-tab.tsx
- src/components/packt/trip-hero.tsx
- src/app/(app)/trips/[tripId]/page-client.tsx

## Change Log

- 2026-05-27: Implemented TripCover photo/graphic/fallback rendering, widened stripe styling, threaded cover props through TripCover consumers, and added unit/regression coverage.
