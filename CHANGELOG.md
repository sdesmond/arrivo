# Changelog

## [Unreleased]

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

[Unreleased]: https://github.com/sdesmond/arrivo/compare/v0.5.1...HEAD
[0.5.1]: https://github.com/sdesmond/arrivo/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/sdesmond/arrivo/compare/v0.4.1...v0.5.0
