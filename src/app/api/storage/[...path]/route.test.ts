// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { assertTripAccess, getStorageAdapter, requireUser, resolveOwningTripId } = vi.hoisted(() => ({
  assertTripAccess: vi.fn(),
  getStorageAdapter: vi.fn(),
  requireUser: vi.fn(),
  resolveOwningTripId: vi.fn(),
}));

vi.mock("@/lib/auth-helpers", () => ({
  assertTripAccess,
  requireUser,
}));

vi.mock("@/lib/storage/trip-resolution", () => ({
  resolveOwningTripId,
}));

vi.mock("@/lib/storage/storage-adapter", async () => {
  const actual = await vi.importActual<typeof import("@/lib/storage/storage-adapter")>("@/lib/storage/storage-adapter");
  return {
    ...actual,
    getStorageAdapter,
  };
});

import { StorageNotFoundError } from "@/lib/storage/storage-adapter";
import { MalformedKeyError } from "@/lib/upload-policy";
import { GET } from "./route";

function makeParams(path: string[]) {
  return { params: Promise.resolve({ path }) };
}

function makeStream(): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]));
      controller.close();
    },
  });
}

describe("GET /api/storage/[...path]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "user-1" });
    assertTripAccess.mockResolvedValue(undefined);
    resolveOwningTripId.mockResolvedValue("trip-1");
  });

  it("authenticates first, resolves the trip, authorizes, and streams the file with correct headers", async () => {
    const stream = makeStream();
    const read = vi.fn().mockResolvedValue(stream);
    getStorageAdapter.mockReturnValue({ read });

    const response = await GET(
      new Request("http://localhost/api/storage/event-documents/event-1/uuid.jpg") as never,
      makeParams(["event-documents", "event-1", "uuid.jpg"])
    );

    expect(requireUser).toHaveBeenCalled();
    expect(resolveOwningTripId).toHaveBeenCalledWith("event-documents/event-1/uuid.jpg");
    expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "user-1");
    expect(read).toHaveBeenCalledWith("event-documents/event-1/uuid.jpg");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(response.headers.get("Content-Disposition")).toBe("inline");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.body).toBe(stream);
  });

  it("propagates the redirect signal when the caller is unauthenticated", async () => {
    const redirectSignal = new Error("NEXT_REDIRECT");
    (redirectSignal as Error & { digest: string }).digest = "NEXT_REDIRECT;push;/sign-in;307;";
    requireUser.mockRejectedValue(redirectSignal);

    await expect(
      GET(
        new Request("http://localhost/api/storage/trip-documents/trip-1/uuid.pdf") as never,
        makeParams(["trip-documents", "trip-1", "uuid.pdf"])
      )
    ).rejects.toBe(redirectSignal);

    expect(resolveOwningTripId).not.toHaveBeenCalled();
    expect(getStorageAdapter).not.toHaveBeenCalled();
  });

  it("propagates the not-found signal when the user lacks trip access", async () => {
    const notFoundSignal = new Error("NEXT_NOT_FOUND");
    (notFoundSignal as Error & { digest: string }).digest = "NEXT_NOT_FOUND";
    assertTripAccess.mockRejectedValue(notFoundSignal);

    await expect(
      GET(
        new Request("http://localhost/api/storage/trip-documents/trip-1/uuid.pdf") as never,
        makeParams(["trip-documents", "trip-1", "uuid.pdf"])
      )
    ).rejects.toBe(notFoundSignal);

    expect(getStorageAdapter).not.toHaveBeenCalled();
  });

  it("returns 404 when the key does not exist in the backing store", async () => {
    const read = vi.fn().mockRejectedValue(new StorageNotFoundError("trip-documents/trip-1/missing.pdf"));
    getStorageAdapter.mockReturnValue({ read });

    const response = await GET(
      new Request("http://localhost/api/storage/trip-documents/trip-1/missing.pdf") as never,
      makeParams(["trip-documents", "trip-1", "missing.pdf"])
    );

    expect(response.status).toBe(404);
  });

  it("returns 400 for a malformed key", async () => {
    resolveOwningTripId.mockRejectedValue(new MalformedKeyError("not-a-scope/foo/bar.jpg"));

    const response = await GET(
      new Request("http://localhost/api/storage/not-a-scope/foo/bar.jpg") as never,
      makeParams(["not-a-scope", "foo", "bar.jpg"])
    );

    expect(response.status).toBe(400);
    expect(requireUser).toHaveBeenCalled();
    expect(assertTripAccess).not.toHaveBeenCalled();
  });

  it("propagates unexpected resolver errors as 500", async () => {
    resolveOwningTripId.mockRejectedValue(new Error("Event not found"));

    await expect(
      GET(
        new Request("http://localhost/api/storage/event-documents/event-1/uuid.jpg") as never,
        makeParams(["event-documents", "event-1", "uuid.jpg"])
      )
    ).rejects.toThrow("Event not found");
  });

  it("returns 400 when the file extension is unsupported", async () => {
    const stream = makeStream();
    const read = vi.fn().mockResolvedValue(stream);
    getStorageAdapter.mockReturnValue({ read });

    const response = await GET(
      new Request("http://localhost/api/storage/trip-documents/trip-1/uuid.svg") as never,
      makeParams(["trip-documents", "trip-1", "uuid.svg"])
    );

    expect(response.status).toBe(400);
    expect(read).toHaveBeenCalled();
  });

  it("propagates unexpected adapter errors", async () => {
    const read = vi.fn().mockRejectedValue(new Error("disk failure"));
    getStorageAdapter.mockReturnValue({ read });

    await expect(
      GET(
        new Request("http://localhost/api/storage/trip-documents/trip-1/uuid.jpg") as never,
        makeParams(["trip-documents", "trip-1", "uuid.jpg"])
      )
    ).rejects.toThrow("disk failure");
  });

  it("returns 400 when the key has no file extension", async () => {
    const stream = makeStream();
    const read = vi.fn().mockResolvedValue(stream);
    getStorageAdapter.mockReturnValue({ read });

    const response = await GET(
      new Request("http://localhost/api/storage/trip-documents/trip-1/noext") as never,
      makeParams(["trip-documents", "trip-1", "noext"])
    );

    expect(response.status).toBe(400);
  });

  it("reconstructs the exact key produced by put() from route params", async () => {
    const stream = makeStream();
    const read = vi.fn().mockResolvedValue(stream);
    getStorageAdapter.mockReturnValue({ read });

    const puttedKey = "reservation-documents/res-1/9b1e-uuid.pdf";
    const pathSegments = puttedKey.split("/");

    await GET(new Request("http://localhost/api/storage/" + puttedKey) as never, makeParams(pathSegments));

    expect(resolveOwningTripId).toHaveBeenCalledWith(puttedKey);
    expect(read).toHaveBeenCalledWith(puttedKey);
  });
});
