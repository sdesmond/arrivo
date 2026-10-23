// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { db, transaction, schema } = vi.hoisted(() => {
  const transaction = {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  return {
    transaction,
    db: {
      select: vi.fn(),
      delete: vi.fn(),
      transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<void>) => callback(transaction)),
    },
    schema: { authThrottle: { key: "key", lockedUntil: "locked_until", updatedAt: "updated_at" } },
  };
});

vi.mock("@/db", () => ({ db }));
vi.mock("@/db/schema", () => schema);

import {
  ACCOUNT_POLICY,
  IP_POLICY,
  accountTarget,
  applyFailure,
  checkThrottle,
  clearFailures,
  clientIpFromHeaders,
  getAccountPolicy,
  getIpPolicy,
  lockoutMessage,
  recordFailure,
  signInTargets,
  type ThrottleRow,
} from "./auth-throttle";

const NOW = new Date("2026-10-21T12:00:00Z");
const minutes = (count: number) => count * 60_000;

function row(overrides: Partial<ThrottleRow> = {}): ThrottleRow {
  return {
    key: "username:alice",
    failures: 0,
    windowStart: NOW,
    lockedUntil: null,
    lockCount: 0,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("applyFailure", () => {
  it("counts a failure inside the window without locking", () => {
    const next = applyFailure(row({ failures: 2 }), NOW, ACCOUNT_POLICY);
    expect(next.failures).toBe(3);
    expect(next.lockedUntil).toBeNull();
    expect(next.updatedAt).toBe(NOW);
  });

  it("locks once the threshold is reached and resets the counter", () => {
    const next = applyFailure(row({ failures: ACCOUNT_POLICY.maxFailures - 1 }), NOW, ACCOUNT_POLICY);
    expect(next.failures).toBe(0);
    expect(next.lockCount).toBe(1);
    expect(next.lockedUntil).toEqual(new Date(NOW.getTime() + ACCOUNT_POLICY.baseLockMs));
  });

  it("doubles the lock for each repeat lockout, up to the cap", () => {
    const second = applyFailure(row({ failures: 4, lockCount: 1 }), NOW, ACCOUNT_POLICY);
    expect(second.lockedUntil).toEqual(new Date(NOW.getTime() + ACCOUNT_POLICY.baseLockMs * 2));

    const capped = applyFailure(row({ failures: 4, lockCount: 20 }), NOW, ACCOUNT_POLICY);
    expect(capped.lockedUntil).toEqual(new Date(NOW.getTime() + ACCOUNT_POLICY.maxLockMs));
  });

  it("starts a fresh window once the old one has expired, keeping the lockout history", () => {
    const stale = row({ failures: 4, lockCount: 2, windowStart: new Date(NOW.getTime() - minutes(16)) });
    const next = applyFailure(stale, NOW, ACCOUNT_POLICY);
    expect(next.failures).toBe(1);
    expect(next.windowStart).toBe(NOW);
    expect(next.lockCount).toBe(2);
    expect(next.lockedUntil).toBeNull();
  });
});

describe("policies", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses the defaults when no override is set", () => {
    expect(getAccountPolicy()).toEqual(ACCOUNT_POLICY);
    expect(getIpPolicy()).toEqual(IP_POLICY);
    expect(ACCOUNT_POLICY.maxFailures).toBe(5);
    // Capped at an hour so someone who knows a username can't keep its owner locked out for long.
    expect(ACCOUNT_POLICY.maxLockMs).toBe(minutes(60));
    expect(IP_POLICY.maxFailures).toBe(30);
  });

  it("reads positive integer overrides from the environment", () => {
    vi.stubEnv("AUTH_MAX_FAILURES", "3");
    vi.stubEnv("AUTH_IP_MAX_FAILURES", "1000");
    expect(getAccountPolicy().maxFailures).toBe(3);
    expect(getIpPolicy().maxFailures).toBe(1000);
  });

  it("ignores invalid overrides", () => {
    vi.stubEnv("AUTH_MAX_FAILURES", "zero");
    vi.stubEnv("AUTH_IP_MAX_FAILURES", "-4");
    expect(getAccountPolicy().maxFailures).toBe(5);
    expect(getIpPolicy().maxFailures).toBe(30);
  });
});

describe("targets", () => {
  it("keys sign-in by normalized username and by IP when known", () => {
    expect(signInTargets(" Alice ", "203.0.113.9").map((target) => target.key)).toEqual([
      "username:alice",
      "ip:203.0.113.9",
    ]);
  });

  it("skips the IP target when the address is unknown", () => {
    expect(signInTargets("alice", undefined).map((target) => target.key)).toEqual(["username:alice"]);
  });

  it("builds per-account targets for password change and two-factor codes", () => {
    expect(accountTarget("pwchange", "user-1")).toEqual({ key: "pwchange:user-1", policy: getAccountPolicy() });
    expect(accountTarget("mfa", "user-1").key).toBe("mfa:user-1");
    expect(accountTarget("device", "device-1")).toEqual({ key: "device:device-1", policy: getAccountPolicy() });
  });
});

describe("clientIpFromHeaders", () => {
  it("takes the X-Forwarded-For hop the nearest proxy appended, not the client-supplied ones", () => {
    expect(clientIpFromHeaders(new Headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" }))).toBe("203.0.113.9");
    expect(clientIpFromHeaders(new Headers({ "x-forwarded-for": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("falls back to X-Real-IP", () => {
    expect(clientIpFromHeaders(new Headers({ "x-real-ip": "198.51.100.4" }))).toBe("198.51.100.4");
  });

  it("returns undefined without proxy headers", () => {
    expect(clientIpFromHeaders(new Headers())).toBeUndefined();
  });
});

describe("lockoutMessage", () => {
  it("rounds the wait up to whole minutes", () => {
    expect(lockoutMessage(61)).toBe("Too many attempts. Try again in 2 minutes.");
    expect(lockoutMessage(30)).toBe("Too many attempts. Try again in 1 minute.");
  });

  it("falls back to a generic wait when the duration is unknown", () => {
    expect(lockoutMessage(undefined)).toBe("Too many attempts. Try again later.");
  });
});

describe("checkThrottle", () => {
  function mockRows(rows: { lockedUntil: Date | null }[]) {
    db.select.mockReturnValue({ from: () => ({ where: vi.fn().mockResolvedValue(rows) }) });
  }

  beforeEach(() => vi.clearAllMocks());

  it("is unlocked when there are no targets", async () => {
    await expect(checkThrottle([], NOW)).resolves.toEqual({ locked: false });
    expect(db.select).not.toHaveBeenCalled();
  });

  it("is unlocked when no row has an active lock", async () => {
    mockRows([{ lockedUntil: null }, { lockedUntil: new Date(NOW.getTime() - 1000) }]);
    await expect(checkThrottle(signInTargets("a@example.com", "1.2.3.4"), NOW)).resolves.toEqual({ locked: false });
  });

  it("reports the longest active lock in whole seconds", async () => {
    mockRows([{ lockedUntil: new Date(NOW.getTime() + 90_500) }, { lockedUntil: new Date(NOW.getTime() + 10_000) }]);
    await expect(checkThrottle(signInTargets("a@example.com", "1.2.3.4"), NOW)).resolves.toEqual({
      locked: true,
      retryAfterSeconds: 91,
    });
  });
});

describe("recordFailure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transaction.insert.mockReturnValue({ values: () => ({ onConflictDoNothing: vi.fn().mockResolvedValue([]) }) });
    transaction.select.mockReturnValue({
      from: () => ({ where: () => ({ for: vi.fn().mockResolvedValue([row({ failures: 4 })]) }) }),
    });
    transaction.update.mockReturnValue({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) });
    transaction.delete.mockReturnValue({ where: vi.fn().mockResolvedValue([]) });
  });

  it("upserts and row-locks each target, writes the next state, then purges stale rows", async () => {
    await recordFailure(signInTargets("a@example.com", "1.2.3.4"), NOW);

    expect(transaction.insert).toHaveBeenCalledTimes(2);
    expect(transaction.update).toHaveBeenCalledTimes(2);
    const set = transaction.update.mock.results[0].value.set;
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ failures: 0, lockCount: 1 }));
    expect(transaction.delete).toHaveBeenCalledOnce();
  });

  it("does nothing without targets", async () => {
    await recordFailure([], NOW);
    expect(db.transaction).not.toHaveBeenCalled();
  });
});

describe("clearFailures", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes the given keys", async () => {
    const where = vi.fn().mockResolvedValue([]);
    db.delete.mockReturnValue({ where });
    await clearFailures([accountTarget("pwchange", "user-1")]);
    expect(db.delete).toHaveBeenCalledWith(schema.authThrottle);
    expect(where).toHaveBeenCalled();
  });

  it("does nothing without targets", async () => {
    await clearFailures([]);
    expect(db.delete).not.toHaveBeenCalled();
  });
});
