import "server-only";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { packingTemplates } from "@/db/schema";
import type { Actor, IdempotentRequest, PackingTemplate } from "@/data/types";
import {
  createPackingTemplate as createContract,
  listPackingTemplates as listContract,
} from "@/lib/api/contract/packing-templates";
import { withIdempotency } from "@/lib/api/idempotency";
import { dbTemplateToType } from "@/lib/db-mappers";
import { listTemplatesForUser } from "@/lib/queries";
import { guardTransactionDeadline } from "@/lib/request-deadline";
import { lockClientIds } from "./client-ids";
import { ConflictError } from "./conflict-error";
import { TripNotFoundError } from "./trip-access";

export async function listPackingTemplates(
  actor: Actor,
  input: unknown = {}
): Promise<{ templates: PackingTemplate[] }> {
  listContract.body.parse(input);
  return { templates: await listTemplatesForUser(actor.userId) };
}

/** Creates an owned template under the client id. A retry of the same id and name returns the row without writing. */
export async function createPackingTemplate(
  actor: Actor,
  input: unknown,
  replay?: IdempotentRequest
): Promise<PackingTemplate> {
  const body = createContract.body.parse(input);
  let created = false;
  const { value, replayed } = await db.transaction((transaction) =>
    guardTransactionDeadline(transaction, () =>
      withIdempotency<PackingTemplate>(
        transaction,
        { actor, request: replay, payload: body },
        {
          authorize: async () => {
            await lockClientIds(transaction, [`packing-template:${body.id}`]);
            const [existing] = await transaction
              .select({ userId: packingTemplates.userId })
              .from(packingTemplates)
              .where(eq(packingTemplates.id, body.id));
            if (existing && existing.userId !== actor.userId) throw new TripNotFoundError();
          },
          mutate: async () => {
            created = false;
            const [existing] = await transaction
              .select()
              .from(packingTemplates)
              .where(eq(packingTemplates.id, body.id));
            if (existing) {
              if (existing.name !== body.name)
                throw new ConflictError("This ID was already used for a different template.");
              return dbTemplateToType(existing);
            }
            const [row] = await transaction
              .insert(packingTemplates)
              .values({ id: body.id, userId: actor.userId, name: body.name })
              .returning();
            created = true;
            return dbTemplateToType(row);
          },
        }
      )
    )
  );
  if (created && !replayed) revalidatePath("/packing");
  return value;
}
