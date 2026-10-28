# Browser test isolation

Run `npm run test:e2e:affected` for browser coverage selected by current changes. Run `npm run test:e2e` when you want every feature.

Set `E2E_DATABASE_URL`, `E2E_USERNAME`, and `E2E_PASSWORD` in `.env`. Use a dedicated PostgreSQL database; the runner resets and migrates test databases before every run.

First-run admin scenarios use a separate instance so their initialization changes cannot redirect other scenarios away from sign-in. The runner derives a sibling database by appending `_bootstrap` to the database name in `E2E_DATABASE_URL`, preserving credentials and connection options. For example, `arrivo_e2e` uses `arrivo_e2e_bootstrap` for bootstrap scenarios. The source database name must be explicit, use letters, numbers, underscores or dashes, and fit PostgreSQL's 63-byte limit with the suffix.

The runner creates the sibling database if missing. Either give the test role `CREATEDB`, or create the derived database beforehand with that role as owner. Existing derived databases do not require `CREATEDB`. Neither database may contain data you want to keep.

Normal browser tests use port 3001, `.next-e2e`, and `.e2e-storage`. Bootstrap tests use port 3002, `.next-e2e-bootstrap`, and `.e2e-bootstrap-storage`. Both instances keep scenario-owned fixtures and cleanup; ordinary features retain parallel workers. Port 3002 is reserved for bootstrap testing.
