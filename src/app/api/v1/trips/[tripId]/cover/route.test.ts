// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ set: vi.fn(), remove: vi.fn(), auth: vi.fn() }));
vi.mock("@/lib/services/covers", () => ({ setTripCover: mocks.set, removeTripCover: mocks.remove }));
vi.mock("@/lib/api/auth", () => ({ requireApiUser: mocks.auth }));
vi.mock("@/lib/rate-limit", async (original) => ({
  ...(await original<typeof import("@/lib/rate-limit")>()),
  assertWithinRateLimit: vi.fn(),
}));
import { PUT, DELETE } from "./route";
import { TripForbiddenError, TripNotFoundError } from "@/lib/services/trip-access";
const tripId = "223e4567-e89b-12d3-a456-426614174000";
const body = { coverImageUrl: "https://images.unsplash.com/photo" };
const context = { params: Promise.resolve({ tripId }) };
function request(method: string, input: unknown, key?: string) {
  return new Request(`http://localhost/api/v1/trips/${tripId}/cover`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-arrivo-client": "web",
      origin: "http://localhost",
      ...(key ? { "idempotency-key": key } : {}),
    },
    body: JSON.stringify(input),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ userId: "user" });
  mocks.set.mockResolvedValue(null);
  mocks.remove.mockResolvedValue(null);
});
it.each([
  ["PUT", PUT, mocks.set, body],
  ["DELETE", DELETE, mocks.remove, {}],
] as const)("returns 204 and forwards %s replay", async (method, handler, service, input) => {
  const response = await handler(request(method, input, "cover-retry"), context);
  expect(response.status).toBe(204);
  expect(service).toHaveBeenCalledWith({ userId: "user" }, tripId, input, {
    key: "cover-retry",
    method,
    path: `/api/v1/trips/${tripId}/cover`,
  });
});
it.each([
  { coverImageUrl: "javascript:alert(1)" },
  { ...body, extra: true },
  { ...body, coverPhotographerUrl: "ftp://example.com" },
])("maps real contract validation to 422", async (input) => {
  expect((await PUT(request("PUT", input), context)).status).toBe(422);
  expect(mocks.set).not.toHaveBeenCalled();
});
it.each([
  [new TripForbiddenError("editor"), 403],
  [new TripNotFoundError(), 404],
] as const)("maps service access errors", async (error, status) => {
  mocks.remove.mockRejectedValueOnce(error);
  expect((await DELETE(request("DELETE", {}), context)).status).toBe(status);
});
