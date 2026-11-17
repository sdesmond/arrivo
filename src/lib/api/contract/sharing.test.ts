import { expect, it } from "vitest";
import { createInvitation, getCollaborators, listInvitableUsers } from "./sharing";

const tripId = "223e4567-e89b-12d3-a456-426614174000";
it("validates sharing reads and normalizes lifecycle identities", () => {
  expect(getCollaborators.params.parse({ tripId: tripId.toUpperCase() })).toEqual({ tripId });
  expect(listInvitableUsers.body.parse({ tripId })).toEqual({ tripId });
  expect(listInvitableUsers.body.safeParse({ tripId: "bad" }).success).toBe(false);
});
it("normalizes usernames and defaults invite role", () => {
  expect(createInvitation.body.parse({ username: " Alice " })).toEqual({ username: "alice", role: "viewer" });
});
it.each([
  { username: "" },
  { username: "ab" },
  { username: "alice", role: "owner" },
  { username: "alice", id: "bad" },
  { username: "alice", extra: true },
])("rejects invalid invite %j", (body) => {
  expect(createInvitation.body.safeParse(body).success).toBe(false);
});
