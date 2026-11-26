import { expect, type APIResponse, type Page } from "@playwright/test";
import { and, eq, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { idempotencyKeys, invitations, activityEvents } from "../../../src/db/schema";
import { runSharedTableDdl, withE2EDb } from "../e2e-db";
import { apiClient } from "../anonymous-api";
import { Given, When, Then, After } from "../fixtures";
import { headers } from "../api-support";

interface SharingApiState {
  id: string;
  username: string;
  recipientId: string;
  tripId: string;
  response?: APIResponse;
  before?: Awaited<ReturnType<typeof sharingInvitationSnapshot>>;
  picker?: { users: { id: string; username: string }[]; hasOtherUsers: boolean };
  getResponses?: APIResponse[];
  simultaneous?: APIResponse[];
  replayBefore?: Awaited<ReturnType<typeof sharingReplaySnapshot>>;
  deadlineMachinery?: boolean;
}
const sharingApiStates = new WeakMap<Page, SharingApiState>();
function sharingApi(page: Page): SharingApiState {
  const current = sharingApiStates.get(page);
  if (!current) throw new Error("Sharing API fixture missing");
  return current;
}
async function sharingInvitationSnapshot(tripId: string) {
  return withE2EDb((database) =>
    database.select().from(invitations).where(eq(invitations.tripId, tripId)).orderBy(invitations.id)
  );
}
function sharingBody(page: Page) {
  const current = sharingApi(page);
  return { id: current.id, username: current.username, role: "editor" };
}
async function sendSharing(page: Page, body: unknown, key: string, tripId = sharingApi(page).tripId) {
  const current = sharingApi(page);
  current.response = await (
    await apiClient(page)
  ).post(`/api/v1/trips/${tripId}/invitations`, {
    headers: { ...headers(page), ...(key === "none" ? {} : { "Idempotency-Key": `sharing-${current.id}-${key}` }) },
    data: body,
  });
  return current.response;
}
Given("a registered recipient for the sharing API", async ({ page, scenario }) => {
  const { user } = await scenario.materialize({ user: { setCurrent: false } });
  if (!user) throw new Error("Sharing recipient missing");
  sharingApiStates.set(page, {
    id: randomUUID(),
    username: user.username,
    recipientId: user.id,
    tripId: scenario.currentTrip!.id,
  });
});
When("I read the manager sharing API and picker", async ({ page }) => {
  const current = sharingApi(page);
  const [sharing, picker] = await Promise.all([
    page.request.get(`/api/v1/trips/${current.tripId}/collaborators`, { headers: headers(page) }),
    page.request.get(`/api/v1/users/invitable?tripId=${current.tripId}`, { headers: headers(page) }),
  ]);
  expect(sharing.status()).toBe(200);
  expect(picker.status()).toBe(200);
  const body = await sharing.json();
  expect(body.currentCollaboratorId).toBeTruthy();
  expect(body.collaborators.length).toBeGreaterThan(0);
  current.picker = await picker.json();
});
Then("the sharing picker contains the recipient", async ({ page }) => {
  const current = sharingApi(page);
  expect(current.picker!.users.map((user) => user.id)).toContain(current.recipientId);
  expect(current.picker!.hasOtherUsers).toBe(true);
});
Then("the sharing picker excludes the recipient", async ({ page }) => {
  const current = sharingApi(page);
  expect(current.picker!.users.map((user) => user.id)).not.toContain(current.recipientId);
});
When("I create the sharing API invitation with {string} key", async ({ page }, key: string) => {
  const response = await sendSharing(page, sharingBody(page), key);
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: "invited" });
  const current = sharingApi(page);
  current.before = await sharingInvitationSnapshot(current.tripId);
  expect(current.before).toHaveLength(1);
  expect(current.before[0].id).toBe(current.id);
});
When("I retry the sharing API invitation with {string} key", async ({ page }, key: string) => {
  await sendSharing(page, sharingBody(page), key);
});
Then("the sharing API returns {int} and preserves the invitation", async ({ page }, status: number) => {
  const current = sharingApi(page);
  expect(current.response!.status()).toBe(status);
  expect(await sharingInvitationSnapshot(current.tripId)).toEqual(current.before);
});
When("the sharing API invitation becomes {string}", async ({ page }, lifecycle: string) => {
  const current = sharingApi(page);
  await withE2EDb(async (database) => {
    if (lifecycle === "dismissed") await database.delete(invitations).where(eq(invitations.id, current.id));
    else await database.update(invitations).set({ status: lifecycle }).where(eq(invitations.id, current.id));
  });
  current.before = await sharingInvitationSnapshot(current.tripId);
});
When(
  "I reuse the sharing API intent with changed {string} and {string} key",
  async ({ page, scenario }, field: string, key: string) => {
    const body = sharingBody(page);
    let tripId = sharingApi(page).tripId;
    if (field === "role") body.role = "viewer";
    if (field === "recipient") {
      const { user } = await scenario.materialize({ user: { setCurrent: false } });
      body.username = user!.username;
    }
    if (field === "trip") {
      const { trip } = await scenario.materialize({ trip: { mother: "datelessTrip", setCurrent: false } });
      tripId = trip!.id;
    }
    await sendSharing(page, body, key, tripId);
  }
);
When("I submit invalid sharing API case {string}", async ({ page, scenario }, kind: string) => {
  const body: Record<string, unknown> = sharingBody(page);
  if (kind === "role") body.role = "owner";
  if (kind === "id") body.id = "invalid";
  if (kind === "username") body.username = "";
  if (kind === "self") body.username = scenario.currentUser!.username;
  if (kind === "missing") body.username = `absent${randomUUID().replaceAll("-", "").slice(0, 15)}`;
  await sendSharing(page, body, "none");
});
Then("the sharing API rejects with {int} and {string}", async ({ page }, status: number, code: string) => {
  const current = sharingApi(page);
  expect(current.response!.status()).toBe(status);
  const body = await current.response!.json();
  expect(status === 200 ? body.errorCode : body.error.code).toBe(code);
  expect(await sharingInvitationSnapshot(current.tripId)).toHaveLength(0);
});
When("I resend the pending invitation using a fresh API UUID", async ({ page }) => {
  const current = sharingApi(page);
  current.id = randomUUID();
  const response = await sendSharing(page, sharingBody(page), "same");
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: "resent" });
});
Then("the fresh API UUID preserves the existing pending row", async ({ page }) => {
  const current = sharingApi(page);
  const rows = await sharingInvitationSnapshot(current.tripId);
  expect(rows).toHaveLength(1);
  expect(rows[0].id).toBe(current.before![0].id);
  expect(rows[0].id).not.toBe(current.id);
});
When("the sharing API pending alias is dismissed and replaced", async ({ page }) => {
  const current = sharingApi(page);
  await withE2EDb((database) => database.delete(invitations).where(eq(invitations.tripId, current.tripId)));
  const response = await sendSharing(page, { ...sharingBody(page), id: randomUUID() }, "none");
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: "invited" });
  current.before = await sharingInvitationSnapshot(current.tripId);
});
async function sharingReplaySnapshot(page: Page) {
  const current = sharingApi(page);
  return withE2EDb((database) =>
    database
      .select()
      .from(idempotencyKeys)
      .where(
        or(
          eq(idempotencyKeys.key, `invitation-intent:${current.id}`),
          sql`${idempotencyKeys.key} like ${`api:v1:sharing-${current.id}-%`}`
        )
      )
      .orderBy(idempotencyKeys.key)
  );
}
When("I request both sharing GET endpoints without manager access", async ({ page }) => {
  const current = sharingApi(page);
  current.getResponses = await Promise.all([
    page.request.get(`/api/v1/trips/${current.tripId}/collaborators`, { headers: headers(page) }),
    page.request.get(`/api/v1/users/invitable?tripId=${current.tripId}`, { headers: headers(page) }),
  ]);
});
Then("both sharing GET endpoints return {int} without rows", async ({ page }, status: number) => {
  for (const response of sharingApi(page).getResponses!) {
    expect(response.status()).toBe(status);
    expect(await response.json()).toEqual({
      error:
        status === 403
          ? { code: "forbidden", message: "You do not have permission for this action.", requiredRole: "manager" }
          : { code: "not_found", message: "Resource not found." },
    });
  }
});
When("I simultaneously create the same invitation UUID with independent keys", async ({ page }) => {
  const current = sharingApi(page);
  current.simultaneous = await Promise.all([
    sendSharing(page, sharingBody(page), "parallel-one"),
    sendSharing(page, sharingBody(page), "parallel-two"),
  ]);
});
Then("one invitation intent and two keyed responses persist", async ({ page }) => {
  const current = sharingApi(page);
  for (const response of current.simultaneous!) {
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ status: "invited" });
  }
  const rows = await sharingInvitationSnapshot(current.tripId);
  expect(rows).toHaveLength(1);
  expect(rows[0].id).toBe(current.id);
  const records = await sharingReplaySnapshot(page);
  expect(records).toHaveLength(3);
  expect(records.filter((record) => record.key.startsWith("invitation-intent:"))).toHaveLength(1);
  await expect
    .poll(
      async () =>
        (
          await withE2EDb((database) =>
            database
              .select()
              .from(activityEvents)
              .where(and(eq(activityEvents.tripId, current.tripId), eq(activityEvents.type, "invitation_created")))
          )
        ).length
    )
    .toBe(1);
});
When(
  "manager demotion wins the trip lock before {string} invitation work",
  async ({ page, scenario }, operation: string) => {
    const current = sharingApi(page);
    if (operation === "replay") {
      const response = await sendSharing(page, sharingBody(page), "demotion");
      expect(response.status()).toBe(200);
    }
    current.before = await sharingInvitationSnapshot(current.tripId);
    current.replayBefore = await sharingReplaySnapshot(page);
    const client = postgres(process.env.E2E_DATABASE_URL!, { max: 1 });
    let release!: () => void;
    let acquired!: (pid: number) => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = new Promise<number>((resolve) => {
      acquired = resolve;
    });
    const finished = client.begin(async (transaction) => {
      await transaction`select id from trips where id = ${current.tripId} for update`;
      const [connection] = await transaction<{ pid: number }[]>`select pg_backend_pid() as pid`;
      acquired(connection.pid);
      await held;
      await transaction`update collaborators set role = 'editor' where trip_id = ${current.tripId} and user_id = ${scenario.currentUser!.id}`;
    });
    let pending: Promise<APIResponse> | undefined;
    try {
      const holderPid = await Promise.race([
        ready,
        finished.then(() => {
          throw new Error("Trip lock ended early");
        }),
      ]);
      pending = sendSharing(page, sharingBody(page), "demotion");
      await expect
        .poll(async () =>
          withE2EDb(async (database) => {
            const rows = await database.execute(
              sql`select 1 from pg_stat_activity where ${holderPid} = any(pg_blocking_pids(pid))`
            );
            return rows.length;
          })
        )
        .toBeGreaterThan(0);
      release();
      await finished;
      const response = await pending;
      expect(response.status()).toBe(403);
      expect((await response.json()).error.requiredRole).toBe("manager");
    } finally {
      release();
      await finished.catch(() => undefined);
      await pending?.catch(() => undefined);
      await client.end();
    }
  }
);
Then("denied invitation work stored no new replay evidence", async ({ page }) => {
  expect(await sharingReplaySnapshot(page)).toEqual(sharingApi(page).replayBefore);
});
Given("the sharing header replay insert is delayed after all writes", async ({ page, scenario, $testInfo }) => {
  $testInfo.setTimeout(60_000);
  const current = sharingApi(page);
  const suffix = current.id.replaceAll("-", "");
  const key = `api:v1:sharing-${current.id}-deadline`;
  current.deadlineMachinery = true;
  await withE2EDb(async (database) => {
    await database.execute(
      sql.raw(`create function e2e_sharing_deadline_${suffix}() returns trigger language plpgsql as $$ begin
      if not exists (select 1 from invitations where id = '${current.id}') or not exists (select 1 from idempotency_keys where key = 'invitation-intent:${current.id}' and user_id = '${scenario.currentUser!.id}') or not exists (select 1 from idempotency_keys where key = '${key}') then raise exception 'sharing writes were not all visible'; end if;
      perform pg_sleep(25); return new; end $$`)
    );
    await runSharedTableDdl(() =>
      database.execute(
        sql.raw(
          `create trigger e2e_sharing_deadline_${suffix} after insert on idempotency_keys for each row when (new.key = '${key}') execute function e2e_sharing_deadline_${suffix}()`
        )
      )
    );
  });
});
When("I create the invitation under the production request deadline", async ({ page }) => {
  await sendSharing(page, sharingBody(page), "deadline");
});
Then("deadline rollback leaves no invitation or replay evidence", async ({ page }) => {
  const current = sharingApi(page);
  expect(current.response!.status()).toBe(503);
  expect((await current.response!.json()).error.code).toBe("deadline_exceeded");
  expect(await sharingInvitationSnapshot(current.tripId)).toEqual([]);
  expect(await sharingReplaySnapshot(page)).toEqual([]);
});
After(async ({ page }) => {
  const current = sharingApiStates.get(page);
  if (!current?.deadlineMachinery) return;
  const suffix = current.id.replaceAll("-", "");
  await withE2EDb(async (database) => {
    await runSharedTableDdl(() =>
      database.execute(sql.raw(`drop trigger if exists e2e_sharing_deadline_${suffix} on idempotency_keys`))
    );
    await database.execute(sql.raw(`drop function if exists e2e_sharing_deadline_${suffix}()`));
  });
});
When(
  "sharing intent evidence is {string} with original invitation {string}",
  async ({ page }, evidence: string, original: string) => {
    const current = sharingApi(page);
    const key = `invitation-intent:${current.id}`;
    await withE2EDb(async (database) => {
      await database
        .update(idempotencyKeys)
        .set({ createdAt: sql`now() - interval '25 hours'` })
        .where(eq(idempotencyKeys.key, key));
      const expired = await database
        .select()
        .from(idempotencyKeys)
        .where(and(eq(idempotencyKeys.key, key), sql`${idempotencyKeys.createdAt} < now() - interval '24 hours'`));
      expect(expired).toHaveLength(1);
      if (evidence === "swept") {
        await database
          .delete(idempotencyKeys)
          .where(and(eq(idempotencyKeys.key, key), sql`${idempotencyKeys.createdAt} < now() - interval '24 hours'`));
        expect(await database.select().from(idempotencyKeys).where(eq(idempotencyKeys.key, key))).toHaveLength(0);
      }
      if (original === "deleted") await database.delete(invitations).where(eq(invitations.id, current.id));
    });
    current.before = await sharingInvitationSnapshot(current.tripId);
  }
);
Then(
  "retention retry returns {int} with original invitation {string}",
  async ({ page }, status: number, original: string) => {
    const current = sharingApi(page);
    expect(current.response!.status()).toBe(status);
    if (original === "present") expect(await sharingInvitationSnapshot(current.tripId)).toEqual(current.before);
    else {
      expect(await current.response!.json()).toEqual({ status: "invited" });
      expect(await sharingInvitationSnapshot(current.tripId)).toHaveLength(1);
    }
  }
);
