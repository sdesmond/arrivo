import { expect, it } from "vitest";
import {
  acceptInvitation,
  createInvitation,
  declineInvitation,
  getCollaborators,
  listInvitableUsers,
  MAX_CONTRIBUTOR_CHANGES,
  saveContributorChanges,
} from "./sharing";

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

const collaboratorId = "323e4567-e89b-12d3-a456-426614174000";
const otherCollaboratorId = "423e4567-e89b-12d3-a456-426614174000";
it("accepts mixed and empty contributor batches with lowercased identities", () => {
  expect(saveContributorChanges.method).toBe("PATCH");
  expect(saveContributorChanges.path).toBe("/api/v1/trips/:tripId/collaborators");
  expect(
    saveContributorChanges.body.parse({
      changes: [
        { type: "role", collaboratorId: collaboratorId.toUpperCase(), fromRole: "editor", toRole: "viewer" },
        { type: "remove", collaboratorId: otherCollaboratorId },
      ],
    })
  ).toEqual({
    changes: [
      { type: "role", collaboratorId, fromRole: "editor", toRole: "viewer" },
      { type: "remove", collaboratorId: otherCollaboratorId },
    ],
  });
  expect(saveContributorChanges.body.parse({ changes: [] })).toEqual({ changes: [] });
});
it("accepts exactly the contributor batch limit", () => {
  const changes = Array.from({ length: MAX_CONTRIBUTOR_CHANGES }, (_unused, index) => ({
    type: "remove",
    collaboratorId: `${index.toString(16).padStart(8, "0")}-e89b-12d3-a456-426614174000`,
  }));
  expect(MAX_CONTRIBUTOR_CHANGES).toBe(50);
  expect(saveContributorChanges.body.safeParse({ changes }).success).toBe(true);
});
it.each([
  [
    "oversized",
    {
      changes: Array.from({ length: 51 }, (_unused, index) => ({
        type: "remove",
        collaboratorId: `${index.toString(16).padStart(8, "0")}-e89b-12d3-a456-426614174000`,
      })),
    },
  ],
  [
    "duplicate",
    {
      changes: [
        { type: "remove", collaboratorId },
        { type: "role", collaboratorId, fromRole: "editor", toRole: "viewer" },
      ],
    },
  ],
  ["bad type", { changes: [{ type: "archive", collaboratorId }] }],
  ["bad role", { changes: [{ type: "role", collaboratorId, fromRole: "editor", toRole: "owner" }] }],
  ["bad from role", { changes: [{ type: "role", collaboratorId, fromRole: "owner", toRole: "viewer" }] }],
  ["missing role", { changes: [{ type: "role", collaboratorId, fromRole: "editor" }] }],
  ["bad UUID", { changes: [{ type: "remove", collaboratorId: "collab-1" }] }],
  ["extra change field", { changes: [{ type: "remove", collaboratorId, toRole: "viewer" }] }],
  ["extra body field", { changes: [], tripId: collaboratorId }],
  ["missing changes", {}],
])("rejects %s contributor batch", (_label, body) => {
  expect(saveContributorChanges.body.safeParse(body).success).toBe(false);
});
it("reports duplicate contributors on the changes field", () => {
  const result = saveContributorChanges.body.safeParse({
    changes: [
      { type: "remove", collaboratorId },
      { type: "remove", collaboratorId },
    ],
  });
  expect(result.success).toBe(false);
  expect(result.error?.issues[0]).toMatchObject({
    path: ["changes"],
    message: "Each contributor can appear only once per batch.",
  });
});

const invitationId = "523e4567-e89b-12d3-a456-426614174000";
it.each([
  [acceptInvitation, "/api/v1/invitations/:invitationId/accept"],
  [declineInvitation, "/api/v1/invitations/:invitationId/decline"],
])("defines invitee decision %#: POST, lowercased id, empty strict body", (endpoint, path) => {
  expect(endpoint.method).toBe("POST");
  expect(endpoint.path).toBe(path);
  expect(endpoint.params.parse({ invitationId: invitationId.toUpperCase() })).toEqual({ invitationId });
  expect(endpoint.params.safeParse({ invitationId: "invite-1" }).success).toBe(false);
  expect(endpoint.body.parse({})).toEqual({});
  expect(endpoint.body.safeParse({ extra: true }).success).toBe(false);
});
