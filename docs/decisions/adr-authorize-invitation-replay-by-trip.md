# Authorize invitation replay by trip

## Context

An invitation row can be deleted before a manager retries a successful dismissal. The API must authorize the retry without exposing an invitation from another trip.

## Decision

Resend and dismiss requests carry a trip ID. The service checks the caller's manager access to that trip under its lock and binds any invitation row to that trip. This permits authorized replay after deletion while concealing cross-trip IDs. Source: `story-manage-invitation-lifecycle-through-the-api-plan.md`, Design Notes, and commit `285a82df`.

## Options considered

- Retain additional evidence for deleted rows: the chosen trip-scoped authorization made that unnecessary; the plan records no further rationale.

## Consequences

Clients must supply the trip ID for these global invitation routes, and the service must maintain locked authorization and trip binding for both fresh calls and replay.
