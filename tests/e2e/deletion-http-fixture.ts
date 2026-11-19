import "dotenv/config";
import postgres from "postgres";

/** Scenario-owned lock gate. The blocker graph identifies actual queued transactions, not query counts. */
export async function holdHttpRaceLock(
  table: "users" | "trips" | "collaborators" | "membership-insert",
  id: string,
  userId?: string
) {
  const client = postgres(process.env.E2E_DATABASE_URL!, { max: 3 });
  const holder = await client.reserve();
  let released = false;
  try {
    await holder`begin`;
    const [identity] = await holder`select pg_backend_pid() as pid`;
    if (table === "users") await holder`select id from users where id = ${id} for update`;
    else if (table === "trips") await holder`select id from trips where id = ${id} for update`;
    else if (table === "collaborators") await holder`select id from collaborators where id = ${id} for update`;
    else {
      if (!userId) throw new Error("A held membership insert needs a user ID.");
      await holder`insert into collaborators (trip_id, user_id, name, initials, role, is_creator)
        values (${id}, ${userId}, 'Held', 'HE', 'viewer', false)`;
    }

    async function waitForBlockedBy(blocker: number, tableName = ""): Promise<number> {
      const deadline = Date.now() + 15_000;
      while (Date.now() < deadline) {
        const rows = await client`
          select pid from pg_stat_activity
          where datname = current_database() and ${blocker} = any(pg_blocking_pids(pid))
            and (${tableName} = '' or position(${tableName} in lower(query)) > 0)
        `;
        if (rows.length > 0) return rows[0].pid as number;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error(`No transaction queued behind backend ${blocker}.`);
    }

    async function release() {
      if (released) return;
      released = true;
      try {
        await holder`rollback`;
      } finally {
        holder.release();
      }
    }

    return {
      pid: identity.pid as number,
      waitForBlockedBy,
      release,
      async close() {
        await release();
        await client.end();
      },
    };
  } catch (error) {
    await holder`rollback`.catch(() => undefined);
    holder.release();
    await client.end();
    throw error;
  }
}
