// @vitest-environment node
/// <reference types="vite/client" />
import { beforeAll, expect, it, vi } from "vitest";

// The idempotency_keys sweep deletes rows once they are older than IDEMPOTENCY_RETENTION_MS. A route that keeps its
// replay records longer would have live keys deleted, and a late retry would write twice. This loads every v1 route
// with a recording apiRoute and checks each opt-in.

interface Registration {
  route: string;
  expiryMs?: number;
  idempotent: boolean;
}

const { registrations } = vi.hoisted(() => ({ registrations: [] as Registration[] }));
vi.mock("@/lib/api/route", () => ({
  apiRoute: (
    ...args: [{ method: string; path: string }, unknown, { idempotent?: { expiryMs?: number } }?]
  ): (() => undefined) => {
    const [endpoint, , options] = args;
    registrations.push({
      route: `${endpoint.method} ${endpoint.path}`,
      idempotent: options?.idempotent !== undefined,
      ...(options?.idempotent?.expiryMs === undefined ? {} : { expiryMs: options.idempotent.expiryMs }),
    });
    return () => undefined;
  },
}));
vi.mock("@/db", () => ({ db: {} }));
// Route registration imports services but never invokes their authenticated operations.
vi.mock("@/lib/auth-helpers", () => ({ assertTripAccess: vi.fn() }));

import { IDEMPOTENCY_RETENTION_MS } from "@/lib/idempotency-retention";

beforeAll(async () => {
  const loaders = import.meta.glob("/src/app/api/v1/**/route.ts");
  await Promise.all(Object.values(loaders).map((load) => load()));
});

it("loads the idempotent v1 routes", () => {
  expect(registrations.filter((registration) => registration.idempotent).map(({ route }) => route)).toEqual(
    expect.arrayContaining([
      "PATCH /api/v1/checklist-items/:itemId",
      "POST /api/v1/checklists/:checklistId/items",
      "POST /api/v1/trips/:tripId/invitations",
      "POST /api/v1/invitations/:invitationId/accept",
      "POST /api/v1/invitations/:invitationId/decline",
      "POST /api/v1/invitations/:invitationId/resend",
      "POST /api/v1/invitations/:invitationId/dismiss",
      "DELETE /api/v1/trips/:tripId/invitations/:invitationId",
      "DELETE /api/v1/trips/:tripId/collaborators/me",
    ])
  );
});

it("keeps every route's replay expiry within the sweep's retention", () => {
  const offenders = registrations
    .filter(({ expiryMs }) => expiryMs !== undefined && !(expiryMs > 0 && expiryMs <= IDEMPOTENCY_RETENTION_MS))
    .map(({ route, expiryMs }) => `${route}: expiryMs ${expiryMs}`);
  expect(offenders, "Raise IDEMPOTENCY_RETENTION_MS (and check the sweep) before lengthening a route's expiry").toEqual(
    []
  );
});
