import type { SeedWorld } from "./seed-types";
import { SEED_USERS } from "./users";
import { TOKYO_TRIP } from "./tokyo";
import { KYOTO_TRIP } from "./kyoto";
import { PATAGONIA_TRIP } from "./patagonia";
import { LISBON_TRIP } from "./lisbon";
import { MARRAKECH_TRIP } from "./marrakech";
import { ICELAND_TRIP } from "./iceland";

// The full dev seed world, documented in docs/dev-seed-data.md — keep that doc in sync when this
// changes. See src/db/seed-runner.ts for how it's materialized and src/db/seed.ts for the CLI entry
// point (`npm run db:seed`).
export const DEV_SEED: SeedWorld = {
  users: SEED_USERS,
  trips: [TOKYO_TRIP, KYOTO_TRIP, PATAGONIA_TRIP, LISBON_TRIP, MARRAKECH_TRIP, ICELAND_TRIP],
  shares: [
    // Demo shares Tokyo with Alex as an editor.
    { tripKey: "tokyo", userKey: "alex", role: "editor" },
    // Demo shares the dateless Patagonia trip with Alex as a viewer — exercises viewer-role gating
    // (budget hidden in trip detail, excluded from Alex's personal expense report).
    { tripKey: "patagonia", userKey: "alex", role: "viewer" },
    // Alex shares Lisbon with Demo as an editor — Demo's own list contains a trip they don't own.
    { tripKey: "lisbon", userKey: "demo", role: "editor" },
  ],
  invitations: [
    // Sam has an account but no trips yet — a pending invite to Tokyo drives the invitee-side
    // pending-invitations flow on /trips.
    {
      tripKey: "tokyo",
      inviteeUserKey: "sam",
      role: "editor",
      status: "pending",
      expiresInHours: 72,
      invitedByUserKey: "demo",
    },
    // An invite Jordan already declined — the sharing dialog's third row state.
    {
      tripKey: "tokyo",
      inviteeUserKey: "jordan",
      role: "viewer",
      status: "declined",
      expiresInHours: -24,
      invitedByUserKey: "demo",
    },
  ],
};
