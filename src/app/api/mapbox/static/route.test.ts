// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { requireUser } = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock("@/lib/auth-helpers", () => ({ requireUser }));
import { GET } from "./route";

function buildRequest(query: string): NextRequest {
  return { nextUrl: new URL(`http://localhost/api/mapbox/static?${query}`) } as NextRequest;
}

describe("GET /api/mapbox/static", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("MAPBOX_ACCESS_TOKEN", "test-token");
    requireUser.mockResolvedValue({ id: "user-1" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("requires a signed-in user before touching the Mapbox token or upstream", async () => {
    const redirectSignal = new Error("NEXT_REDIRECT");
    requireUser.mockRejectedValue(redirectSignal);

    await expect(GET(buildRequest("lat=10&lng=20"))).rejects.toBe(redirectSignal);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["lat=abc&lng=20", "lat=91&lng=20", "lat=10&lng=181", "lat=10", "lat=10&lng="])(
    "rejects invalid coordinates (%s)",
    async (query) => {
      const response = await GET(buildRequest(query));

      expect(response.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it("returns 500 when the Mapbox token is not configured", async () => {
    vi.stubEnv("MAPBOX_ACCESS_TOKEN", "");

    const response = await GET(buildRequest("lat=10&lng=20"));

    expect(response.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("proxies the static tile with private caching", async () => {
    fetchMock.mockResolvedValue(new Response("tile", { status: 200, headers: { "content-type": "image/png" } }));

    const response = await GET(buildRequest("lat=10&lng=20"));

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/static/20,10,10/"), expect.anything());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=3600");
    expect(response.headers.get("Content-Type")).toBe("image/png");
  });

  it("passes through an upstream failure status", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }));

    const response = await GET(buildRequest("lat=10&lng=20"));

    expect(response.status).toBe(404);
  });
});
