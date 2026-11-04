"use client";

import { saveUserMfaRequirement } from "@/app/(app)/admin/users/actions";
import { MfaRequirementControl } from "./mfa-policy-settings";

interface UserMfaRequirementProps {
  userId: string;
  required?: boolean;
  instanceRequired?: boolean;
}

export function UserMfaRequirement({ userId, required, instanceRequired }: UserMfaRequirementProps) {
  return (
    <MfaRequirementControl
      required={required ?? false}
      unavailable={typeof required !== "boolean" || typeof instanceRequired !== "boolean"}
      inherited={instanceRequired}
      label="Require 2FA"
      onSave={(next, expected) => saveUserMfaRequirement(userId, next, expected)}
    />
  );
}
