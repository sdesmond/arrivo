import { expect, it } from "vitest";
import { updateChecklistItem } from "./checklists";
it("accepts only an absolute checked state and UUID", () => {
  expect(updateChecklistItem.body.safeParse({ isChecked: true }).success).toBe(true);
  expect(updateChecklistItem.body.safeParse({ isChecked: false }).success).toBe(true);
  for (const body of [{}, { isChecked: "true" }, { isChecked: true, content: "extra" }])
    expect(updateChecklistItem.body.safeParse(body).success).toBe(false);
  expect(updateChecklistItem.params.safeParse({ itemId: "invalid" }).success).toBe(false);
});
