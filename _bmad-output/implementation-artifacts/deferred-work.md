## Deferred from: code review of 1-1-create-and-view-trip-notes (2026-08-08)

- Trip-detail header Edit/Share row causes page-level horizontal overflow at 320 CSS px with `--font-scale: 2`; measured main content width was 320px with 422px scroll width. `trip-detail-hero.tsx` is unchanged from story baseline, so address in shared trip-detail responsive cleanup.
