import { ActivityEventType } from "@/data/types";

/** Client-safe display labels; the Activity table and the action filter share them. */
export const EVENT_LABELS: Record<ActivityEventType, { type: string; action: string }> = {
  [ActivityEventType.RetentionChanged]: { type: "Administration", action: "Changed activity retention" },
  [ActivityEventType.SignIn]: { type: "Authentication", action: "Sign-in" },
  [ActivityEventType.SignInFailed]: { type: "Authentication", action: "Failed sign-in" },
  [ActivityEventType.SignOut]: { type: "Authentication", action: "Sign-out" },
  [ActivityEventType.AccountCreated]: { type: "Accounts", action: "Created account" },
  [ActivityEventType.SetupLinkGenerated]: { type: "Accounts", action: "Generated setup link" },
  [ActivityEventType.SetupLinkRegenerated]: { type: "Accounts", action: "Regenerated setup link" },
  [ActivityEventType.PendingAccountDeleted]: { type: "Accounts", action: "Deleted unfinished account" },
  [ActivityEventType.SetupCompleted]: { type: "Accounts", action: "Completed account setup" },
  [ActivityEventType.RoleChanged]: { type: "Accounts", action: "Changed role" },
  [ActivityEventType.UsernameChanged]: { type: "Accounts", action: "Changed username" },
  [ActivityEventType.PasswordChanged]: { type: "Accounts", action: "Changed password" },
  [ActivityEventType.AccountDeleted]: { type: "Accounts", action: "Deleted own account" },
  [ActivityEventType.TripCreated]: { type: "Trips", action: "Created trip" },
  [ActivityEventType.TripUpdated]: { type: "Trips", action: "Updated trip" },
  [ActivityEventType.InvitationCreated]: { type: "Trips", action: "Created invitation" },
  [ActivityEventType.InvitationAccepted]: { type: "Trips", action: "Accepted invitation" },
  [ActivityEventType.InvitationRescinded]: { type: "Trips", action: "Rescinded invitation" },
};

export const ACTIVITY_TYPE_OPTIONS: ReadonlyArray<{ value: ActivityEventType; label: string }> = (
  Object.values(ActivityEventType) as ActivityEventType[]
).map((value) => ({ value, label: EVENT_LABELS[value].action }));
