import { z } from "zod";
import type { ChecklistItem } from "@/data/types";
import { defineEndpoint } from "../endpoint";
export const updateChecklistItem = defineEndpoint<ChecklistItem>()({
  method: "PATCH",
  path: "/api/v1/checklist-items/:itemId",
  params: z.object({ itemId: z.uuid() }),
  body: z.strictObject({ isChecked: z.boolean() }),
});
