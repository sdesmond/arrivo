# Adversarial architecture review

Verdict: no critical/high incompatibility found. Two medium clarifications close remaining independent-builder divergences. Existing single deployment, shared credential lifecycle, locked last-admin/succession rules, purpose-bound authorization and minimal best-effort Activity remain sound.

## Medium — Maintenance lock must not become primary-action dependency

AD-8/AD-11 require optional nonblocking maintenance; AD-2 serializes primary admin operations on instance-state record. A maintenance builder can implement its nonwaiting lease by taking that same instance-state row lock, then hold it through deletion batches. Administration builder correctly waits on that row for role/deletion writes. Maintenance itself never waits, yet user operation now waits for maintenance. Neither unit explicitly violates prescribed lock identity because maintenance lock identity is unspecified.

Fix: make maintenance coordination independent of primary account/trip/instance-state mutexes. Maintenance never holds primary-domain row locks while doing cleanup; use separate advisory/lease scope, bounded Activity statements and timeouts. Ordinary policy reads need no primary mutex. This preserves user requirement without queues or scheduler.

## Medium — Username partition versus rename-boundary splitting

AD-10 simultaneously says split on username snapshot change and merge connected same-snapshot intervals. Consider edits as `alex`, a rename to `sam`, rename back to `alex`, then another edit within ten minutes, with no trip edit as `sam`. One builder keys aggregates by actor/trip/snapshot and merges both `alex` edits. Another closes actor batches on every profile rename and keeps two rows. Separate profile and trip builders cannot derive same boundary from only stored snapshot and time interval. Delayed callbacks make an implicit rename-close side effect unreliable under best-effort logging.

Fix: choose explicit semantics. Minimal option: batches partition by event-time username value, and matching values can merge within inactivity window even after an intervening rename; different stored values never merge. If every rename must force a new batch, carry authoritative identity revision in primary account state and capture it with events. Do not rely on an optional rename Activity event as grouping barrier.

## Confirmed closed

- User confirmed trusted-LAN HTTP support; pending draft wording is parent-owned update, not a finding.
- No request for durable audit delivery or additional infrastructure.
- Account/trip deletion retention boundary is explicit, and succession races are covered by instance/account/trip coordination.
- Public credential contexts do not grant ordinary app access; current authority and security-version checks govern completion.
