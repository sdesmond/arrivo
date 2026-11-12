import { afterEach, expect, it, vi } from "vitest";
import { api, ApiClientError, REQUEST_TIMEOUT_MS } from "./client";
import { deleteChecklist, updateChecklistItem } from "./contract/checklists";
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
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

const timeoutFailure = {
  name: "ApiClientError",
  status: 0,
  code: "timeout",
  message: "The request timed out. Try again.",
};
const patchInput = { params: { itemId: "item" }, body: { isChecked: true } };
/** A fetch that never settles on its own and rejects like the platform when its signal aborts. */
function hangingFetch() {
  return vi.fn(
    (_path: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      })
  );
}

it("fails a request that never answers with a timeout and aborts it", async () => {
  vi.useFakeTimers();
  const fetch = hangingFetch();
  vi.stubGlobal("fetch", fetch);
  const failure = expect(api(updateChecklistItem, patchInput)).rejects.toMatchObject(timeoutFailure);
  await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1);
  expect(fetch.mock.calls[0][1].signal?.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  await failure;
  expect(fetch.mock.calls[0][1].signal?.aborted).toBe(true);
});

it("fails a success body that stalls after the headers with a timeout", async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_path: string, init: RequestInit) => ({
      ok: true,
      status: 200,
      json: () =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    }))
  );
  const failure = expect(api(updateChecklistItem, patchInput)).rejects.toMatchObject(timeoutFailure);
  await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
  await failure;
});

it("fails an error body that stalls after the headers with a timeout", async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_path: string, init: RequestInit) => ({
      ok: false,
      status: 500,
      json: () =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    }))
  );
  const failure = expect(api(updateChecklistItem, patchInput)).rejects.toMatchObject(timeoutFailure);
  await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
  await failure;
});

it("leaves no timer running after a fast response or failure", async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(Response.json({ id: "item" }))
      .mockResolvedValueOnce(Response.json({ error: { code: "not_found", message: "Gone" } }, { status: 404 }))
      .mockRejectedValueOnce(new Error("offline"))
  );
  await api(updateChecklistItem, patchInput);
  await expect(api(updateChecklistItem, patchInput)).rejects.toMatchObject({ code: "not_found" });
  await expect(api(updateChecklistItem, patchInput)).rejects.toMatchObject({ code: "network_error" });
  expect(vi.getTimerCount()).toBe(0);
});

it("maps a malformed success body that is not a timeout to a server error", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not json", { status: 200 })));
  await expect(api(updateChecklistItem, patchInput)).rejects.toMatchObject({
    name: "ApiClientError",
    status: 200,
    code: "server_error",
    message: "Could not save changes. Try again.",
  });
});
