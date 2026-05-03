# Handoff: Packt — Travel Planner

## Overview
**Packt** is a travel-planning app concept. The design covers four primary surfaces, each in **desktop** and **mobile** layouts:

1. **Kitchen sink** — the living style guide / component library (type, color, buttons, badges, inputs, cards).
2. **Dashboard / My Trips** — home view: active trip "now" card, today's day ribbon, upcoming trips, travel history map, past trips.
3. **Trip detail** — single trip overview with itinerary, places, documents, collaborators.
4. **Day planner** — focused timeline of a single day with map, events, and notes.

The product tone is calm, editorial, and tactile — closer to a thoughtful notebook than a typical SaaS dashboard. The design supports both **light** and **dark** themes. The brand accent is **Teal** — this is the only accent that ships. CSS custom properties on `:root` drive the token system. Some bundled source files still contain a legacy `data-accent` axis from earlier exploration; treat teal as the single source of truth and ignore any other accent references.

## About the Design Files
The files in this bundle are **design references created in HTML** (React + Babel inline + CSS). They are prototypes showing intended look and behavior — **not** production code to copy directly.

## Target stack — **React + Tailwind + shadcn/ui**

Recreate these designs as a **React + TypeScript** app styled with **Tailwind CSS** and built on **shadcn/ui** primitives. Do **not** ship the bundled HTML/CSS directly. Specifically:

- Install shadcn/ui per its docs (`npx shadcn@latest init`) and add components as needed (`button`, `badge`, `input`, `avatar`, `card`, `tabs`, `tooltip`, `dropdown-menu`, `dialog`, `sheet`, `separator`, `scroll-area`).
- **Port the token system first.** Map every CSS custom property in `styles.css` (`--bg`, `--surface`, `--fg`, `--accent`, `--accent-soft`, `--accent-fg`, `--accent-ink`, `--line`, `--line-strong`, `--radius*`, `--shadow*`) into shadcn's `globals.css` under `:root` (light) and `.dark` (dark). Use shadcn's existing semantic names where they overlap (`--background`, `--foreground`, `--muted`, `--border`, `--ring`) so its primitives pick up the theme automatically.
- **Accent is Teal only.** Map shadcn's `--primary` / `--primary-foreground` / `--ring` to Packt's `--accent` / `--accent-fg` / `--accent` (Teal). No accent-switching axis — drop any `data-accent` attribute logic; just define teal values directly under `:root` (light) and `.dark`.
- **Map prototype components → shadcn equivalents:**
  - `Btn` → `<Button variant="default|outline|ghost" size="sm|default|icon">`
  - `Badge` → `<Badge variant="default|secondary|outline">` + add custom `soft` / `success` / `warning` variants via `cva`
  - `Avatar` → `<Avatar><AvatarFallback>` (initials)
  - `Input` (with leading icon) → shadcn `<Input>` wrapped in a relative div with an absolute-positioned icon
  - Mobile dashboard tabs → `<Tabs>`
  - Sidebar nav → custom (shadcn doesn't ship a sidebar primitive in v1; use plain nav semantics)
  - Trip cover, NowCard, DayRibbon, day timeline → bespoke composites — build with `<Card>` as the base shell
- Use **Tailwind utility classes** for layout/spacing; use **CSS variables** for color and typography tokens (set in `tailwind.config` under `theme.extend.colors` so utilities like `bg-surface`, `text-fg-3`, `border-line` work).
- Fonts: load Manrope, DM Sans, JetBrains Mono via `next/font` (or your loader of choice) and expose as `--font-heading`, `--font-body`, `--font-mono`.
- Icons: use **`lucide-react`** (shadcn's default). Mapping table is in `IMPLEMENTATION_NOTES.md`.

If no codebase exists yet, scaffold a Next.js (App Router) + TypeScript project, install Tailwind + shadcn, then start porting from `kitchen-sink.jsx` outward.

## Fidelity
**High-fidelity (hifi).** These mockups have final colors, typography, spacing, radii, shadows, and interaction states. Recreate them pixel-accurately, lifting exact values from the CSS files in this bundle. Layout, copy, and the data shape in `data.jsx` are intentional and should be preserved.

Imagery (trip cover photos) uses **honest striped placeholders** tinted per-destination via OKLCH — keep the placeholder treatment until real photography is sourced. Don't substitute generic stock photos; the placeholder language is part of the design.

---

## Design Tokens

All tokens live in `styles.css` under `:root` (light) and `[data-theme="dark"]`. The accent is **Teal** — port the teal values directly. The bundled `styles.css` contains historic `[data-accent="coral"]` blocks; ignore them.

### Typography
- **Heading** — `Manrope`, weights 400–800, `letter-spacing: -0.01em`, `font-weight: 600` default for headings
- **Body** — `DM Sans`, weights 400–700, base size **15px / line-height 1.55**, with `font-feature-settings: 'ss01', 'cv11'`
- **Mono** — `JetBrains Mono` for metadata labels, timestamps, "PLACEHOLDER" tags

### Color — Light theme
| Token | Value | Use |
|---|---|---|
| `--bg` | `#ffffff` | Page background |
| `--surface` | `#f6f6f4` | Cards, segmented controls |
| `--surface-2` | `#efefec` | Nested surfaces, placeholders |
| `--surface-3` | `#e6e6e2` | Strongest neutral surface |
| `--line` | `rgba(20,20,18,0.08)` | Default borders |
| `--line-strong` | `rgba(20,20,18,0.14)` | Emphasized borders, scrollbars |
| `--fg` | `#131311` | Primary text |
| `--fg-2` | `#4a4a45` | Secondary text |
| `--fg-3` | `#7a7a72` | Tertiary text / metadata |
| `--fg-4` | `#a0a098` | Quaternary / disabled |

### Color — Dark theme
| Token | Value |
|---|---|
| `--bg` | `#0e1014` |
| `--surface` | `#161922` |
| `--surface-2` | `#1d212c` |
| `--surface-3` | `#262b38` |
| `--line` | `rgba(255,255,255,0.07)` |
| `--line-strong` | `rgba(255,255,255,0.13)` |
| `--fg` | `#ecedef` |
| `--fg-2` | `#b8bbc4` |
| `--fg-3` | `#8b8f9a` |
| `--fg-4` | `#61656e` |

### Accent (Teal)
| Mode | `--accent` | `--accent-soft` | `--accent-fg` | `--accent-ink` |
|---|---|---|---|---|
| Light | `#0e8b80` | `#d6efec` | `#ffffff` | `#0a4a44` |
| Dark  | `#2bb5a6` | `rgba(43,181,166,0.14)` | `#07151a` | `#b6ece6` |

### Radii
- `--radius-sm` 6px — buttons, tags, small chips
- `--radius` 10px — inputs, badges
- `--radius-lg` 14px — cards, frames
- `--radius-xl` 20px — large hero cards

### Shadows
- `--shadow-1` — flat resting (segmented "on" state)
- `--shadow-2` — card lift (Now Card body, Trip Card hover)
- `--shadow-3` — frame / modal (desktop frame, mobile device shell)

### Spacing
The design uses a free-form spacing scale rooted in 4px increments. Common values: `4 · 6 · 8 · 10 · 12 · 14 · 16 · 20 · 24 · 32 · 40 · 48`. Container paddings on cards are typically 16–20px; section gaps 24–32px.

---

## Screens / Views

> Layout details below describe **desktop** unless noted. Each screen also has a mobile counterpart in the corresponding `*.jsx` file. Inspect that file for the mobile structure — it's typically a single-column rearrangement of the same content with a top status bar, header, tabs, scroll body, and bottom tabbar.

### 1. Kitchen Sink (`kitchen-sink.jsx` / `.css`)
**Purpose:** Living style guide. Reference this when implementing component primitives.

**Sections (top to bottom):**
- Color tokens grid (light/dark swatches with hex values)
- Type scale specimens (Manrope display, body, mono)
- Buttons — primary, outline, ghost, icon-only; sizes sm/md
- Badges — default, soft, outline, success/warning (with dot)
- Inputs — text, with leading icon, search
- Avatars — sizes sm/md, initials, color-tinted
- Cards — base, with cover image, with metadata grid
- Trip cover placeholder demo (striped, per-destination tinted)

**Implementation:** Build these as your shared component library first. Names used in the prototype: `Btn`, `Badge`, `Avatar`, `Input`. Variants are passed via a `variant` prop and sizes via `size`.

### 2. Dashboard / My Trips (`dashboard.jsx` / `.css`)
**Purpose:** Home view — orient around the currently-active trip, glance at today, scan upcoming and past trips, see the world map of travel history.

**Desktop layout:**
- **Sidebar** (fixed left, ~240px wide, scrollable):
  - Brand row (`Packt` logomark)
  - Workspace nav: Trips (with count), Search, Map, World map
  - Pinned trips: small color square + name + chip (e.g. `D5`, `21d`)
  - Account: Profile, Settings
  - Footer: avatar + "Maya R. / maya@packt.local" + overflow button
- **Main column** (flex 1, scroll body):
  - **Topbar:** crumb "My trips" + sub `04.28.2026 · 4 trips · 5 past`, search input (280px), notification bell, primary "+ New trip"
  - **NowCard** — full-width card. Cover (220px tall, destination-tinted stripe placeholder, `ACTIVE TRIP` meta tag, big city/country block). Body has heading row (label `● ACTIVE TRIP · DAY 5 OF 7`, h2 `Tokyo, Japan`, subdate), action row (Share icon, Open trip outline, primary Today w/ pin icon), chips row (Offline pill in accent-soft, "9 places", "12 docs", avatar stack), 4-column metadata grid (Where / Weather / Local time / Next event)
  - **DayRibbon** — sticky horizontal strip. Left: clickable date tile `28 / Apr · DAY 5`. Right: scrolling list of events (time + name + category, `now` state highlighted with accent ring, `done` state at 0.55 opacity, separated by chevron arrows), trailing `+` button
  - **Section: Upcoming** — header (h2 + count `3 TRIPS · NEXT IN 21 DAYS` + segmented Cards/List + sort by Date). 3-column grid of TripCards + a "Start a new trip" dashed card
  - **Section: Travel history** — header + WorldMini block (stat sidebar with Cities/Countries/Days, Open world map button)
  - **Section: Past trips** — table-like list rows: thumb + name/country + date + days + Past badge + overflow

**TripCard structure:** cover (160px), body with heading row (name + soft "in 21d" badge), meta row (calendar/days, doc count, users), footer (avatar stack + `Open →` mono hint).

**Mobile layout (`MobileDashboard`):**
- Status bar (9:41, wifi, battery)
- Header: h1 "Trips", sync state line ("Synced offline · 4 trips" with green dot), search + plus icons
- Tabs: Active / Upcoming / Past
- **Active tab:** NowMob card (cover + info: label, h2, meta row), then "Today" day strip (header + 5 event rows), Open trip button
- **Upcoming/Past tabs:** vertical stack of `mob-trip-card`s
- Bottom tabbar: Trips / Search / Map / Profile

### 3. Trip Detail (`trip-detail.jsx` / `.css`)
**Purpose:** Drill into a single trip. Surface itinerary, places, docs, collaborators in one place. Read `trip-detail.jsx` for exact section list — typical structure is a hero (cover + title + dates + collaborators + share/open actions), a sticky sub-nav (Itinerary / Places / Docs / Notes / Travel), then per-day cards listing events that link into Day Planner.

**Mobile:** single-column with a back chevron, hero, scrolling sections, and a floating "Today" CTA where appropriate.

### 4. Day Planner (`day-planner.jsx` / `.css`)
**Purpose:** Zoom into one day. Vertical timeline with time labels on the left, event blocks on the right, an inline map area, and a notes panel. Supports a `focusId` to deep-link a specific event from the dashboard ribbon.

**Mobile:** simpler vertical stack with sticky day header, a horizontal hour scroller, and tap-to-edit event sheets.

---

## Interactions & Behavior

- **View switcher (prototype chrome):** Dashboard ↔ Trip detail ↔ Day planner navigations are wired through callbacks (`onOpenTrip`, `onOpenDay`, `onBack`). In production, replace with router navigation.
- **Theme toggle:** sets `data-theme="dark"|"light"` on `<html>`. All tokens flip via CSS variables. Persist in `localStorage` or user prefs.
- **DayRibbon event click:** opens Day planner focused on that event id.
- **Segmented controls (`.seg`):** active state is a raised pill (`background: var(--bg)` + `--shadow-1`), inactive is `--fg-3` text on `--surface`.
- **Hover states:** subtle — `background: var(--surface)` rise on nav items and rows; cards don't elevate on hover (the design is calm). Buttons have a 1-step contrast bump.
- **Focus states:** standard 2px outline using `--accent`. Add to all interactive elements when porting.
- **Animations:** none scripted. Keep transitions short (`120–180ms ease-out`) on hover/state changes.
- **Offline badge:** always visible on active trip when synced; uses accent-soft pill.

## State Management

Prototype state (lift to your app's state layer):
- **Theme** (`dark: boolean`) — global, persisted
- **Active view** (kitchen / dashboard / trip / day) — router
- **Device frame** (desk / mob) — prototype-only; remove in production (use real responsive breakpoints)
- **Day-planner focus id** — route param or state passed from ribbon click
- **Mobile dashboard tab** (`Active | Upcoming | Past`) — local component state

Data shape lives in `data.jsx` — `SAMPLE_ACTIVE_TRIP`, `SAMPLE_UPCOMING`, `SAMPLE_PAST`, `WORLD_PINS`. Use these as the schema reference (field names: `id`, `name`, `country`, `status`, `startDate`, `endDate`, `dayN`, `dayTotal`, `events: [{id, time, name, cat, state}]`, etc.).

## Components Inventory

These are exported on `window.Packt_Components` (defined in `kitchen-sink.jsx`) — port them as your shared library:

- `Btn` — props: `variant ('primary'|'outline'|'ghost')`, `size ('sm'|'md')`, `icon`, `iconOnly`
- `Badge` — props: `variant ('default'|'soft'|'outline'|'success'|'warning')`, `dot`
- `Avatar` — props: `initials`, `size ('sm'|'md')`, `style` (for tint)
- `Input` — props: `icon`, `placeholder`, standard input attrs

Plus screen-specific:
- `TripCover` (`data.jsx`) — striped placeholder with destination tint, optional meta tag and city block
- `WorldMap` (`world-map.jsx`) — equirectangular world with dot pins; data in `WORLD_PINS`
- Icons (`icons.jsx`) — line-style SVG set on `window.Packt_Icons` (Suitcase, Search, Map, Globe, User, Settings, Plus, Bell, Calendar, Doc, Users, MapPin, Share, More, ChevronR, Sort, Filter, Cloud, Wifi, Sun, Moon, DownloadDone, etc.). Stroke-based, `stroke-width: 1.5`. Replace with your icon library (Lucide is the closest equivalent).

## Assets

No raster or proprietary assets are required. All visuals are CSS, SVG icons, and OKLCH-tinted placeholders. When real photography becomes available, replace `<TripCover>` with a real `<img>` while keeping the meta-tag and city overlay treatment.

## Files in this bundle

| File | What it contains |
|---|---|
| `Packt.html` | Entry — loads scripts, mounts `<App>`, hosts the prototype's view/device switcher and Tweaks panel |
| `styles.css` | Global tokens (colors, type, radii, shadows), reset, app shell, prototype chrome, frames, placeholder/cover treatments |
| `kitchen-sink.css` / `.jsx` | Style guide + shared component definitions (`Btn`, `Badge`, `Avatar`, `Input`) |
| `dashboard.css` / `.jsx` | Dashboard / My Trips — desktop + mobile |
| `trip-detail.css` / `.jsx` | Trip detail — desktop + mobile |
| `day-planner.css` / `.jsx` | Day planner — desktop + mobile |
| `data.jsx` | Sample trip data + `TripCover` placeholder + world pin coordinates |
| `icons.jsx` | Inline SVG icon set |
| `world-map.jsx` | Equirectangular world map SVG component |
| `tweaks-panel.jsx` | Prototype-only Tweaks panel — **do not port to production** |

## Getting started — suggested order

1. **Port tokens.** Drop `:root` and `[data-theme="dark"]` blocks from `styles.css` into your global stylesheet. Wire theme + accent switching to `<html data-theme data-accent>`.
2. **Port primitives.** Build `Btn`, `Badge`, `Avatar`, `Input` against the tokens. Verify against Kitchen Sink.
3. **Port `TripCover`** as a placeholder component until real photos exist.
4. **Build Dashboard desktop**, then mobile. The NowCard + DayRibbon pair is the most opinionated piece — get that right first.
5. **Build Trip Detail**, then **Day Planner**.
6. Replace the prototype chrome (`proto-bar`, view switcher, device frame) with your real router and responsive breakpoints.

## Notes

- **No copyrighted UI is being recreated.** Packt is an original concept created in this design exploration.
- The Tweaks panel and its persistence machinery (`__edit_mode_*` postMessages, `tweaks-panel.jsx`) are prototype-environment only. Strip them from the production port.
- Trip cover photos are intentionally placeholders. The OKLCH tinting per destination is part of the design language; preserve it as a real-photo loading state.
