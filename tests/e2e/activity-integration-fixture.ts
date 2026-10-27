import "dotenv/config";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { ACTIVITY_MAINTENANCE_LOCK } from "../../src/lib/activity-maintenance";

const SAFE_UUID = /^[0-9a-f-]{36}$/;

export interface ActivityRecorderFault {
  /** Attempts the recorder made against the faulted actor; the sequence survives the rolled-back write. */
  attempts(): Promise<number>;
  /** Releases the trigger, function and sequence, and closes the connection. Safe to call repeatedly. */
  close(): Promise<void>;
}

/**
 * Rejects every Activity INSERT/UPDATE whose actor is `actorId`, and nothing else. The trigger is scoped by a unique
 * name and a WHEN clause, so parallel scenarios and other accounts record normally. The sequence is advanced before
 * the rejection: nextval is not transactional, so it proves the app attempted the write after the rollback.
 */
export async function installActivityRecorderFault(actorId: string): Promise<ActivityRecorderFault> {
  if (!SAFE_UUID.test(actorId)) throw new Error("Activity fault needs a UUID actor ID.");
  const suffix = randomUUID().replaceAll("-", "");
  const sequence = `e2e_activity_attempts_${suffix}`;
  const func = `e2e_reject_activity_${suffix}`;
  const trigger = `e2e_reject_activity_${suffix}`;
  const client = postgres(process.env.E2E_DATABASE_URL!, { max: 1 });
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    try {
      await client.unsafe(`drop trigger if exists "${trigger}" on activity_events`);
      await client.unsafe(`drop function if exists "${func}"()`);
      await client.unsafe(`drop sequence if exists "${sequence}"`);
    } finally {
      await client.end();
    }
  };
  try {
    await client.unsafe(`create sequence "${sequence}"`);
    await client.unsafe(
      `create function "${func}"() returns trigger language plpgsql as $body$ begin perform nextval('"${sequence}"'); raise exception 'e2e injected Activity failure'; end $body$`
    );
    await client.unsafe(
      `create trigger "${trigger}" before insert or update on activity_events for each row when (new.actor_id = '${actorId}'::uuid) execute function "${func}"()`
    );
  } catch (error) {
    await close();
    throw error;
  }
  return {
    async attempts() {
      const [row] = await client.unsafe(`select last_value, is_called from "${sequence}"`);
      return row.is_called ? Number(row.last_value) : 0;
    },
    close,
  };
}

export interface ActivityMaintenanceHold {
  /** Lets cleanup run again. Safe to call repeatedly. */
  release(): Promise<void>;
}

/** Holds the same schema-scoped maintenance lock cleanup tries, so cleanup skips its pass until released. */
export async function holdActivityMaintenance(): Promise<ActivityMaintenanceHold> {
  const client = postgres(process.env.E2E_DATABASE_URL!, { max: 1 });
  let released = false;
  const release = async () => {
    if (released) return;
    released = true;
    try {
      await client`select pg_advisory_unlock(hashtextextended(current_schema() || ':' || ${ACTIVITY_MAINTENANCE_LOCK}, 0))`;
    } finally {
      await client.end();
    }
  };
  try {
    await client`select pg_advisory_lock(hashtextextended(current_schema() || ':' || ${ACTIVITY_MAINTENANCE_LOCK}, 0))`;
  } catch (error) {
    await release();
    throw error;
  }
  return { release };
}
