// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAdmin, readers } = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  readers: Object.fromEntries(
    [
      "readVersion",
      "readDatabaseHealth",
      "readStorageHealth",
      "readUploadStorageBytes",
      "readUserCounts",
      "readTripCount",
      "readDocumentCount",
      "readFailedSignIns",
      "readRecentAdminActions",
    ].map((name) => [name, vi.fn()])
  ),
}));
vi.mock("@/lib/auth-helpers", () => ({ requireAdmin }));
vi.mock("@/lib/overview-readers", () => readers);
import * as actions from "./actions";

const checkedAt = "2026-10-31T12:00:00.000Z";
const metric = { status: "ok", value: 0, checkedAt };
const cases: [keyof typeof actions, string, ("users" | "admins" | "pending")?][] = [
  ["refreshVersion", "readVersion"],
  ["refreshDatabase", "readDatabaseHealth"],
  ["refreshStorage", "readStorageHealth"],
  ["refreshUploadBytes", "readUploadStorageBytes"],
  ["refreshUsers", "readUserCounts", "users"],
  ["refreshAdmins", "readUserCounts", "admins"],
  ["refreshPending", "readUserCounts", "pending"],
  ["refreshTrips", "readTripCount"],
  ["refreshDocuments", "readDocumentCount"],
  ["refreshFailedSignIns", "readFailedSignIns"],
  ["refreshAdminActions", "readRecentAdminActions"],
];

describe("overview refresh actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    requireAdmin.mockResolvedValue({ id: "admin" });
  });
  it.each(cases)("%s guards before reading and returns only requested metric", async (name, reader, pick) => {
    const result = pick ? { users: { ...metric, value: 3 }, admins: { ...metric, value: 2 }, pending: metric } : metric;
    readers[reader].mockResolvedValue(result);
    expect(await actions[name]()).toEqual(pick ? result[pick as keyof typeof result] : metric);
    expect(requireAdmin).toHaveBeenCalledOnce();
    expect(readers[reader]).toHaveBeenCalledWith();
    expect(requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(readers[reader].mock.invocationCallOrder[0]);
  });
  it.each(cases)("%s lets lost authority escape without reading", async (name) => {
    const denied = new Error("NEXT_HTTP_ERROR_FALLBACK;404");
    requireAdmin.mockRejectedValue(denied);
    await expect(actions[name]()).rejects.toBe(denied);
    for (const reader of Object.values(readers)) expect(reader).not.toHaveBeenCalled();
  });
  it.each(cases)("%s preserves unavailable measurements", async (name, reader, pick) => {
    const unavailable = { status: "unavailable", checkedAt };
    readers[reader].mockResolvedValue(
      pick ? { users: unavailable, admins: unavailable, pending: unavailable } : unavailable
    );
    expect(await actions[name]()).toEqual(unavailable);
  });
});
