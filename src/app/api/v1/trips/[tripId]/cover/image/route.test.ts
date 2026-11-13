// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ upload: vi.fn(), auth: vi.fn() }));
vi.mock("@/lib/services/covers", () => ({ uploadTripCoverImage: mocks.upload }));
vi.mock("@/lib/api/auth", () => ({ requireApiUser: mocks.auth }));
vi.mock("@/lib/rate-limit", async (original) => ({
  ...(await original<typeof import("@/lib/rate-limit")>()),
  assertWithinRateLimit: vi.fn(),
}));
import { POST } from "./route";
import { TripForbiddenError, TripNotFoundError } from "@/lib/services/trip-access";
import { UploadInvalidError, UploadTooLargeError } from "@/lib/upload-policy";
import { MAX_COVER_IMAGE_UPLOAD_BYTES } from "@/lib/utils";
import { MULTIPART_OVERHEAD_BYTES } from "@/lib/api/endpoint";
const tripId = "223e4567-e89b-12d3-a456-426614174000";
const context = { params: Promise.resolve({ tripId }) };
function formWith(file?: File, extra: Record<string, string> = {}) {
  const form = new FormData();
  if (file) form.append("file", file);
  for (const [name, value] of Object.entries(extra)) form.append(name, value);
  return form;
}
function request(form: FormData, headers: Record<string, string> = {}) {
  return new Request(`http://localhost/api/v1/trips/${tripId}/cover/image`, {
    method: "POST",
    headers: { "x-arrivo-client": "web", origin: "http://localhost", ...headers },
    body: form,
  });
}
const gif = () => new File(["GIF89a-bytes"], "cover.gif", { type: "image/gif" });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ userId: "user" });
  mocks.upload.mockResolvedValue(null);
});
it("returns 204 and forwards actor, trip, empty body and the file", async () => {
  const response = await POST(request(formWith(gif())), context);
  expect(response.status).toBe(204);
  expect(mocks.upload).toHaveBeenCalledWith({ userId: "user" }, tripId, {}, expect.any(File));
  expect(mocks.upload.mock.calls[0][3].name).toBe("cover.gif");
});
it("answers 413 for a body over the 12 MB cover policy without reading it", async () => {
  const response = await POST(
    request(formWith(gif()), { "content-length": String(MAX_COVER_IMAGE_UPLOAD_BYTES + MULTIPART_OVERHEAD_BYTES + 1) }),
    context
  );
  expect(response.status).toBe(413);
  expect((await response.json()).error.code).toBe("payload_too_large");
  expect(mocks.upload).not.toHaveBeenCalled();
});
it.each([
  ["a missing file", () => formWith()],
  ["an unknown field", () => formWith(gif(), { extra: "x" })],
])("answers 422 for %s", async (_label, build) => {
  const response = await POST(request(build()), context);
  expect(response.status).toBe(422);
  expect(mocks.upload).not.toHaveBeenCalled();
});
it.each([
  [new UploadTooLargeError("too big"), 413, "payload_too_large"],
  [new UploadInvalidError("bad type"), 422, "validation_failed"],
  [new TripForbiddenError("editor"), 403, "forbidden"],
  [new TripNotFoundError(), 404, "not_found"],
] as const)("maps the service's %s", async (error, status, code) => {
  mocks.upload.mockRejectedValueOnce(error);
  const response = await POST(request(formWith(gif())), context);
  expect(response.status).toBe(status);
  expect((await response.json()).error.code).toBe(code);
});
it("rejects an Idempotency-Key with 400, since uploads are not replayed", async () => {
  const response = await POST(request(formWith(gif()), { "idempotency-key": "cover-retry" }), context);
  expect(response.status).toBe(400);
  expect(mocks.upload).not.toHaveBeenCalled();
});
it("answers 403 without the X-Arrivo-Client header", async () => {
  const bare = new Request(`http://localhost/api/v1/trips/${tripId}/cover/image`, {
    method: "POST",
    headers: { origin: "http://localhost" },
    body: formWith(gif()),
  });
  expect((await POST(bare, context)).status).toBe(403);
  expect(mocks.upload).not.toHaveBeenCalled();
});
