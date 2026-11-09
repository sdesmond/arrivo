import { afterEach, expect, it, vi } from "vitest";
import { api, ApiClientError } from "./client";
import { deleteChecklist, updateChecklistItem } from "./contract/checklists";
afterEach(() => vi.unstubAllGlobals());
it("sends typed absolute JSON with cookie credentials and client header", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ id: "item", isChecked: false }));
  vi.stubGlobal("fetch", fetch);
  await expect(
    api(updateChecklistItem, { params: { itemId: "item /?" }, body: { isChecked: false } })
  ).resolves.toMatchObject({ isChecked: false });
  expect(fetch).toHaveBeenCalledWith(
    "/api/v1/checklist-items/item%20%2F%3F",
    expect.objectContaining({
      method: "PATCH",
      credentials: "same-origin",
      body: '{"isChecked":false}',
      headers: { "Content-Type": "application/json", "X-Arrivo-Client": "web" },
    })
  );
});
it("preserves status, field errors, and required role", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json(
        {
          error: {
            code: "validation_failed",
            message: "Invalid",
            fields: { isChecked: ["Required"] },
            requiredRole: "editor",
          },
        },
        { status: 422 }
      )
    )
  );
  await expect(
    api(updateChecklistItem, { params: { itemId: "item" }, body: { isChecked: true } })
  ).rejects.toMatchObject({
    status: 422,
    code: "validation_failed",
    fields: { isChecked: ["Required"] },
    requiredRole: "editor",
  });
});
it("normalizes network and non-JSON failures", async () => {
  const fetch = vi
    .fn()
    .mockRejectedValueOnce(new Error("secret socket"))
    .mockResolvedValueOnce(new Response("gateway", { status: 502 }));
  vi.stubGlobal("fetch", fetch);
  for (let attempt = 0; attempt < 2; attempt += 1)
    await expect(
      api(updateChecklistItem, { params: { itemId: "item" }, body: { isChecked: true } })
    ).rejects.toBeInstanceOf(ApiClientError);
});

it.each([null, true, 42, "gateway", [], { error: null }, { error: "gateway" }])(
  "normalizes malformed JSON error envelope %j",
  async (envelope) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(envelope, { status: 502 })));
    await expect(
      api(updateChecklistItem, { params: { itemId: "item" }, body: { isChecked: true } })
    ).rejects.toMatchObject({
      name: "ApiClientError",
      status: 502,
      code: "server_error",
      message: "Could not save changes. Try again.",
    });
  }
);

const checklistId = "11111111-1111-4111-8111-111111111111";
const tripId = "22222222-2222-4222-8222-222222222222";

it("resolves null for a declared 204 without parsing the empty body", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetch);
  await expect(api(deleteChecklist, { params: { checklistId }, body: { tripId } })).resolves.toBeNull();
  expect(fetch).toHaveBeenCalledWith(
    `/api/v1/checklists/${checklistId}`,
    expect.objectContaining({ method: "DELETE", body: JSON.stringify({ tripId }) })
  );
});

it("fails an unexpected 204 for a JSON contract", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
  await expect(
    api(updateChecklistItem, { params: { itemId: "item" }, body: { isChecked: true } })
  ).rejects.toMatchObject({ name: "ApiClientError", status: 204, code: "server_error" });
});

it("keeps JSON error handling for a declared 204 endpoint", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ error: { code: "not_found", message: "Gone" } }, { status: 404 }))
  );
  await expect(api(deleteChecklist, { params: { checklistId }, body: { tripId } })).rejects.toMatchObject({
    status: 404,
    code: "not_found",
    message: "Gone",
  });
});
