import { z } from "zod";
import type { InviteContributorResult, InvitableUsersResult, ShareDialogData } from "@/data/types";
import { normalizeUsername, validateUsername } from "@/lib/username";
import { defineEndpoint } from "../endpoint";

const uuid = z.uuid().toLowerCase();
const tripParams = z.object({ tripId: uuid });
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
    role: z.enum(["viewer", "editor", "manager"]).default("viewer"),
  }),
});
