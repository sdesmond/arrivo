# Backlog of items

## Style

## shadcn updates

### proper sidebar

use https://ui.shadcn.com/docs/components/base/sidebar as an example. The current sidebar does not follow the proper pattern from shadcn. Update the sidebar to follow the pattern at the provided URL.

### breadcrumb

use proper breadcrumbs as shown at https://ui.shadcn.com/docs/components/base/breadcrumb

## Improvements

### move events across days

We need a way to move events across days. Currently shortening a trip can leave events in a unscheduled bucket but there is no way to get them out into a scheduled day.

### Add Zod

Is it worth adding Zod for validation?

## Tooling

### Smarter affected-E2E selection

`scripts/affected-e2e.mjs` picks E2E scenarios from a hand-written glob map (`tests/e2e/feature-map.mjs`). The map is either too broad (one `SHARED_GLOBS` hit runs the whole suite) or quietly out of date (an unmapped file runs nothing). The first round of fixes (per-file `src/lib` and API mapping, dropping type-only diffs, letting the map scope its own edits) cut full-suite runs over the last 200 `main` commits from 72 to 59. What still triggers most full runs: `src/db/**` (14), `package.json`/lock (19), the `(app)` layout and the trip page-clients (20), and the E2E fixtures (10). The ideas below go after that remainder and after the cost of keeping the map up to date. There is no nightly job: the full suite stays a manual run (`npm run test:e2e`).

#### A. Work out the map from the import graph (main change)

- Build a reverse-dependency graph of `src/**` with the TypeScript compiler API, so `@/` aliases, `index` files and re-exports resolve the same way `tsc` resolves them. `dependency-cruiser` is the off-the-shelf alternative.
- Starting from each changed file, walk up through the files that import it until reaching entry points: `page.tsx`, `page-client.tsx`, `route.ts`, `actions.ts`, `layout.tsx`.
- Each feature lists the routes it visits. This can be read straight from `page.goto(...)` and URL assertions in `tests/e2e/steps/*.steps.ts`, with a small manual override per entry. Changed entry points → routes → `@feat:` tags.
- Skip `import type` edges, so `src/data/types.ts` only reaches the files that use its runtime constants.
- A walk that reaches a root `layout.tsx` or the `(app)` layout runs the full suite. That one rule replaces most of `SHARED_GLOBS`.
- The hand-written map shrinks to things the graph can't see: Dockerfile and env, CSS, the E2E fixtures and mothers, and SQL migrations.
- Known gaps: dynamic `import()` with computed paths, and features that depend on middleware (`src/proxy.ts`), which stays global.
- Before switching, replay the last 200 commits (as was done to measure the first round of fixes) and compare the graph's picks against the current map's.
- Keep `feature-map.test.mjs`'s "every file is classified" guard, so a file the graph can't reach is reported instead of silently running nothing.

#### C. Narrow selection by symbol inside hub files

The import graph works per file, so a one-line edit to a busy file still reaches every importer. For the busiest ones (`src/lib/queries.ts`, `src/db/schema.ts`, `src/lib/db-mappers.ts`, `src/lib/activity-labels.ts`):

- Compare the old and new versions with the TS compiler API and list the exports whose emitted body changed.
- Use the language service's find-references to follow only those exports up the graph (it plugs into A's walk).
- `schema.ts`: map changed table definitions to the query and action files that import those tables. A migration under `drizzle/` with no table-specific mapping still runs the full suite.
- `package.json`: a diff limited to `scripts`/`devDependencies` for test or lint tools runs nothing. A runtime dependency bump stays on the full suite.
- Fallback: if symbol analysis fails (parse error, or a default export that changed shape), use file-level selection.

#### D. Smoke set plus affected scenarios as the gate

Makes aggressive selection safe without a nightly job:

- Tag about 5 core scenarios `@smoke`: sign in, create trip, open trip detail, add an event, upload a document. Always run them alongside the affected set, so a missed edge in the graph or map still hits the main paths. That is roughly 30–60 s on top of a scoped run.
- In `run-e2e.mjs`, a NONE result for a runtime change (not docs or unit tests only) runs `@smoke` instead of nothing.
- Pre-PR: `build-validator` keeps running affected plus smoke. Before opening a PR into `main`, print a reminder to run the full suite (or offer to start it) rather than running it automatically.
- Later, if CI minutes allow: a sharded full-suite job on PRs into `main` only, not story branches.
