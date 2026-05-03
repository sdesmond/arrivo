# Implementation Notes — Packt

Companion to `README.md`. This file is the gritty stuff: exact CSS values, component anatomy, edge cases, and gotchas. Pair it with the screenshots in `/screenshots`.

---

## Target stack: React + Tailwind + shadcn/ui

This implementation MUST use **shadcn/ui** as the primitive library. Don't write your own buttons, badges, dialogs, etc. from scratch.

### Setup

```bash
npx shadcn@latest init
npx shadcn@latest add button badge input avatar card tabs tooltip dropdown-menu dialog sheet separator scroll-area
```

### Token mapping — Packt → shadcn `globals.css`

shadcn ships with its own semantic tokens (`--background`, `--foreground`, `--primary`, `--muted`, `--border`, `--ring`, etc.). Override them so shadcn primitives auto-theme. Add the **Packt-specific** tokens (`--surface-2`, `--surface-3`, `--fg-2`, `--fg-3`, `--fg-4`, `--line-strong`, `--accent-soft`, `--accent-ink`) alongside.

```css
@layer base {
  :root {
    /* shadcn semantic */
    --background: 0 0% 100%;             /* #ffffff */
    --foreground: 60 6% 8%;              /* #131311 */
    --card: 0 0% 100%;
    --card-foreground: 60 6% 8%;
    --popover: 0 0% 100%;
    --popover-foreground: 60 6% 8%;
    --primary: 175 80% 30%;              /* teal #0e8b80 — accent flips this */
    --primary-foreground: 0 0% 100%;
    --secondary: 60 6% 96%;              /* surface */
    --secondary-foreground: 60 6% 8%;
    --muted: 60 6% 96%;
    --muted-foreground: 60 4% 47%;       /* fg-3 */
    --accent: 60 6% 94%;                 /* surface-2 (different concept than Packt accent!) */
    --accent-foreground: 60 6% 8%;
    --destructive: 8 86% 58%;
    --destructive-foreground: 0 0% 100%;
    --border: 60 5% 90%;                 /* line */
    --input: 60 5% 90%;
    --ring: 175 80% 30%;                 /* matches --primary */
    --radius: 0.625rem;                  /* 10px */

    /* Packt extras */
    --surface: #f6f6f4;
    --surface-2: #efefec;
    --surface-3: #e6e6e2;
    --line: rgba(20, 20, 18, 0.08);
    --line-strong: rgba(20, 20, 18, 0.14);
    --fg: #131311;
    --fg-2: #4a4a45;
    --fg-3: #7a7a72;
    --fg-4: #a0a098;
    --accent-soft: #d6efec;
    --accent-ink: #0a4a44;

    --font-heading: 'Manrope', ui-sans-serif, system-ui, sans-serif;
    --font-body: 'DM Sans', ui-sans-serif, system-ui, sans-serif;
    --font-mono: 'JetBrains Mono', ui-monospace, Menlo, monospace;
  }

  .dark {
    --background: 220 20% 7%;
    --foreground: 220 8% 93%;
    /* ...etc, port from styles.css [data-theme="dark"] block */
    --surface: #161922;
    --surface-2: #1d212c;
    /* ... */
  }

  /* Accent is Teal — single source of truth, no switching axis */
  .dark {
    --primary: 173 62% 44%;               /* #2bb5a6 */
    --accent-soft: rgba(43, 181, 166, 0.14);
    --accent-ink: #b6ece6;
    /* + dark-mode overrides for --background, --foreground, --surface*, --line*, etc. */
  }
}
```

> **Naming caveat:** shadcn's `--accent` is a *neutral surface tint* (used by `accent-foreground` for hover states), not a brand color. Packt's `--accent` is the **brand teal** — that maps to shadcn's `--primary`. Don't conflate them. Keep both: shadcn `--accent` for surface tints, and `--primary` for Packt's teal.

### `tailwind.config.ts`

```ts
extend: {
  colors: {
    surface:   'var(--surface)',
    'surface-2': 'var(--surface-2)',
    'surface-3': 'var(--surface-3)',
    line:      'var(--line)',
    'line-strong': 'var(--line-strong)',
    fg:        'var(--fg)',
    'fg-2':    'var(--fg-2)',
    'fg-3':    'var(--fg-3)',
    'fg-4':    'var(--fg-4)',
    'accent-soft': 'var(--accent-soft)',
    'accent-ink': 'var(--accent-ink)',
  },
  fontFamily: {
    heading: ['var(--font-heading)'],
    body:    ['var(--font-body)'],
    mono:    ['var(--font-mono)'],
  },
  borderRadius: {
    sm: '6px',
    DEFAULT: '10px',
    lg: '14px',
    xl: '20px',
  },
  boxShadow: {
    1: 'var(--shadow-1)',
    2: 'var(--shadow-2)',
    3: 'var(--shadow-3)',
  },
}
```

### Component mapping — Packt prototype → shadcn

| Packt prototype | shadcn primitive | Notes |
|---|---|---|
| `Btn variant="primary"` | `<Button>` (default) | Uses `--primary`/`--primary-foreground` automatically |
| `Btn variant="outline"` | `<Button variant="outline">` | Match `--line-strong` border |
| `Btn variant="ghost"` | `<Button variant="ghost">` | hover `bg-surface text-fg` |
| `Btn icon iconOnly` | `<Button variant="ghost" size="icon">` | 32×32 / 28×28 for `.sm` |
| `Badge default` | `<Badge variant="secondary">` | |
| `Badge soft` | Custom variant via `cva` | `bg-accent-soft text-accent-ink` |
| `Badge outline` | `<Badge variant="outline">` | |
| `Badge success/warning` | Custom variants | green/amber tokens |
| `Avatar` | `<Avatar><AvatarFallback>{initials}</AvatarFallback>` | Tint via `style={{ background, color }}` (OKLCH per-person) |
| `Input` (with icon) | `<Input>` in a `relative` div + absolute icon | shadcn doesn't have leading-icon built-in |
| Sidebar nav-item | Plain `<button>` + `cn()` | shadcn v1 has no sidebar primitive |
| Mobile tabs | `<Tabs>` + `<TabsList>` + `<TabsTrigger>` | |
| Day Planner event details | `<Sheet>` (mobile) or inline accordion (desktop) | |
| Trip detail sub-nav | `<Tabs>` with `pills` styling override | |
| Toast / sync status | `<Toast>` from `sonner` (shadcn default) | |

### Custom Badge variants (cva recipe)

```ts
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[11.5px] font-medium leading-none",
  {
    variants: {
      variant: {
        default:  "bg-surface-2 text-fg",
        soft:     "bg-[var(--accent-soft)] text-[var(--accent-ink)] dark:text-[var(--primary)]",
        outline:  "border border-line-strong text-fg-2",
        success:  "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
        warning:  "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
      },
    },
    defaultVariants: { variant: "default" },
  }
);
```

### Icons — `lucide-react` (shadcn default)

Mapping table is in the **Iconography** section below. All sizes 14–18px in the prototype; pass `size={14}` etc. via lucide. Stroke width is 1.5 in the prototype — lucide defaults to 2; pass `strokeWidth={1.5}` for fidelity, or set globally:

```tsx
import { LucideProps } from "lucide-react";
const Icon = (props: LucideProps) => <props.icon strokeWidth={1.5} {...props} />;
```

### Project structure (suggested)

```
src/
├─ app/
│  ├─ layout.tsx           ← font loaders, theme/accent provider
│  ├─ globals.css          ← shadcn tokens + Packt extras
│  ├─ (app)/
│  │  ├─ trips/
│  │  │  ├─ page.tsx                ← Dashboard
│  │  │  ├─ [tripId]/page.tsx       ← Trip detail
│  │  │  └─ [tripId]/days/[dayId]/page.tsx  ← Day planner
│  │  └─ layout.tsx        ← Sidebar shell (desktop) / tabbar (mobile)
│  └─ kitchen-sink/page.tsx ← Optional: live style guide
├─ components/
│  ├─ ui/                  ← shadcn-generated primitives
│  ├─ packt/               ← Packt composites
│  │  ├─ trip-cover.tsx
│  │  ├─ now-card.tsx
│  │  ├─ day-ribbon.tsx
│  │  ├─ trip-card.tsx
│  │  ├─ sidebar-nav.tsx
│  │  ├─ avatar-stack.tsx
│  │  └─ world-map.tsx
│  └─ providers/
│     └─ theme-provider.tsx ← wraps next-themes, also handles accent
├─ lib/
│  ├─ utils.ts             ← cn() etc.
│  └─ trip-tints.ts        ← OKLCH tints from data.jsx
└─ data/                   ← types + sample data (port from data.jsx)
```

### Theme + Accent provider

Use `next-themes` for light/dark. Wrap it with your own accent context that writes `data-accent` to `<html>` and persists in localStorage. Don't use a single combined provider — keep them composable.

```tsx
<ThemeProvider attribute="class" defaultTheme="dark">
  <AccentProvider defaultAccent="teal">
    {children}
  </AccentProvider>
</ThemeProvider>
```

---

## Reference: Screenshots

All screenshots are 1600px wide @ 2x DPR (PNG). Filenames follow `<view>-<device>-<theme>-<accent>.png`.

**Desktop:**
- `kitchen-sink-desktop-{light,dark}-teal.png`
- `dashboard-desktop-{light,dark}-teal.png`
- `trip-detail-desktop-dark-teal.png`
- `day-planner-desktop-dark-teal.png`

**Mobile:**
- `dashboard-mobile-{light,dark}-teal.png`
- `trip-detail-mobile-dark-teal.png`
- `day-planner-mobile-dark-teal.png`

The prototype chrome (`.proto-bar`, view switcher, device frame) at the top of every screenshot is **prototype-only** — strip it when porting. The desktop "frame" you see (rounded card with shadow) is also chrome; the real desktop layout fills the viewport.

---

## Layout breakpoints (suggested)

The prototype hard-codes `desk-frame` (max-width 1320px, max-height 860px) and `mob-frame` (390×840). For production:

| Breakpoint | Width | Behavior |
|---|---|---|
| Mobile | < 768px | Single column, bottom tabbar, sticky header |
| Tablet | 768–1023px | Sidebar collapses to icons-only or a drawer |
| Desktop | ≥ 1024px | Full sidebar (240px) + main column |
| Wide | ≥ 1440px | Cap content width at ~1320px, center |

The Dashboard's Upcoming grid is **3 columns at desktop**, 2 at tablet, 1 at mobile. The NowCard becomes single-column (cover stacked above body) below ~900px.

---

## Component specs (exact)

### Btn
```
.btn {
  font: 500 13px/1 var(--font-body);
  letter-spacing: -0.005em;
  display: inline-flex; align-items: center; gap: 6px;
  padding: 0 12px; height: 32px;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  transition: background 140ms ease, border-color 140ms ease;
}
.btn.sm { height: 28px; padding: 0 10px; font-size: 12.5px; }
.btn.icon { padding: 0; width: 32px; justify-content: center; }
.btn.icon.sm { width: 28px; }

.btn.primary { background: var(--accent); color: var(--accent-fg); }
.btn.primary:hover { filter: brightness(1.05); }

.btn.outline { background: var(--bg); color: var(--fg); border-color: var(--line-strong); }
.btn.outline:hover { background: var(--surface); }

.btn.ghost { background: transparent; color: var(--fg-2); }
.btn.ghost:hover { background: var(--surface); color: var(--fg); }
```
The exact CSS lives in `kitchen-sink.css`. Match those values; don't re-derive from the screenshots.

### Badge
- `default`: `--surface-2` bg, `--fg` text
- `soft`: `--accent-soft` bg, `--accent-ink` text (in dark mode, `--accent`)
- `outline`: transparent bg, `--line-strong` border, `--fg-2` text
- `success`: green (oklch ~0.62 0.13 150) — has dot variant
- `warning`: amber (oklch ~0.72 0.15 70) — has dot variant
- All: `font: 500 11.5px var(--font-body)`, `padding: 3px 8px`, `border-radius: 999px`, uppercase letter-spacing `0.02em` for ALL CAPS variants

### Avatar
- `sm`: 22×22, `font-size: 10.5px`
- `md`: 28×28, `font-size: 12px`
- Circular, `font-weight: 600`, monogrammed initials
- Tinted via `style={{ background: 'oklch(...)', color: 'oklch(...)' }}` per-person — see `dashboard.jsx` for the OKLCH formula (lightness 0.86 for tint, 0.30 for ink, varying hue)
- Avatar stack: `display: flex`, negative `margin-left` of −6px on every child after the first; each avatar gets `border: 2px solid var(--bg)` to read as overlapping

### Input
```
.input { 
  height: 34px; padding: 0 12px;
  background: var(--surface); border: 1px solid transparent;
  border-radius: var(--radius);
  font: 500 13px var(--font-body); color: var(--fg);
}
.input:focus { background: var(--bg); border-color: var(--line-strong); outline: none; }
.input.with-icon { padding-left: 32px; }
```
Leading icons sit at left:10px, top:50%, translateY(-50%), color `--fg-3`.

---

## Specific composite components

### NowCard (Dashboard active trip)
The most opinionated piece. Anatomy:

```
┌──────────────────────────────────────────────────────────┐
│  Cover (220px, full width, stripe placeholder + tint)    │
│  [ACTIVE TRIP meta tag] (top-left)                       │
│  [Tokyo / JPN · DAY 5 OF 7] (bottom-left, large)         │
├──────────────────────────────────────────────────────────┤
│  Body — 24px padding                                     │
│                                                          │
│  ● ACTIVE TRIP · DAY 5 OF 7         [Share][Open][Today] │
│  Tokyo, Japan        ↑ heading row, h2 36px, fg          │
│  Apr 24 — May 1, 2026                                    │
│                                                          │
│  [Offline pill] [9 places] [12 docs]    [MR][JK]         │
│                                                          │
│  ┌─────────┬─────────┬─────────┬──────────┐              │
│  │ Where   │ Weather │ Time    │ Next     │  meta-grid   │
│  │ Tokyo…  │ 19°C    │ 14:08   │ 17:30    │  4 columns   │
│  │ small   │ small   │ small   │ small    │              │
│  └─────────┴─────────┴─────────┴──────────┘              │
└──────────────────────────────────────────────────────────┘
```

**Style notes:**
- `border-radius: var(--radius-lg)` (14px), `box-shadow: var(--shadow-2)`, `border: 1px solid var(--line)`
- Cover min-height 220px; below 900px viewport, the cover stacks above the body (body min-height auto)
- The `● ACTIVE TRIP` LED dot: 6px circle, `background: var(--accent)`, with a subtle pulse: `box-shadow: 0 0 0 0 var(--accent); animation: pulse 1.6s ease-out infinite` (optional; the prototype omits the keyframes — feel free to add)
- meta-grid: `display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--line)`
- `.l` (label): `font: 500 10.5px/1 var(--font-mono); letter-spacing: 0.06em; text-transform: uppercase; color: var(--fg-3)`
- `.v` (value): `font: 600 17px var(--font-heading); margin-top: 4px`
- `.small` inside `.v`: `display: block; font: 400 12px var(--font-body); color: var(--fg-3); margin-top: 2px`

### DayRibbon
Horizontal sticky strip below NowCard.
- Container: `display: flex; gap: 12px; padding: 12px; background: var(--surface); border-radius: var(--radius); border: 1px solid var(--line)`
- `.when` tile (left, fixed): 72×72, accent-soft bg, `display: grid; place-items: center`, large date (28pt heading) + small label
- `.events` (right, scrolling): horizontal scroll with `flex-wrap: nowrap`. Each `.ev` is a button: 88px wide min, padding 8 10, `border-radius: 8px`, hover surface-2
- `.ev.now`: `border: 1.5px solid var(--accent)`, `background: var(--accent-soft)`. Time line gets `color: var(--accent)`
- `.ev[done]`: opacity 0.55, name strike-through optional (prototype doesn't, mobile day strip does)
- Chevrons between events: `--fg-4`, 14px, vertically centered

### TripCard (upcoming)
- Width: 1fr in 3-col grid
- Cover: 160px, same TripCover treatment but with `UPCOMING` meta tag
- Body padding 16px, gap 10px between rows
- Heading row: name (15px heading 600) + soft "in 21d" badge right-aligned
- Meta row: 3 inline items with leading icon, 12.5px, `--fg-3`
- Foot: avatar stack (sm) + mono `Open →` hint at right (`--fg-4`, 11px)

### NewTripCard
- Same dimensions as TripCard but: `background: transparent; border: 1.5px dashed var(--line-strong)`
- Centered icon (28px circle, surface-2 bg) + title + 2-line subtitle
- Hover: border becomes `--accent`, bg `--accent-soft`

### Sidebar nav-item
```
.nav-item {
  display: flex; align-items: center; gap: 10px;
  padding: 6px 10px; border-radius: 6px;
  color: var(--fg-2); font-size: 13px; font-weight: 500;
  cursor: pointer;
}
.nav-item:hover { background: var(--surface); color: var(--fg); }
.nav-item.on { background: var(--surface-2); color: var(--fg); }
.nav-item .ico { width: 16px; height: 16px; color: var(--fg-3); flex-shrink: 0; }
.nav-item.on .ico { color: var(--accent); }
.nav-item .count { 
  margin-left: auto; font: 500 10.5px var(--font-mono);
  color: var(--fg-3); letter-spacing: 0.04em;
}
```
Section headings (`h5`) above groups: `font: 500 10.5px var(--font-mono); text-transform: uppercase; letter-spacing: 0.08em; color: var(--fg-4); margin: 16px 10px 6px`.

### Sidebar footer (avatar + identity)
Pinned to bottom, `border-top: 1px solid var(--line)`, padding 12px, flex row aligned center.

---

## TripCover (placeholder strategy)

**Don't replace with real images yet.** The placeholder treatment is intentional and beautifully tells the user "this is a draft." When real photography arrives:

1. Wrap `<TripCover>` in a component that accepts an optional `src`. If `src` exists, render `<img>` underneath the meta+city overlays. If not, render the stripe.
2. **Keep the meta tag and city block overlays** even with real photos — they're part of the travel-postcard language.
3. Match the per-destination tint from `TRIP_TINTS` in `data.jsx` to a vignette/duotone treatment when the photo loads, so the visual transition is graceful.

Tints use OKLCH: lightness 0.94 (light theme) / 0.28–0.30 (dark theme), low chroma 0.03–0.06, hue per destination. **Don't substitute hex** — OKLCH gives perceptual consistency across hues.

---

## Iconography

`icons.jsx` defines a small line-style set (stroke 1.5, round caps/joins). Names map cleanly to **Lucide React** (recommended swap):

| Packt icon | Lucide name |
|---|---|
| Suitcase | `Briefcase` or `LuggageIcon` |
| MapPin | `MapPin` |
| Globe | `Globe` |
| ChevronR | `ChevronRight` |
| Plus / Minus | `Plus` / `Minus` |
| Bell | `Bell` |
| Search | `Search` |
| Settings | `Settings` |
| User / Users | `User` / `Users` |
| Doc | `FileText` |
| Calendar | `Calendar` |
| Cloud | `Cloud` |
| Wifi | `Wifi` |
| Sun / Moon | `Sun` / `Moon` |
| Share | `Share2` |
| More | `MoreHorizontal` |
| Sort | `ArrowUpDown` |
| Filter | `Filter` |
| DownloadDone | `DownloadCloud` or custom check-arrow |

Use Lucide unless you have a strong reason not to. Match the 1.5px stroke and the `currentColor` convention.

---

## Trip Detail — anatomy summary

Read `trip-detail.jsx` end to end for the canonical structure. High-level:

1. **Back row:** chevron + "All trips" mono label
2. **Hero:** full-width cover (240–280px) with TripCover styling, overlaid title bar (city/country, dates, day counter), action buttons (Share, ⋯, primary "Day 5 · Today")
3. **Sub-nav:** sticky pills — Itinerary / Places / Docs / Notes / Travel
4. **Two-column body:**
   - **Left (main, ~720px):** day-by-day itinerary. Each day = labeled card with a vertical timeline of `place` entries. Each place row has time, name, category badge, sub-text, optional travel-to chip ("Subway · 12 min"), optional note callout, optional doc thumbnails
   - **Right rail (~320px):** mini-map, packing list, docs list, collaborators block
5. **Footer:** sibling-trip nav (← Lisbon / Oaxaca →), or "Add another day" CTA

Day cards use `--surface` background, 16px padding, and a subtle left border in `--accent` for the *current* day.

Doc previews are inline mini-pages: white sheet with mono header lines + body lines + small print, sized like a notecard. The `previewLines` array in data uses tags `h | m | b | sm` for line type.

---

## Day Planner — anatomy summary

Two-pane on desktop (timeline left, map right). One-column on mobile.

- **Timeline (left, scrollable):** vertical hour rail with hour labels (06–23). Event blocks overlap the rail at their `time`/`durMin`. A "now" line (1px accent) crosses the timeline at the current local time.
- **Event block:** colored by category (use a small fixed palette — Food, Museum, Park, View, Dinner, etc.). Title + subtitle + location, action chips below for "Open in maps" / "Notes" / "Docs."
- **Map (right):** a stylized illustrative map (in the prototype, an SVG with abstract neighborhood polygons) with numbered pins matching the timeline order. Coordinates are in the data as `{x: 0–1, y: 0–1}` ratios.
- **Notes drawer:** when an event has a `note`, it expands inline in the timeline — don't open a separate sheet on desktop.

`focusId` (passed from Dashboard ribbon click) should auto-scroll the timeline to that event and pulse-highlight it for ~1.2s.

---

## State + persistence checklist

- `theme` ∈ `{light, dark}` — `localStorage.theme`, applied to `document.documentElement`
- `activeTripId` — current trip id (route param or store)
- `dayPlannerFocusId` — optional, for deep-link from ribbon
- `mobileDashboardTab` ∈ `{Active, Upcoming, Past}` — local; survives navigation if user expects (consider URL hash)
- `pinnedTripIds: string[]` — for sidebar pinned section
- `offlineSyncedTripIds: Set<string>` — drives Offline pill on cards

---

## Accessibility notes

- All interactive elements must hit 44×44 minimum on mobile (some prototype hit areas are tighter — fix on port)
- The accent dot/LED on NowCard label (`● ACTIVE TRIP`) is decorative; the text covers the meaning
- Avatar stacks need `aria-label="Maya R., Jin K."`
- The DayRibbon scrolling list needs `role="tablist"` semantics if you treat events as tabs, or just buttons if they navigate
- Color contrast: all token pairs pass WCAG AA at body size in both themes (verify on port; spot-check `--fg-3` on `--surface` which is the tightest pair)
- `prefers-reduced-motion`: kill the LED pulse and any timeline scroll animations

---

## Things the prototype fakes (don't port)

- The `.proto-bar` chrome at the top, the segmented view switcher, the device frame switch, the Tweaks panel — all prototype scaffolding
- Hardcoded date strings (`04.28.2026`, `14:08`, `19°C`) — wire to real data
- `WORLD_PINS` coordinates are eyeballed for the equirectangular SVG; if you adopt a different projection or real map (Mapbox/MapLibre), recompute
- `<TripCover>` is a placeholder, not a final image system

---

## Quick QA checklist after first port

1. Theme toggle flips every surface (no orphaned hex codes)
3. Sidebar nav `on` state highlights icon in accent
4. NowCard meta-grid stays 4-column at ≥ 900px, collapses to 2 below
5. DayRibbon "now" event has accent border + soft bg
6. TripCard "in N days" badge uses the soft variant
7. Avatar stacks overlap correctly with bg-colored borders
8. Mobile: bottom tabbar is fixed, content scrolls under it (no clipping)
9. Mobile: status bar `9:41` row uses real time only if you want — otherwise drop it (it's a prototype detail)
10. Dark mode shadows are darker (don't reuse light shadows)
