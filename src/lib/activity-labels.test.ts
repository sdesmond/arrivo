import { describe, expect, it } from "vitest";
import { ActivityEventType } from "@/data/types";
import { ACTIVITY_TYPE_OPTIONS, EVENT_LABELS } from "./activity-labels";

describe("activity labels", () => {
  it("labels operator recovery issuance", () => {
    expect(EVENT_LABELS[ActivityEventType.AdminRecoveryLinkGenerated]).toEqual({
      type: "Accounts",
      action: "Generated admin recovery link",
    });
  });
  it("labels completed admin recovery", () => {
    expect(EVENT_LABELS[ActivityEventType.AdminRecoveryCompleted]).toEqual({
      type: "Accounts",
      action: "Completed admin recovery",
    });
  });
  it("labels password reset events", () => {
    expect(EVENT_LABELS[ActivityEventType.PasswordResetLinkGenerated].action).toBe("Generated password reset link");
    expect(EVENT_LABELS[ActivityEventType.PasswordResetCompleted].action).toBe("Completed password reset");
  });
  it("labels saved retention changes without private metadata", () => {
    expect(EVENT_LABELS[ActivityEventType.RetentionChanged]).toEqual({
      type: "Administration",
      action: "Changed activity retention",
    });
  });
  it("labels account creation and setup links", () => {
    expect(EVENT_LABELS[ActivityEventType.AccountCreated]).toEqual({ type: "Accounts", action: "Created account" });
    expect(EVENT_LABELS[ActivityEventType.SetupLinkGenerated]).toEqual({
      type: "Accounts",
      action: "Generated setup link",
    });
  });
  it("labels completed account setup", () => {
    expect(EVENT_LABELS[ActivityEventType.SetupLinkRegenerated]).toEqual({
      type: "Accounts",
      action: "Regenerated setup link",
    });
    expect(EVENT_LABELS[ActivityEventType.SetupCompleted]).toEqual({
      type: "Accounts",
      action: "Completed account setup",
    });
  });
  it("labels unfinished account deletion", () => {
    expect(EVENT_LABELS[ActivityEventType.PendingAccountDeleted]).toEqual({
      type: "Accounts",
      action: "Deleted unfinished account",
    });
  });
  it("labels admin and self-service account deletion separately", () => {
    expect(EVENT_LABELS[ActivityEventType.AccountDeleted].action).toBe("Deleted own account");
    expect(EVENT_LABELS[ActivityEventType.AccountDeletedByAdmin]).toEqual({
      type: "Accounts",
      action: "Deleted account",
    });
  });
  it("labels every event type", () => {
    for (const type of Object.values(ActivityEventType)) {
      expect(EVENT_LABELS[type].action).not.toBe("");
      expect(EVENT_LABELS[type].type).not.toBe("");
    }
  });

  it("offers one filter option per event type, labelled by its action", () => {
    expect(ACTIVITY_TYPE_OPTIONS.map((option) => option.value)).toEqual(Object.values(ActivityEventType));
    expect(ACTIVITY_TYPE_OPTIONS.find((option) => option.value === "trip_updated")?.label).toBe("Updated trip");
  });
});
