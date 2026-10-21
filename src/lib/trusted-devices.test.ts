// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { db, schema } = vi.hoisted(() => ({
  db: { select: vi.fn(), update: vi.fn(), insert: vi.fn(), delete: vi.fn() },
  schema: {
    trustedDevices: {
      id: "td.id",
      userId: "td.user_id",
      tokenHash: "td.token_hash",
      sessionVersion: "td.session_version",
      lastUsedAt: "td.last_used_at",
    },
    users: { id: "users.id", sessionVersion: "users.session_version" },
  },
}));

vi.mock("@/db", () => ({ db }));
vi.mock("@/db/schema", () => schema);

import {
  describeUserAgent,
  findTrustedDevice,
  forgetTrustedDevice,
  hashDeviceToken,
  isMfaRemembered,
  listTrustedDevices,
  readDeviceToken,
  rememberDevice,
  type TrustedDeviceRow,
} from "./trusted-devices";

const NOW = new Date("2026-10-21T12:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function device(overrides: Partial<TrustedDeviceRow> = {}): TrustedDeviceRow {
  return {
    id: "device-1",
    userId: "user-1",
    tokenHash: hashDeviceToken("token-1"),
    label: "Chrome on macOS",
    sessionVersion: 2,
    mfaRememberedUntil: null,
    createdAt: NOW,
    lastUsedAt: NOW,
    ...overrides,
  };
}

function mockSelectRows(rows: unknown[]) {
  db.select.mockReturnValueOnce({ from: () => ({ where: vi.fn().mockResolvedValue(rows) }) });
}

function recordWrites() {
  const updateSet = vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) }));
  const insertValues = vi.fn().mockResolvedValue([]);
  const deleteWhere = vi.fn().mockResolvedValue([]);
  db.update.mockReturnValue({ set: updateSet });
  db.insert.mockReturnValue({ values: insertValues });
  db.delete.mockReturnValue({ where: deleteWhere });
  return { updateSet, insertValues, deleteWhere };
}

beforeEach(() => vi.clearAllMocks());

describe("tokens and cookies", () => {
  it("hashes tokens with SHA-256", () => {
    expect(hashDeviceToken("abc")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashDeviceToken("abc")).not.toBe(hashDeviceToken("abd"));
  });

  it("reads the device token from a Cookie header", () => {
    expect(readDeviceToken("theme=dark; arrivo_device=tok-123; other=1")).toBe("tok-123");
    expect(readDeviceToken("arrivo_device=tok-123")).toBe("tok-123");
    expect(readDeviceToken("theme=dark")).toBeUndefined();
    expect(readDeviceToken(null)).toBeUndefined();
    expect(readDeviceToken("arrivo_device=")).toBeUndefined();
  });
});

describe("describeUserAgent", () => {
  it.each([
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36",
      "Chrome on macOS",
    ],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0", "Firefox on Windows"],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      "Safari on iPhone",
    ],
    [
      "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36 EdgA/141.0",
      "Edge on Android",
    ],
    [
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36",
      "Chrome on Linux",
    ],
    ["Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Safari/604.1", "Safari on iPad"],
  ])("labels %s", (userAgent, label) => {
    expect(describeUserAgent(userAgent)).toBe(label);
  });

  it("falls back for unknown or missing agents", () => {
    expect(describeUserAgent("curl/8.0")).toBe("Unknown browser");
    expect(describeUserAgent(null)).toBe("Unknown browser");
  });
});

describe("findTrustedDevice", () => {
  const user = { id: "user-1", sessionVersion: 2 };

  it("returns the device for its user at the current session version", async () => {
    mockSelectRows([device()]);
    await expect(findTrustedDevice("token-1", user)).resolves.toEqual(device());
  });

  it("ignores a device left over from before the last session revocation", async () => {
    mockSelectRows([device({ sessionVersion: 1 })]);
    await expect(findTrustedDevice("token-1", user)).resolves.toBeNull();
  });

  it("ignores another user's device", async () => {
    mockSelectRows([device({ userId: "user-2" })]);
    await expect(findTrustedDevice("token-1", user)).resolves.toBeNull();
  });

  it("returns null for an unknown token or none at all", async () => {
    mockSelectRows([]);
    await expect(findTrustedDevice("nope", user)).resolves.toBeNull();
    await expect(findTrustedDevice(undefined, user)).resolves.toBeNull();
    expect(db.select).toHaveBeenCalledOnce();
  });
});

describe("isMfaRemembered", () => {
  it("is true only while the remember window is open", () => {
    expect(isMfaRemembered(device({ mfaRememberedUntil: new Date(NOW.getTime() + 1000) }), NOW)).toBe(true);
    expect(isMfaRemembered(device({ mfaRememberedUntil: new Date(NOW.getTime() - 1000) }), NOW)).toBe(false);
    expect(isMfaRemembered(device(), NOW)).toBe(false);
    expect(isMfaRemembered(null, NOW)).toBe(false);
  });
});

describe("rememberDevice", () => {
  const base = {
    userId: "user-1",
    sessionVersion: 2,
    userAgent: "Mozilla/5.0 (Windows NT 10.0; rv:131.0) Gecko/20100101 Firefox/131.0",
    now: NOW,
  };

  it("touches a current device and keeps its token", async () => {
    mockSelectRows([device()]);
    const { updateSet, insertValues } = recordWrites();

    await expect(rememberDevice({ ...base, existingToken: "token-1", rememberMfa: false })).resolves.toBe("token-1");

    expect(updateSet).toHaveBeenCalledWith({ lastUsedAt: NOW, label: "Firefox on Windows" });
    expect(insertValues).not.toHaveBeenCalled();
  });

  it("opens a 30-day two-factor window when asked", async () => {
    mockSelectRows([device()]);
    const { updateSet } = recordWrites();

    await rememberDevice({ ...base, existingToken: "token-1", rememberMfa: true });

    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ mfaRememberedUntil: new Date(NOW.getTime() + 30 * DAY_MS) })
    );
  });

  it("replaces a stale or foreign token with a fresh device", async () => {
    mockSelectRows([device({ sessionVersion: 1 })]);
    const { insertValues, deleteWhere } = recordWrites();

    const token = await rememberDevice({ ...base, existingToken: "token-1", rememberMfa: false });

    expect(token).not.toBe("token-1");
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // Old token's row, then rows unused for a year.
    expect(deleteWhere).toHaveBeenCalledTimes(2);
    expect(insertValues).toHaveBeenCalledWith({
      userId: "user-1",
      tokenHash: hashDeviceToken(token),
      label: "Firefox on Windows",
      sessionVersion: 2,
      mfaRememberedUntil: null,
      lastUsedAt: NOW,
    });
  });

  it("creates a device for a browser with no token yet", async () => {
    const { insertValues, deleteWhere } = recordWrites();

    await rememberDevice({ ...base, existingToken: undefined, rememberMfa: true });

    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ mfaRememberedUntil: new Date(NOW.getTime() + 30 * DAY_MS) })
    );
    expect(deleteWhere).toHaveBeenCalledOnce();
  });
});

describe("listing and forgetting", () => {
  it("lists current devices, newest first, marking this browser and live remember windows", async () => {
    const orderBy = vi.fn().mockResolvedValue([
      device({ mfaRememberedUntil: new Date(NOW.getTime() + DAY_MS) }),
      device({
        id: "device-2",
        tokenHash: hashDeviceToken("token-2"),
        label: "Safari on iPhone",
        lastUsedAt: new Date("2026-10-01T08:00:00Z"),
        mfaRememberedUntil: new Date(NOW.getTime() - DAY_MS),
      }),
    ]);
    db.select.mockReturnValueOnce({
      from: () => ({ innerJoin: () => ({ where: () => ({ orderBy }) }) }),
    });

    await expect(listTrustedDevices("user-1", "token-1", NOW)).resolves.toEqual([
      {
        id: "device-1",
        label: "Chrome on macOS",
        lastUsedAt: NOW.toISOString(),
        mfaRememberedUntil: new Date(NOW.getTime() + DAY_MS).toISOString(),
        isCurrent: true,
      },
      { id: "device-2", label: "Safari on iPhone", lastUsedAt: "2026-10-01T08:00:00.000Z", isCurrent: false },
    ]);
  });

  it("marks nothing as this browser without a token", async () => {
    db.select.mockReturnValueOnce({
      from: () => ({ innerJoin: () => ({ where: () => ({ orderBy: vi.fn().mockResolvedValue([device()]) }) }) }),
    });
    const [summary] = await listTrustedDevices("user-1", undefined, NOW);
    expect(summary.isCurrent).toBe(false);
  });

  it("forgets a device only for its owner", async () => {
    const { deleteWhere } = recordWrites();
    await forgetTrustedDevice("user-1", "device-1");
    expect(db.delete).toHaveBeenCalledWith(schema.trustedDevices);
    expect(deleteWhere).toHaveBeenCalled();
  });
});
