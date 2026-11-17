import { z } from "zod";
import type {
  InviteContributorResult,
  InvitableUsersResult,
  SaveContributorChangesResult,
  ShareDialogData,
} from "@/data/types";
import { normalizeUsername, validateUsername } from "@/lib/username";
import { defineEndpoint } from "../endpoint";

const uuid = z.uuid().toLowerCase();
const tripParams = z.object({ tripId: uuid });
const collaboratorRole = z.enum(["viewer", "editor", "manager"]);
export const getCollaborators = defineEndpoint<ShareDialogData>()({
  method: "GET",
  path: "/api/v1/trips/:tripId/collaborators",
  params: tripParams,
  body: z.strictObject({}),
});
export const listInvitableUsers = defineEndpoint<InvitableUsersResult>()({
  method: "GET",
  path: "/api/v1/users/invitable",
  params: z.object({}),
  body: z.strictObject({ tripId: uuid }),
});
export const createInvitation = defineEndpoint<InviteContributorResult>()({
  method: "POST",
  path: "/api/v1/trips/:tripId/invitations",
  params: tripParams,
  body: z.strictObject({
    id: uuid.optional(),
    username: z
      .string()
      .transform(normalizeUsername)
      .refine((username) => validateUsername(username) === null, "Enter a valid username."),
    role: collaboratorRole.default("viewer"),
  }),
});

export const MAX_CONTRIBUTOR_CHANGES = 50;
const contributorChange = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("role"),
    collaboratorId: uuid,
    fromRole: collaboratorRole,
    toRole: collaboratorRole,
  }),
  z.strictObject({ type: z.literal("remove"), collaboratorId: uuid }),
]);
export const saveContributorChanges = defineEndpoint<SaveContributorChangesResult>()({
  method: "PATCH",
  path: "/api/v1/trips/:tripId/collaborators",
  params: tripParams,
  body: z.strictObject({
    changes: z
      .array(contributorChange)
      .max(MAX_CONTRIBUTOR_CHANGES)
      .refine(
        (changes) => new Set(changes.map((change) => change.collaboratorId)).size === changes.length,
        "Each contributor can appear only once per batch."
      ),
  }),
});
