# Changelog

## [Unreleased]

## [0.6.0] - 2026-10-31

### Upgrading

- **Docker:** the container now listens on port 4850 instead of 3550. If your compose file maps `3550:3550`, change
  it to `4850:4850`, or set `PORT=3550` to keep the old port. If you changed only the host side, for example
  `8080:3550`, change the container side to `8080:4850`. Anything else that connects to port 3550, such as a
  reverse proxy upstream, needs the same change.
- **Running from source:** run `npm run db:migrate`. Docker applies migrations on start.
- **Existing accounts:** migration `0004` refuses to run if more than one account exists. Back up your database
  and uploaded files before updating. Upgrading currently requires reducing the instance to the single account
  that should become admin; preserve other users' trips and files before deleting any accounts. The remaining
  account becomes admin automatically. There is no automatic upgrade path that preserves multiple accounts.
- **Usernames replace email addresses:** tell users to sign in with their migrated username. It comes from the
  part of their email before `@`, lowercased and sanitized, with a numeric suffix for collisions. List usernames
  with `docker exec arrivo-db psql -U arrivo -d arrivo -c "select name, username from users"`. Invitations with
  no matching account are removed during migration.
- **Registration:** remove `ALLOW_SIGNUP` from your configuration. Registration closes after the first account;
  admins add further users through Admin → Users and share setup links manually.
- **Account recovery:** replace scripts calling `mfa-reset.mjs` with
  `docker exec arrivo node /app/admin-recovery.mjs <username> <public-url>` for admin accounts. It prints a
  one-hour recovery link; completion requires a new password and authenticator setup. Regular users' password
  resets keep two-factor enabled, and users who lose both their authenticator and recovery codes currently
  have no recovery path.
- **Development:** replace `E2E_EMAIL` with `E2E_USERNAME=e2e` in `.env`.

### Added

- First-run setup creates and signs in the instance's first admin.
- Admin → Users lets admins add users, share or regenerate setup links, change admin roles, reset passwords,
  and delete accounts while handing owned trips to successors without exposing private trip contents.
  The last admin cannot be removed or demoted.
- Admin → Activity records authentication, account, trip, itinerary and invitation events, with filters and
  configurable retention of 30, 90, 180 or 365 days (90 by default).
- Admin → Overview shows user, trip and document counts, storage health and upload usage, plus recent admin
  actions and failed sign-ins. Metrics can be refreshed individually.
- AGPL-3.0 license and a security policy directing vulnerability reports to GitHub's private reporting channel.

### Changed

- Sign-in and trip sharing use usernames instead of email addresses. Users can change their username under
  Profile → Identity.

### Fixed

- Deleting an account deleted every trip the account owned, including shared trips, so collaborators lost them
  without warning. The delete dialog under Profile → Account now lists each shared trip you own and lets you hand
  it to a collaborator or delete it. It preselects the collaborator with the highest role, then whoever joined
  first, who becomes a manager. Pending invitations you sent are cancelled, and the people you invited are
  notified.
- Files belonging to trips deleted with an account are now removed from storage.
- Newly created checklists and checklists inserted from packing lists stay expanded when a refresh is slow.

## [0.5.1] - 2026-10-22

### Changed

- Arrivo has a logo. It appears with the app name in the sidebar and on the sign-in and sign-up pages, and
  replaces the default browser tab icon.

## [0.5.0] - 2026-10-22

### Upgrading

- **Docker:** nothing to do. Migrations run on start, and the first start generates a data encryption key in
  `storage/.arrivo/data-key`. Back that file up with your database: without it, encrypted passport numbers and
  two-factor secrets can't be read. Never replace it with a different key.
- **Running from source:** set `DATA_ENCRYPTION_KEY` (32 random bytes, base64; see [SETUP.md](SETUP.md)) before
  starting. A production server refuses to start without it. Run `npm run db:migrate`. Existing passport and Known
  Traveler Numbers stay readable and are encrypted the next time they're saved.
- **Development:** delete `.next` and `.next-e2e` once after pulling. The dev cache still points at the old
  `instrumentation.ts` location and fails to start with a `SyntaxError`.
- Existing sessions stay signed in.

### Added

- Two-factor authentication with an authenticator app, set up under Profile → Security. It comes with 10
  single-use recovery codes. Regenerating them or turning two-factor off needs your password and a code.
- "Don't ask for a code on this browser for 30 days" on the two-factor step.
- "Keep me signed in" on the sign-in form. Without it, you're signed out 12 hours after signing in.
- "Your browsers" under Profile → Security lists the browsers you've signed in from. Failed sign-ins elsewhere
  never lock you out of these. Removing one signs it out.
- "Sign out all devices" under Profile → Security.
- `docker exec arrivo node /app/mfa-reset.mjs <email>` turns off two-factor for an account that lost its
  authenticator and recovery codes.

### Changed

- Changing your password, or turning two-factor on or off, signs out every session.

### Security

- Repeated failed sign-ins are throttled:
  - An account locks after 5 failures in 15 minutes, on browsers it hasn't signed in from before. The lock lasts
    15 minutes and doubles on each repeat, up to 1 hour.
  - A client IP is blocked after 30 failures in 15 minutes.
  - Set `AUTH_MAX_FAILURES` and `AUTH_IP_MAX_FAILURES` to change the limits.
- Passport and Known Traveler Numbers are encrypted at rest (AES-256-GCM). Docker installs encrypt existing values
  during the upgrade.

[Unreleased]: https://github.com/sdesmond/arrivo/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/sdesmond/arrivo/compare/v0.5.1...v0.6.0
[0.5.1]: https://github.com/sdesmond/arrivo/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/sdesmond/arrivo/compare/v0.4.1...v0.5.0
