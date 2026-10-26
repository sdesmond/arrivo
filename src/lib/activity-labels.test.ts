import { describe, expect, it } from "vitest";
import { ActivityEventType } from "@/data/types";
import { ACTIVITY_TYPE_OPTIONS, EVENT_LABELS } from "./activity-labels";

describe("activity labels", () => {
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
