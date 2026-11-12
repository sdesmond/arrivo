import { expect, it, vi } from "vitest";
const { upload, apiRoute } = vi.hoisted(() => ({
  upload: vi.fn(),
  apiRoute: vi.fn((...args: [unknown, (input: unknown) => unknown, unknown?]) => args[1]),
}));
vi.mock("@/lib/services/documents", () => ({ uploadTripDocument: upload }));
vi.mock("@/lib/api/route", () => ({ apiRoute }));
import { POST } from "./route";
import { uploadTripDocument } from "@/lib/api/contract/documents";
it("registers POST with the multipart upload contract and no Idempotency-Key replay", () => {
  expect(apiRoute.mock.calls[0][0]).toBe(uploadTripDocument);
  expect(apiRoute.mock.calls[0][1]).toBe(POST);
  expect(apiRoute.mock.calls[0][2]).toBeUndefined();
});
it("forwards actor, trip, body and file to the service", async () => {
  const file = new File(["%PDF-1.4"], "pass.pdf", { type: "application/pdf" });
  const input = { actor: { userId: "user" }, params: { tripId: "trip" }, body: { id: "doc" }, file };
  upload.mockResolvedValue({ id: "doc" });
  await expect((POST as unknown as (input: unknown) => Promise<unknown>)(input)).resolves.toEqual({ id: "doc" });
  expect(upload).toHaveBeenCalledWith(input.actor, "trip", input.body, file);
});
