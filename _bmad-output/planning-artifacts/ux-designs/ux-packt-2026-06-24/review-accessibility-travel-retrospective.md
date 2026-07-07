# WCAG 2.1 AA Accessibility Review — Travel Retrospective Additions

Scope: NEW Travel Retrospective content only (Spending view IA row, new Component Patterns rows,
4 new State Patterns rows, 3 new Accessibility Floor bullets, Flow 3 in EXPERIENCE.md; DESIGN.md's
`chart-card` / `headline-figure` / `donut-chart` / `category-donut-palette` / `budget-adherence-donut`
/ `bar-chart-time` components and the updated Do's/Don'ts). Pre-existing Budget tab content is out of
scope (already reviewed).

Verified against the live token system at `src/app/globals.css` — there are currently **no
`--chart-N` CSS custom properties defined anywhere in the codebase** (light or dark theme).

## BLOCKING

1. **Color-blind-safe chart palette is asserted, not specified (`category-donut-palette`, DESIGN.md
   L80-81, L108).** The spine says the 11-segment palette "extends shadcn's chart-N CSS variable
   convention" but shadcn's default `chart-1`..`chart-5` are not defined in this codebase at all, and
   the spine stops at 5 (shadcn default) vs. the 11 segments this feature needs — it never says how
   the additional 6 are derived (same hues at different lightness? a second qualitative ramp?). With
   11 categories, hue alone cannot stay distinguishable for deuteranopia/protanopia (red-green
   confusion collapses several hues at this count) and the spine has no requirement that adjacent
   legend entries differ in lightness/pattern, not just hue. "Color is secondary to the label" is true
   for *value lookup* but does not solve *segment-to-segment visual scanning* in the chart itself
   (e.g. visually distinguishing two adjacent ~9% wedges before reading the legend) — WCAG 1.4.1
   (Use of Color) is about more than "a text alternative exists somewhere"; adjacent segments sharing
   a hue family that an 8% red-green color-blind population can't tell apart is still a 1.4.1 risk
   for the chart's primary visual task. Needs: either (a) an explicit, concrete 11-step palette
   (hex values, both themes) verified against a color-blindness simulator, with a stated minimum
   perceptual-difference rule between adjacent legend-order segments, or (b) a non-color disambiguator
   in the chart itself (e.g. segment border strokes, hatch/pattern fill, or direct on-segment labels
   for every segment ≥ some share, not just "where space allows").

2. **No defined `--chart-N` tokens exist in `globals.css` — contrast is unverifiable.** DESIGN.md
   L94 carries forward a real contrast calculation for `warning` against `surface-2` (3.18:1, passing
   WCAG 1.4.11 non-text contrast with little headroom) for the *Budget tab* tokens, but the new
   Travel Retrospective section does the same diligence for `accent-brand` / `warning` / `destructive`
   reused as `budget-adherence-donut` segments (DESIGN.md L82-85, L95, L109) and is silent on the new
   chart-only colors entirely. Donut/bar segments must clear 3:1 against the `chart-card` surface
   background (WCAG 1.4.11 non-text contrast, since a segment's boundary/shape is the information
   being conveyed) and, where any in-segment text/center-figure sits on a segment fill, 4.5:1 (1.4.3).
   None of the as-yet-undefined 11 category colors, nor confirmation that `accent-brand` /`warning`/
   `destructive` clear 3:1 against `chart-card`'s `surface` background (vs. the Budget tab's
   `surface-2` track, a different background), have been checked. This can't be implemented or
   audited until the actual hex/oklch values exist — currently a placeholder citation to "shadcn's own
   convention," not a value.

3. **Chart accessible name/structure unspecified for the underlying SVG/canvas.** EXPERIENCE.md
   L99 and L114-115 require chart data to be available as text (good) and the donut center text to
   be a real DOM text node (good), but nothing specifies the *chart element's own accessible name* —
   e.g. each `chart-card`'s outer chart graphic needs `role="img"` + `aria-label` (or an
   `aria-labelledby` pointing at the card's heading) summarizing what it shows ("Spending by category,
   donut chart"), per WCAG 1.1.1 / 4.1.2 (Name, Role, Value) and SVG accessibility practice (if the
   chart renders as inline SVG, decorative sub-elements need `aria-hidden`, while the figure itself
   needs an accessible name — most chart libraries don't provide this by default). Without this, a
   screen reader user landing on a `chart-card` either hears nothing meaningful for the graphic or
   hears the raw SVG/canvas fallback, even though the legend/figures below are individually fine.
   Add a Component Patterns/Accessibility Floor line requiring each `chart-card`'s chart graphic to
   carry `role="img"` (or equivalent) and an `aria-label`/`aria-labelledby` naming what it shows.

## NOTE (non-blocking, should be addressed but not implementation-blocking)

4. **Spending view date filter keyboard operability is described but not fully spec'd for
   announcement.** EXPERIENCE.md L98 covers open/arrow/select/Esc mechanics (good — meets 2.1.1
   keyboard operable) but doesn't say how the *result* of changing the filter is announced to a
   screen reader user. Per State Patterns (EXPERIENCE.md L64), "changing it recomputes every figure
   and chart below it" — for a sighted user this is an obvious visual refresh, but a screen reader
   user gets no cue that 3 figures + 4 charts just changed unless there's a live region or the focus
   return after selection lands somewhere that makes the update discoverable. Recommend an
   `aria-live="polite"` region (or moving focus to the updated headline-figure region) announcing the
   active filter / a one-line summary after each change. Not blocking since this is a common SPA gap
   with cheap standard remediation, not a structural defect in this spine.

5. **Focus order across the 4 stacked chart cards is implicit, not stated.** The Spending view header
   (EXPERIENCE.md L64-69) lists chart order (category → budget adherence → bar chart → destination)
   matching DOM/visual order, which is sufficient for 2.4.3 (Focus Order) IF nothing inside a
   `chart-card` is independently focusable. EXPERIENCE.md L99 confirms chart elements aren't
   independently focusable beyond the library default, which mostly closes this gap — but the spine
   never states whether the `chart-card` legend entries (which carry the primary color-blind-safe
   signal) are themselves focusable/interactive (e.g. hover-to-highlight via keyboard) or purely
   static text. If legends ever become interactive (tooltip-on-focus, segment highlight), focus order
   through 4 stacked legends needs an explicit statement that it's still card-by-card, top to bottom.
   Currently low risk because legends read as static text per the current spec, but worth a one-line
   confirmation once implemented.

6. **`fg-4` "Unknown" segment contrast not checked against the donut's own surface.** DESIGN.md L79
   and L107 reuse `fg-4` for the "Unknown" destination segment, consistent with the muted-neutral
   convention used elsewhere — but `fg-4` is a *text/foreground* token (`#a0a098` light / `#61656e`
   dark) being repurposed as a *segment fill*. Its adjacency to `chart-card`'s `surface` background
   and to whichever of the as-yet-undefined category-palette colors sit next to it in the ring has
   not been checked for 3:1 segment-boundary contrast (WCAG 1.4.11). Likely fine given how muted
   `fg-4` already is relative to `surface`, but should be confirmed once item 2's palette values are
   finalized, not assumed.

## Verdict

**BLOCKING — do not proceed to implementation-ready story/plan status for the Travel Retrospective
chart work until findings 1–3 are resolved.** Findings 1 and 2 share a root cause: the
`category-donut-palette` component is specified at the level of "reuse an existing convention" when
no such convention (chart-N tokens) actually exists in this codebase yet, so there is nothing concrete
to implement or audit against. Finding 3 is a distinct, separately fixable gap (accessible name for
the chart graphic itself). Findings 4-6 are NOTE-level — common, cheaply remediated SPA/chart patterns
that should be tightened before or during implementation but don't block moving the spine forward.
