You are an intent-alignment auditor. You have no other context about how this change was produced. Here is the verbatim intent this work started from:

**Problem:** Trip metadata edits depend on a server action unavailable to API clients.

**Approach:** Add a partial trip metadata PATCH and migrate metadata-only edits from trips, trip detail and travel history, preserving existing behavior and currency conversion.

The diff is the unified diff below. Read it — it is the change under review.

diff --git a/docs/api-v1.md b/docs/api-v1.md
index 380a6b15..42f5bd17 100644
--- a/docs/api-v1.md
+++ b/docs/api-v1.md
@@ -729,3 +729,10 @@ Body: `{}`. Removes the caller's own editor or viewer membership and leaves the
 A creator or manager is refused with 422 `validation_failed` ("The trip creator can't leave this trip." or "Managers can't leave a trip.") and keeps their membership; a manager must be demoted first. A reused `Idempotency-Key` with a different request returns 409 while the membership exists; 503 `deadline_exceeded` rolls back the removal and its saved replay together.
 
 The trip row is locked, then the caller's membership and role are rechecked, then any saved response is read, all in one transaction. A keyed retry returns `204` without repeating effects, and cannot remove a membership the caller regained later: leave again with a fresh key. After commit the caller receives a membership-left event on their personal channel and loses their trip-channel subscriptions, then the trip channel receives a membership-changed event; the trip and trips list are revalidated. No-op, rolled-back and replayed requests publish nothing. No schema migration or new configuration is required.
+
+### PATCH /api/v1/trips/:tripId
+
+**Role** editor · **`Idempotency-Key`** yes · **Success** `200` `Trip`
+
+Editors may update trip metadata with a strict partial JSON body: `name`, `destinationName`, `destinationCountry`, `destinationCountryCode`, `notes`, `budgetCurrency`, `budgetTotal`, `tags`, and `transitMode`. Destination fields and transit mode accept null. Omitted fields remain unchanged; dates and cover fields are rejected. Currency codes are normalized to uppercase and must be supported. Set `convertCurrency` to true with `budgetCurrency` to recalculate expense conversions in the same transaction. Without conversion, expense amounts stay unchanged. Returns the updated trip. Supports `Idempotency-Key`; access is rechecked on replay.
+
diff --git a/src/app/(app)/travel-history/use-travel-history-page-handlers.test.tsx b/src/app/(app)/travel-history/use-travel-history-page-handlers.test.tsx
index aade873d..0fb0d09f 100644
--- a/src/app/(app)/travel-history/use-travel-history-page-handlers.test.tsx
+++ b/src/app/(app)/travel-history/use-travel-history-page-handlers.test.tsx
@@ -2,6 +2,7 @@ import { describe, it, expect, vi, beforeEach } from "vitest";
 import { renderHook, act } from "@testing-library/react";
 import { toast } from "sonner";
 import { deleteTrip, updateTripMetadata } from "@/app/(app)/trips/actions";
+import { api } from "@/lib/api/client";
 import { useTravelHistoryPageHandlers } from "./use-travel-history-page-handlers";
 import { SpendingDateRange, TripDateConflictResolution, type TripListEntry } from "@/data/types";
 
@@ -14,9 +15,11 @@ const { mockPathname, mockSearchParams, mockRouterPush } = vi.hoisted(() => ({
 vi.mock("next/navigation", () => ({
   usePathname: () => mockPathname(),
   useSearchParams: () => mockSearchParams(),
-  useRouter: () => ({ push: mockRouterPush }),
+  useRouter: () => ({ push: mockRouterPush, refresh: vi.fn() }),
 }));
 
+vi.mock("@/lib/api/client", () => ({ api: vi.fn() }));
+
 vi.mock("sonner", () => ({
   toast: { error: vi.fn() },
 }));
@@ -211,7 +214,7 @@ describe("useTravelHistoryPageHandlers", () => {
   });
 
   it("shows a toast when saving trip changes fails", async () => {
-    vi.mocked(updateTripMetadata).mockRejectedValueOnce(new Error("Save failed"));
+    vi.mocked(api).mockRejectedValueOnce(new Error("Save failed"));
 
     const { result } = renderHook(() => useTravelHistoryPageHandlers(entries, NOW));
 
@@ -260,3 +263,20 @@ describe("useTravelHistoryPageHandlers", () => {
     expect(result.current.deletingTrip?.id).toBe("trip-past-older");
   });
 });
+
+it("saves history metadata through the API", async () => {
+  vi.mocked(api).mockResolvedValueOnce({} as never);
+  const { result } = renderHook(() => useTravelHistoryPageHandlers(entries, NOW));
+  await act(async () => {
+    await result.current.handleTripSave("trip-past-newer", {
+      name: "New",
+      startDate: "2026-01-01",
+      endDate: "2026-01-10",
+    });
+  });
+  expect(api).toHaveBeenCalledWith(expect.objectContaining({ path: "/api/v1/trips/:tripId" }), {
+    params: { tripId: "trip-past-newer" },
+    body: { name: "New" },
+  });
+  expect(updateTripMetadata).not.toHaveBeenCalled();
+});
diff --git a/src/app/(app)/travel-history/use-travel-history-page-handlers.ts b/src/app/(app)/travel-history/use-travel-history-page-handlers.ts
index 2428186f..6fb00d5f 100644
--- a/src/app/(app)/travel-history/use-travel-history-page-handlers.ts
+++ b/src/app/(app)/travel-history/use-travel-history-page-handlers.ts
@@ -12,6 +12,7 @@ import {
   type UpdateTripMetadataResult,
   type UpdateTripPatch,
 } from "@/data/types";
+import { saveTripMetadata } from "@/lib/trip-metadata-save";
 import { getTripStatus } from "@/lib/utils";
 import { deleteTrip, updateTripMetadata } from "@/app/(app)/trips/actions";
 
@@ -50,7 +51,10 @@ export function useTravelHistoryPageHandlers(initialEntries: TripListEntry[], no
     return new Promise((resolve) => {
       startTripSave(async () => {
         try {
-          const result = await updateTripMetadata(tripId, patch, resolution, confirmation);
+          const trip = initialEntries.find((entry) => entry.trip.id === tripId)?.trip;
+          if (!trip) throw new Error("Trip not found.");
+          const result = await saveTripMetadata(trip, patch, updateTripMetadata, resolution, confirmation);
+          if (result.status === "saved") router.refresh();
           if (result.status === "saved") {
             closeTripEditSheet();
           } else {
diff --git a/src/app/(app)/trips/[tripId]/transit-actions.test.ts b/src/app/(app)/trips/[tripId]/transit-actions.test.ts
deleted file mode 100644
index f9b54f8c..00000000
--- a/src/app/(app)/trips/[tripId]/transit-actions.test.ts
+++ /dev/null
@@ -1,185 +0,0 @@
-// @vitest-environment node
-import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
-
-const { mockAfter, mockDbSelect, mockMerge } = vi.hoisted(() => ({
-  mockAfter: vi.fn(),
-  mockDbSelect: vi.fn(),
-  mockMerge: vi.fn(),
-}));
-vi.mock("next/server", () => ({ after: mockAfter }));
-vi.mock("@/lib/activity-batches", () => ({
-  BATCHED_TYPES: new Set(["trip_updated"]),
-  mergeActivityInterval: mockMerge,
-}));
-
-const { recordTripUpdated } = vi.hoisted(() => ({ recordTripUpdated: vi.fn() }));
-vi.mock("@/lib/trip-activity", () => ({ recordTripUpdated }));
-
-const { mockAssertTripAccess, mockDbUpdate, mockRequireUser, mockRevalidatePath, schemaTokens } = vi.hoisted(() => {
-  const mockAssertTripAccess = vi.fn();
-  const mockDbUpdate = vi.fn();
-  const mockRequireUser = vi.fn();
-  const mockRevalidatePath = vi.fn();
-  const schemaTokens: Record<string, unknown> = { trips: {}, users: { id: "user-id", username: "username" } };
-
-  return { mockAssertTripAccess, mockDbUpdate, mockRequireUser, mockRevalidatePath, schemaTokens };
-});
-
-vi.mock("@/lib/auth-helpers", () => ({
-  assertTripAccess: mockAssertTripAccess,
-  requireUser: mockRequireUser,
-}));
-
-vi.mock("@/db", () => ({
-  db: {
-    update: mockDbUpdate,
-    select: mockDbSelect,
-  },
-}));
-
-vi.mock("@/db/schema", () => schemaTokens);
-
-vi.mock("next/cache", () => ({
-  revalidatePath: mockRevalidatePath,
-}));
-
-import { updateTripTransitMode } from "./transit-actions";
-import { TransitMode } from "@/data/types";
-import { trips } from "@/db/schema";
-const actualTripActivity = await vi.importActual<typeof import("@/lib/trip-activity")>("@/lib/trip-activity");
-
-describe("updateTripTransitMode", () => {
-  const mockWhere = vi.fn();
-  const mockSet = vi.fn();
-
-  beforeEach(() => {
-    vi.clearAllMocks();
-    recordTripUpdated.mockReset();
-    mockAfter.mockReset();
-    mockDbSelect.mockReset();
-    mockMerge.mockReset();
-    mockRequireUser.mockResolvedValue({ id: "user-1" });
-    mockAssertTripAccess.mockResolvedValue(undefined);
-    mockWhere.mockResolvedValue(undefined);
-    mockSet.mockReturnValue({ where: mockWhere });
-    mockDbUpdate.mockReturnValue({ set: mockSet });
-  });
-
-  afterEach(() => {
-    vi.useRealTimers();
-    vi.restoreAllMocks();
-  });
-
-  it("does not await Activity work on the mutation response path", async () => {
-    recordTripUpdated.mockReturnValueOnce(new Promise(() => undefined));
-    await expect(updateTripTransitMode("trip-1", TransitMode.Walk)).resolves.toEqual({ success: true });
-    expect(mockRevalidatePath).toHaveBeenCalledWith("/trips/trip-1");
-  }, 300);
-
-  it("preserves the mutation result when post-response scheduling fails", async () => {
-    recordTripUpdated.mockImplementation(actualTripActivity.recordTripUpdated);
-    mockAfter.mockImplementation(() => {
-      throw new Error("schedule failed");
-    });
-    await expect(updateTripTransitMode("trip-1", TransitMode.Walk)).resolves.toEqual({ success: true });
-    expect(mockDbSelect).not.toHaveBeenCalled();
-    expect(mockMerge).not.toHaveBeenCalled();
-    expect(mockRevalidatePath).toHaveBeenCalledWith("/trips/trip-1");
-  });
-
-  it("preserves the mutation result when the username lookup rejects", async () => {
-    recordTripUpdated.mockImplementation(actualTripActivity.recordTripUpdated);
-    mockDbSelect.mockReturnValue({
-      from: () => ({
-        where: async () => {
-          throw new Error("lookup failed");
-        },
-      }),
-    });
-    const result = await updateTripTransitMode("trip-1", TransitMode.Walk);
-    expect(result).toEqual({ success: true });
-    const callback = mockAfter.mock.calls[0][0] as () => Promise<void>;
-    await expect(callback()).resolves.toBeUndefined();
-    expect(mockMerge).not.toHaveBeenCalled();
-    expect(result).toEqual({ success: true });
-  });
-
-  it("returns the mutation result before a hung username lookup times out", async () => {
-    vi.useFakeTimers();
-    recordTripUpdated.mockImplementation(actualTripActivity.recordTripUpdated);
-    mockDbSelect.mockReturnValue({ from: () => ({ where: () => new Promise(() => undefined) }) });
-    const result = await updateTripTransitMode("trip-1", TransitMode.Walk);
-    expect(result).toEqual({ success: true });
-    expect(mockDbSelect).not.toHaveBeenCalled();
-    const callback = mockAfter.mock.calls[0][0] as () => Promise<void>;
-    const pending = callback();
-    await vi.advanceTimersByTimeAsync(actualTripActivity.TRIP_ACTIVITY_LOOKUP_TIMEOUT_MS);
-    await expect(pending).resolves.toBeUndefined();
-    expect(mockMerge).not.toHaveBeenCalled();
-    expect(result).toEqual({ success: true });
-  });
-
-  it("preserves the mutation result when the Activity write rejects", async () => {
-    vi.spyOn(console, "error").mockImplementation(() => undefined);
-    recordTripUpdated.mockImplementation(actualTripActivity.recordTripUpdated);
-    mockDbSelect.mockReturnValue({ from: () => ({ where: async () => [{ username: "alice" }] }) });
-    mockMerge.mockRejectedValueOnce(new Error("write failed"));
-    const result = await updateTripTransitMode("trip-1", TransitMode.Walk);
-    expect(result).toEqual({ success: true });
-    const lookup = mockAfter.mock.calls[0][0] as () => Promise<void>;
-    await lookup();
-    const write = mockAfter.mock.calls[1][0] as () => Promise<void>;
-    await expect(write()).resolves.toBeUndefined();
-    expect(mockMerge).toHaveBeenCalledOnce();
-    expect(result).toEqual({ success: true });
-  });
-
-  it("requires the user before checking trip access", async () => {
-    await updateTripTransitMode("trip-1", TransitMode.Transit);
-
-    expect(mockRequireUser).toHaveBeenCalledOnce();
-    expect(mockAssertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
-  });
-
-  it("persists a valid transit mode and revalidates the trip page", async () => {
-    const result = await updateTripTransitMode("trip-1", TransitMode.Transit);
-
-    expect(mockDbUpdate).toHaveBeenCalledWith(trips);
-    expect(mockSet).toHaveBeenCalledWith({ transitMode: TransitMode.Transit });
-    expect(mockRevalidatePath).toHaveBeenCalledWith("/trips/trip-1");
-    expect(result).toEqual({ success: true });
-    expect(recordTripUpdated).toHaveBeenCalledExactlyOnceWith("user-1", "trip-1");
-  });
-
-  it("returns an error and does not persist when the transit mode is invalid", async () => {
-    const result = await updateTripTransitMode("trip-1", "flying" as TransitMode);
-
-    expect(result).toEqual({ error: "Invalid transit mode." });
-    expect(mockDbUpdate).not.toHaveBeenCalled();
-    expect(recordTripUpdated).not.toHaveBeenCalled();
-    expect(mockRevalidatePath).not.toHaveBeenCalled();
-  });
-
-  it("does not record a failed database write", async () => {
-    mockWhere.mockRejectedValueOnce(new Error("write"));
-    await expect(updateTripTransitMode("trip-1", TransitMode.Walk)).rejects.toThrow("write");
-    expect(recordTripUpdated).not.toHaveBeenCalled();
-  });
-
-  it("rejects when the user is not authenticated", async () => {
-    mockRequireUser.mockRejectedValue(new Error("Unauthenticated"));
-
-    await expect(updateTripTransitMode("trip-1", TransitMode.Walk)).rejects.toThrow("Unauthenticated");
-    expect(mockAssertTripAccess).not.toHaveBeenCalled();
-    expect(mockDbUpdate).not.toHaveBeenCalled();
-    expect(recordTripUpdated).not.toHaveBeenCalled();
-  });
-
-  it("rejects when the user does not have editor access", async () => {
-    mockAssertTripAccess.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
-
-    await expect(updateTripTransitMode("trip-1", TransitMode.Walk)).rejects.toThrow("NEXT_NOT_FOUND");
-    expect(mockDbUpdate).not.toHaveBeenCalled();
-    expect(recordTripUpdated).not.toHaveBeenCalled();
-  });
-});
diff --git a/src/app/(app)/trips/[tripId]/transit-actions.ts b/src/app/(app)/trips/[tripId]/transit-actions.ts
deleted file mode 100644
index d334e85b..00000000
--- a/src/app/(app)/trips/[tripId]/transit-actions.ts
+++ /dev/null
@@ -1,28 +0,0 @@
-"use server";
-
-import { recordTripUpdated } from "@/lib/trip-activity";
-import { requireUser, assertTripAccess } from "@/lib/auth-helpers";
-import { db } from "@/db";
-import { trips } from "@/db/schema";
-import { eq } from "drizzle-orm";
-import { revalidatePath } from "next/cache";
-import type { TransitMode } from "@/data/types";
-import { isTransitMode } from "@/lib/db-mappers";
-
-export async function updateTripTransitMode(
-  tripId: string,
-  transitMode: TransitMode
-): Promise<{ success: true } | { error: string }> {
-  const user = await requireUser();
-
-  if (!isTransitMode(transitMode)) {
-    return { error: "Invalid transit mode." };
-  }
-
-  await assertTripAccess(tripId, user.id!, "editor");
-
-  await db.update(trips).set({ transitMode }).where(eq(trips.id, tripId));
-  recordTripUpdated(user.id!, tripId);
-  revalidatePath(`/trips/${tripId}`);
-  return { success: true };
-}
diff --git a/src/app/(app)/trips/[tripId]/use-trip-detail-handlers.test.tsx b/src/app/(app)/trips/[tripId]/use-trip-detail-handlers.test.tsx
index 39ec43b4..1dffcd9d 100644
--- a/src/app/(app)/trips/[tripId]/use-trip-detail-handlers.test.tsx
+++ b/src/app/(app)/trips/[tripId]/use-trip-detail-handlers.test.tsx
@@ -1319,3 +1319,21 @@ describe("day handlers", () => {
     await waitFor(() => expect(result.current.removingDay).toBe(false));
   });
 });
+
+it("sends metadata through the API with the chosen currency conversion", async () => {
+  const { api } = await import("@/lib/api/client");
+  const { TripCurrencyChangeMode } = await import("@/data/types");
+  vi.mocked(api).mockResolvedValueOnce({});
+  const { result } = renderHook(() => useTripDetailHandlers(detail));
+  await act(async () => {
+    await result.current.handleTripSave(
+      { name: "New", startDate: null, endDate: null, budgetCurrency: "EUR" },
+      TripCurrencyChangeMode.Convert
+    );
+  });
+  expect(api).toHaveBeenCalledWith(expect.objectContaining({ method: "PATCH", path: "/api/v1/trips/:tripId" }), {
+    params: { tripId: detail.trip.id },
+    body: { name: "New", budgetCurrency: "EUR", convertCurrency: true },
+  });
+  expect(mockRefresh).toHaveBeenCalled();
+});
diff --git a/src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts b/src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts
index fa3d1916..d111ccf5 100644
--- a/src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts
+++ b/src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts
@@ -16,6 +16,7 @@ import type {
   UpdateTripPatch,
 } from "@/data/types";
 import { deleteTrip, updateTripMetadata } from "../actions";
+import { saveTripMetadata } from "@/lib/trip-metadata-save";
 import { useApiMutation } from "@/lib/api/use-api-mutation";
 import {
   createEvent as createEventEndpoint,
@@ -299,13 +300,15 @@ export function useTripDetailHandlers(detail: TripDetailPayload): TripDetailHand
     return new Promise((resolve) => {
       startSaveTripTransition(async () => {
         try {
-          const result = await updateTripMetadata(
-            trip.id,
+          const result = await saveTripMetadata(
+            trip,
             patch,
+            updateTripMetadata,
             resolution,
             confirmation,
             currencyChangeMode === TripCurrencyChangeMode.Convert
           );
+          if (result.status === "saved") router.refresh();
           resolve(result);
         } catch (error) {
           if (currencyChangeMode) {
diff --git a/src/app/(app)/trips/actions.test.ts b/src/app/(app)/trips/actions.test.ts
index 78d237ff..c71a4df1 100644
--- a/src/app/(app)/trips/actions.test.ts
+++ b/src/app/(app)/trips/actions.test.ts
@@ -507,7 +507,7 @@ describe("updateTripMetadata", () => {
     expect(tripUpdate?.values).toEqual(expect.objectContaining({ transitMode: null }));
   });
 
-  it("returns confirmation-required before mutating when removed days contain events", async () => {
+  it("returns confirmation-required before mutating mixed metadata and dates when removed days contain events", async () => {
     const { operations, transaction } = createTransactionMock({
       existingDays: [
         { id: "day-1", tripId: "trip-1", dayNumber: 1, date: "2026-08-01", label: "Day 1" },
@@ -520,6 +520,7 @@ describe("updateTripMetadata", () => {
     );
 
     const result = await updateTripMetadata("trip-1", {
+      name: "Mixed edit",
       startDate: "2026-08-01",
       endDate: "2026-08-01",
     });
diff --git a/src/app/(app)/trips/page-client.test.tsx b/src/app/(app)/trips/page-client.test.tsx
index c218d40d..0708bd9b 100644
--- a/src/app/(app)/trips/page-client.test.tsx
+++ b/src/app/(app)/trips/page-client.test.tsx
@@ -155,6 +155,7 @@ describe("useTripsPageHandlers", () => {
 
     await act(async () => {
       await result.current.handleTripSave("trip-upcoming", {
+        name: "Mixed edit",
         startDate: "2026-06-01",
         endDate: "2026-06-09",
       });
@@ -166,7 +167,7 @@ describe("useTripsPageHandlers", () => {
 
     expect(updateTripMetadata).toHaveBeenLastCalledWith(
       "trip-upcoming",
-      { startDate: "2026-06-01", endDate: "2026-06-09" },
+      { name: "Mixed edit", startDate: "2026-06-01", endDate: "2026-06-09" },
       TripDateConflictResolution.DeleteEvents,
       confirmation
     );
diff --git a/src/app/(app)/trips/use-trips-page-handlers.test.tsx b/src/app/(app)/trips/use-trips-page-handlers.test.tsx
index 743f600c..93abc7f3 100644
--- a/src/app/(app)/trips/use-trips-page-handlers.test.tsx
+++ b/src/app/(app)/trips/use-trips-page-handlers.test.tsx
@@ -2,17 +2,20 @@ import { describe, it, expect, vi, beforeEach } from "vitest";
 import { renderHook, act } from "@testing-library/react";
 import { toast } from "sonner";
 import { createTrip, deleteTrip, updateTripMetadata } from "./actions";
+import { api } from "@/lib/api/client";
 import { useTripsPageHandlers } from "./use-trips-page-handlers";
 import { TripDateConflictResolution, type TripListEntry } from "@/data/types";
 
 const mockPush = vi.hoisted(() => vi.fn());
 
+vi.mock("@/lib/api/client", () => ({ api: vi.fn() }));
+
 vi.mock("sonner", () => ({
   toast: { error: vi.fn() },
 }));
 
 vi.mock("next/navigation", () => ({
-  useRouter: () => ({ push: mockPush }),
+  useRouter: () => ({ push: mockPush, refresh: vi.fn() }),
 }));
 
 vi.mock("./actions", () => ({
@@ -245,3 +248,20 @@ describe("useTripsPageHandlers", () => {
     expect(result.current.deletingTrip?.id).toBe("trip-past");
   });
 });
+
+it("saves metadata with unchanged dates through the API", async () => {
+  vi.mocked(api).mockResolvedValueOnce({} as never);
+  const { result } = renderHook(() => useTripsPageHandlers(datedEntries, NOW));
+  await act(async () => {
+    await result.current.handleTripSave("trip-upcoming", {
+      name: "New",
+      startDate: "2026-06-01",
+      endDate: "2026-06-10",
+    });
+  });
+  expect(api).toHaveBeenCalledWith(expect.objectContaining({ path: "/api/v1/trips/:tripId" }), {
+    params: { tripId: "trip-upcoming" },
+    body: { name: "New" },
+  });
+  expect(updateTripMetadata).not.toHaveBeenCalled();
+});
diff --git a/src/app/(app)/trips/use-trips-page-handlers.ts b/src/app/(app)/trips/use-trips-page-handlers.ts
index ce379324..2a759870 100644
--- a/src/app/(app)/trips/use-trips-page-handlers.ts
+++ b/src/app/(app)/trips/use-trips-page-handlers.ts
@@ -12,6 +12,7 @@ import {
   type UpdateTripMetadataResult,
   type UpdateTripPatch,
 } from "@/data/types";
+import { saveTripMetadata } from "@/lib/trip-metadata-save";
 import { getTripStatus, getTripDays } from "@/lib/utils";
 import { createTrip, deleteTrip, updateTripMetadata } from "./actions";
 
@@ -117,7 +118,10 @@ export function useTripsPageHandlers(initialEntries: TripListEntry[], now: Date)
     return new Promise((resolve) => {
       startTripSave(async () => {
         try {
-          const result = await updateTripMetadata(tripId, patch, resolution, confirmation);
+          const trip = initialEntries.find((entry) => entry.trip.id === tripId)?.trip;
+          if (!trip) throw new Error("Trip not found.");
+          const result = await saveTripMetadata(trip, patch, updateTripMetadata, resolution, confirmation);
+          if (result.status === "saved") router.refresh();
           if (result.status === "saved") {
             closeTripEditSheet();
           } else {
diff --git a/tests/e2e/feature-map.mjs b/tests/e2e/feature-map.mjs
index 0eadacb6..0b861fea 100644
--- a/tests/e2e/feature-map.mjs
+++ b/tests/e2e/feature-map.mjs
@@ -65,6 +65,10 @@ const PASSWORD_RULES = [
 
 export const FEATURE_MAP = [
   entry("api", [
+    "src/lib/services/trips.ts",
+    "src/lib/api/contract/trips.ts",
+    "src/lib/trip-metadata-save.ts",
+    "src/app/api/v1/trips/*/route.ts",
     "src/lib/services/packing.ts",
     "src/app/api/v1/packing-items/**",
     "src/app/api/v1/trips/*/packing/**",
@@ -365,7 +369,6 @@ export const FEATURE_MAP = [
     "src/app/api/v1/trips/*/days/**",
     "src/app/api/v1/itinerary-notes/**",
     "tests/e2e/api-response.ts",
-    "src/app/(app)/trips/[tripId]/transit-actions.ts",
     "src/app/(app)/trips/[tripId]/budget/actions.ts",
     "src/app/(app)/trips/[tripId]/reservations/actions.ts",
     "src/app/(app)/trips/packing-actions.ts",
@@ -854,6 +857,10 @@ export const FEATURE_MAP = [
     "src/lib/error-utils.ts",
   ]),
   entry("travel-history", [
+    "src/lib/services/trips.ts",
+    "src/lib/api/contract/trips.ts",
+    "src/lib/trip-metadata-save.ts",
+    "src/app/api/v1/trips/*/route.ts",
     "src/components/arrivo/travel-history-list.tsx",
     "src/components/arrivo/trips-past-list.tsx",
     "src/components/arrivo/mobile-past-tab.tsx",
@@ -950,6 +957,10 @@ export const FEATURE_MAP = [
     "tests/e2e/api-response.ts",
   ]),
   entry("trip-tabs", [
+    "src/lib/services/trips.ts",
+    "src/lib/api/contract/trips.ts",
+    "src/lib/trip-metadata-save.ts",
+    "src/app/api/v1/trips/*/route.ts",
     "src/components/arrivo/active-trip-summary-events.ts",
     "src/components/arrivo/active-trip-summary-time.ts",
     "src/components/arrivo/mobile-active-tab.tsx",
@@ -977,6 +988,10 @@ export const FEATURE_MAP = [
     "src/app/(app)/trips/[tripId]/trip-detail-hero.tsx",
   ]),
   entry("trips", [
+    "src/lib/services/trips.ts",
+    "src/lib/api/contract/trips.ts",
+    "src/lib/trip-metadata-save.ts",
+    "src/app/api/v1/trips/*/route.ts",
     "src/components/arrivo/currency-picker.tsx",
     "src/components/arrivo/trip-budget-tab.tsx",
     "src/components/arrivo/trip-add-expense-modal.tsx",
@@ -988,7 +1003,6 @@ export const FEATURE_MAP = [
     "src/components/arrivo/trip-card.tsx",
     "src/components/arrivo/trip-edit-*.tsx",
     "src/components/arrivo/getting-around-section.tsx",
-    "src/app/(app)/trips/[tripId]/transit-actions.ts",
     "src/components/arrivo/trip-hero.tsx",
     "src/components/arrivo/trip-date-change-confirmation-dialog.tsx",
     "src/components/arrivo/trip-currency-change-dialog.tsx",
diff --git a/tests/e2e/features/api.feature b/tests/e2e/features/api.feature
index ce29e0a0..0200371e 100644
--- a/tests/e2e/features/api.feature
+++ b/tests/e2e/features/api.feature
@@ -2621,3 +2621,37 @@ Feature: Absolute checklist checked-state API
     And my checklist API role is "editor"
     When I pull that sectioned template into the selected list
     Then the packing pull stores the item under its section in that list
+
+  Scenario Outline: Trip metadata PATCH enforces access
+    Given my checklist API role is "<role>"
+    When I PATCH trip metadata to "API renamed"
+    Then the trip metadata API returns <status> and stores "<stored>"
+    Examples:
+      | role     | status | stored      |
+      | editor   | 200    | API renamed |
+      | viewer   | 403    | original    |
+      | stranger | 404    | original    |
+
+  Scenario Outline: Trip metadata replay rechecks access
+    Given my checklist API role is "editor"
+    When I commit keyed trip metadata
+    And my checklist API role is "<role>"
+    And I replay keyed trip metadata
+    Then the trip metadata API returns <status> and stores "Keyed name"
+    Examples:
+      | role     | status |
+      | viewer   | 403    |
+      | stranger | 404    |
+
+  Scenario: Trip currency conversion persists with metadata
+    Given my checklist API role is "editor"
+    And a USD expense exists for trip currency conversion
+    When I PATCH trip currency to EUR with conversion
+    Then trip currency conversion is committed
+
+  Scenario: Trip currency conversion rolls back when the transaction fails
+    Given my checklist API role is "editor"
+    And a USD expense exists for trip currency conversion
+    And the checklist API replay record write is set to fail
+    When I PATCH trip currency to EUR with conversion using the failing key
+    Then trip currency conversion is rolled back
diff --git a/tests/e2e/features/day-planning.feature b/tests/e2e/features/day-planning.feature
index b7c48f55..1f408d2e 100644
--- a/tests/e2e/features/day-planning.feature
+++ b/tests/e2e/features/day-planning.feature
@@ -182,6 +182,19 @@ Feature: Day Planning
     When I keep the displaced events as unscheduled
     Then the removed day's events are persisted as unscheduled
 
+  @date-edit-keep-unscheduled
+  Scenario: Mixed metadata and date edits commit only after confirmation
+    When I open the trip edit sheet
+    And I change the trip name to "Mixed edit"
+    And I shorten the trip date range to the first future trip day
+    And I save the trip date change
+    Then the trip edit warning explains the removed trip dates
+    And mixed trip changes have not been stored
+    When I cancel the trip date warning
+    Then mixed trip changes have not been stored
+    When I save the trip date change
+    And I confirm the mixed trip edit
+    Then mixed trip changes are stored together
   @date-edit-delete-events
   Scenario: User shortens a populated date range and deletes displaced events
     When I open the trip edit sheet
@@ -269,3 +282,4 @@ Feature: Day Planning
     When I add a checklist with item "Recover item"
     And I add a second checklist item "Keep item"
     Then a failed checklist item edit and delete roll back and their retries persist
+
diff --git a/tests/e2e/features/travel-history.feature b/tests/e2e/features/travel-history.feature
index 188bbcd6..11b67911 100644
--- a/tests/e2e/features/travel-history.feature
+++ b/tests/e2e/features/travel-history.feature
@@ -28,6 +28,8 @@ Feature: Travel History
     And I change the trip name to "Renamed Past Trip"
     And I save
     Then I see "Renamed Past Trip" in the travel history list
+    When I reload the browser page
+    Then I see "Renamed Past Trip" in the travel history list
 
   Scenario: Deleting a past trip from Travel History
     Given I have a past trip available in my travel history
@@ -43,3 +45,4 @@ Feature: Travel History
     Then I do not see "Berlin Wrap" on the trips page
     And the trips page has no Past section
     And I see an "Upcoming" section with "E2E Test Trip"
+
diff --git a/tests/e2e/features/trip-tabs.feature b/tests/e2e/features/trip-tabs.feature
index 7a4b3766..7b007f40 100644
--- a/tests/e2e/features/trip-tabs.feature
+++ b/tests/e2e/features/trip-tabs.feature
@@ -26,3 +26,11 @@ Feature: Trip detail tab deep links
     When I go forward in the browser
     Then the "Itinerary" tab content is visible
     And the trip URL has no tab deep link
+
+  Scenario: Editing trip details from a deep-linked tab persists
+    Given I have an existing trip
+    When I reopen the trip with the "Documents" tab deep link
+    And I open the trip edit sheet
+    And I change the trip name to "Deep link edit"
+    And I save
+    Then the edited trip title persists after reload as "Deep link edit"
diff --git a/tests/e2e/features/trips.feature b/tests/e2e/features/trips.feature
index d665d96c..664236cb 100644
--- a/tests/e2e/features/trips.feature
+++ b/tests/e2e/features/trips.feature
@@ -9,6 +9,18 @@ Feature: Trip Management
     And I change the trip name to "Renamed Trip"
     And I save
     Then the trip should display "Renamed Trip"
+    When I reload the browser page
+    Then the trip should display "Renamed Trip"
+
+  Scenario: Editing a trip from the trips list persists
+    Given I have an existing trip
+    When I navigate to the trips list
+    And I open the trip options menu for "E2E Test Trip"
+    And I choose "Edit trip" from the trip options menu
+    And I change the trip name to "List Edit"
+    And I save
+    And I reload the browser page
+    Then I see "List Edit" in the travel history list
 
   Scenario: A blank trip name cannot be saved
     Given I have an existing trip
@@ -76,3 +88,4 @@ Feature: Trip Management
     And I save
     And I open the trip edit sheet
     Then the trip edit sheet shows "Walk" as the selected transit mode
+
diff --git a/tests/e2e/steps/api.steps.ts b/tests/e2e/steps/api.steps.ts
index 732324b7..3abaa27a 100644
--- a/tests/e2e/steps/api.steps.ts
+++ b/tests/e2e/steps/api.steps.ts
@@ -4546,3 +4546,101 @@ Then("the packing pull stores the item under its section in that list", async ({
       .sort()
   ).toEqual([current.doomedId, current.keptId].sort());
 });
+
+When("I PATCH trip metadata to {string}", async ({ page, scenario }, name: string) => {
+  state(page).response = await (
+    await apiClient(page)
+  ).patch(`/api/v1/trips/${scenario.currentTrip!.id}`, {
+    headers: headers(page),
+    data: { name, budgetTotal: 0 },
+  });
+});
+Then(
+  "the trip metadata API returns {int} and stores {string}",
+  async ({ page, scenario }, status: number, stored: string) => {
+    expect(state(page).response?.status()).toBe(status);
+    const [trip] = await withE2EDb((database) =>
+      database.select().from(trips).where(eq(trips.id, scenario.currentTrip!.id))
+    );
+    expect(trip.name).toBe(stored === "original" ? scenario.currentTrip!.name : stored);
+    if (status === 200) expect(Number(trip.budgetTotal)).toBe(0);
+    expect(trip.startDate).toBe(scenario.currentTrip!.startDate ?? null);
+    expect(trip.endDate).toBe(scenario.currentTrip!.endDate ?? null);
+  }
+);
+
+When("I commit keyed trip metadata", async ({ page, scenario }) => {
+  const response = await (
+    await apiClient(page)
+  ).patch(`/api/v1/trips/${scenario.currentTrip!.id}`, {
+    headers: { ...headers(page), "Idempotency-Key": state(page).key },
+    data: { name: "Keyed name" },
+  });
+  expect(response.status()).toBe(200);
+});
+When("I replay keyed trip metadata", async ({ page, scenario }) => {
+  state(page).response = await (
+    await apiClient(page)
+  ).patch(`/api/v1/trips/${scenario.currentTrip!.id}`, {
+    headers: { ...headers(page), "Idempotency-Key": state(page).key },
+    data: { name: "Keyed name" },
+  });
+});
+
+Given("a USD expense exists for trip currency conversion", async ({ scenario }) => {
+  await withE2EDb(async (database) => {
+    await database.update(trips).set({ budgetCurrency: "USD" }).where(eq(trips.id, scenario.currentTrip!.id));
+    await database
+      .insert(expenses)
+      .values({
+        tripId: scenario.currentTrip!.id,
+        category: "Food",
+        amount: "100",
+        currency: "USD",
+        date: "2025-01-01",
+        convertedAmountTrip: "100",
+        conversionRateTrip: "1",
+        convertedCurrencyTrip: "USD",
+      });
+  });
+});
+When("I PATCH trip currency to EUR with conversion", async ({ page, scenario }) => {
+  state(page).response = await (
+    await apiClient(page)
+  ).patch(`/api/v1/trips/${scenario.currentTrip!.id}`, {
+    headers: headers(page),
+    data: { budgetCurrency: "EUR", convertCurrency: true },
+  });
+});
+When("I PATCH trip currency to EUR with conversion using the failing key", async ({ page, scenario }) => {
+  state(page).response = await (
+    await apiClient(page)
+  ).patch(`/api/v1/trips/${scenario.currentTrip!.id}`, {
+    headers: { ...headers(page), "Idempotency-Key": state(page).key },
+    data: { budgetCurrency: "EUR", convertCurrency: true },
+  });
+});
+Then("trip currency conversion is committed", async ({ page, scenario }) => {
+  expect(state(page).response?.status()).toBe(200);
+  const [trip] = await withE2EDb((database) =>
+    database.select().from(trips).where(eq(trips.id, scenario.currentTrip!.id))
+  );
+  const [expense] = await withE2EDb((database) =>
+    database.select().from(expenses).where(eq(expenses.tripId, scenario.currentTrip!.id))
+  );
+  expect(trip.budgetCurrency).toBe("EUR");
+  expect(expense.convertedCurrencyTrip).toBe("EUR");
+  expect(Number(expense.convertedAmountTrip)).toBe(92);
+});
+Then("trip currency conversion is rolled back", async ({ page, scenario }) => {
+  expect(state(page).response?.status()).toBe(500);
+  const [trip] = await withE2EDb((database) =>
+    database.select().from(trips).where(eq(trips.id, scenario.currentTrip!.id))
+  );
+  const [expense] = await withE2EDb((database) =>
+    database.select().from(expenses).where(eq(expenses.tripId, scenario.currentTrip!.id))
+  );
+  expect(trip.budgetCurrency).toBe("USD");
+  expect(expense.convertedCurrencyTrip).toBe("USD");
+  expect(Number(expense.convertedAmountTrip)).toBe(100);
+});
diff --git a/tests/e2e/steps/day-planning.steps.ts b/tests/e2e/steps/day-planning.steps.ts
index 69853a18..b9ea1c4d 100644
--- a/tests/e2e/steps/day-planning.steps.ts
+++ b/tests/e2e/steps/day-planning.steps.ts
@@ -1,3 +1,4 @@
+import { waitForServerActionSettled } from "../server-action";
 import { expect, type Locator, type Page } from "@playwright/test";
 import { and, desc, eq } from "drizzle-orm";
 import { days, events, itineraryNotes, trips } from "../../../src/db/schema";
@@ -1871,3 +1872,29 @@ Then("a failed checklist item edit and delete roll back and their retries persis
       .evaluateAll((elements) => elements.map((element) => element.textContent?.trim()))
   ).toEqual(["Keep item"]);
 });
+
+Then("mixed trip changes have not been stored", async ({ scenario }) => {
+  const [trip] = await withE2EDb((database) =>
+    database.select().from(trips).where(eq(trips.id, scenario.currentTrip!.id))
+  );
+  expect(trip.name).toBe("Keep Unscheduled Edit Trip");
+  expect(trip.endDate).toBe(E2E_TRIP_SECOND_DATE);
+});
+When("I cancel the trip date warning", async ({ page }) => {
+  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
+  await expect(page.getByRole("alertdialog")).not.toBeVisible();
+});
+When("I confirm the mixed trip edit", async ({ page }) => {
+  await expect(page.getByRole("alertdialog")).toBeVisible();
+  const saved = waitForServerActionSettled(page, { pathIncludes: "" });
+  await page.getByRole("alertdialog").getByRole("button", { name: "Keep Events" }).click();
+  await saved;
+});
+Then("mixed trip changes are stored together", async ({ page, scenario }) => {
+  await reloadPage(page);
+  const [trip] = await withE2EDb((database) =>
+    database.select().from(trips).where(eq(trips.id, scenario.currentTrip!.id))
+  );
+  expect(trip.name).toBe("Mixed edit");
+  expect(trip.endDate).toBe(E2E_TRIP_START_DATE);
+});
diff --git a/tests/e2e/steps/trip-tabs.steps.ts b/tests/e2e/steps/trip-tabs.steps.ts
index e0624024..35b2e6af 100644
--- a/tests/e2e/steps/trip-tabs.steps.ts
+++ b/tests/e2e/steps/trip-tabs.steps.ts
@@ -89,3 +89,8 @@ Then("the trip URL has no tab deep link", async ({ page }) => {
   const currentUrl = new URL(page.url());
   expect(currentUrl.searchParams.has("tab")).toBe(false);
 });
+
+Then("the edited trip title persists after reload as {string}", async ({ page }, name: string) => {
+  await reloadPage(page);
+  await expect(page.getByRole("heading", { level: 1 })).toContainText(name);
+});
diff --git a/tests/e2e/steps/trips.steps.ts b/tests/e2e/steps/trips.steps.ts
index 0d7b3a9b..5670b867 100644
--- a/tests/e2e/steps/trips.steps.ts
+++ b/tests/e2e/steps/trips.steps.ts
@@ -1,7 +1,7 @@
 import { expect } from "@playwright/test";
 import { format, parseISO } from "date-fns";
 import { Given, When, Then } from "../fixtures";
-import { waitForServerActionSettled } from "../server-action";
+import { waitForApiResponse } from "../api-response";
 
 Given("I have an existing trip", async ({ page, scenario }) => {
   await scenario.signIn(page);
@@ -56,14 +56,13 @@ When("I type {string} in the budget field", async ({ page }, budget: string) =>
   await page.getByRole("dialog").getByRole("textbox", { name: "Budget" }).fill(budget);
 });
 
-When("I save", async ({ page }) => {
-  // The sheet is used from the trip page and from Travel History, so any page's server action counts.
-  const saved = waitForServerActionSettled(page, { pathIncludes: "" });
+When("I save", async ({ page, scenario }) => {
+  const saved = waitForApiResponse(page, { method: "PATCH", path: `/api/v1/trips/${scenario.currentTrip!.id}` });
   await page.getByRole("button", { name: "Save changes" }).click();
   // Count, not visibility: the drawer and any popover inside it run their exit animations together.
   await expect(page.getByRole("dialog")).toHaveCount(0);
   // The sheet seeds its draft from the trip prop only while closed, so reopening before the revalidated trip
-  // lands (the dialog closes first) shows the old values. Wait for the action's payload, then two frames for React.
+  // lands (the dialog closes first) shows the old values. Wait for the API response, then two frames for React.
   await saved;
   await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
 });
@@ -174,3 +173,4 @@ Then("the trip edit sheet shows {string} as the selected transit mode", async ({
   const section = page.getByRole("dialog").getByRole("group", { name: /default transit mode/i });
   await expect(section.getByRole("button", { name: mode, exact: true })).toHaveAttribute("aria-pressed", "true");
 });
+
diff --git a/_bmad-output/initiative-mobile-api/epic-trips-packing-api/story-edit-trip-details-through-the-api-plan.md b/_bmad-output/initiative-mobile-api/epic-trips-packing-api/story-edit-trip-details-through-the-api-plan.md
new file mode 100644
index 00000000..b6186414
--- /dev/null
+++ b/_bmad-output/initiative-mobile-api/epic-trips-packing-api/story-edit-trip-details-through-the-api-plan.md
@@ -0,0 +1,77 @@
+---
+title: "Edit trip details through the API"
+type: feature
+ticket: 6
+created: 2026-11-20
+status: in-review
+baseline_revision: "e5f34139b5f1ff153ca2b7adae48c760e5182aa8"
+route: full
+route_source: auto
+risk: high
+review: 'thorough'
+review_source: 'auto'
+lenses_ran: []
+review_loop_iteration: 0
+context: ["{project-root}/_bmad-output/initiative-mobile-api/AGENTS.md"]
+---
+
+<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">
+
+## Intent
+
+**Problem:** Trip metadata edits depend on a server action unavailable to API clients.
+
+**Approach:** Add a partial trip metadata PATCH and migrate metadata-only edits from trips, trip detail and travel history, preserving existing behavior and currency conversion.
+
+## Boundaries & Constraints
+
+**Always:** Story branch `story/5-6-trip-details-api`; PR base `feature/api-v1`. Test first. Preserve editor authorization, transactional locking, conversion rollback, activity, live events, refresh and error handling. API writes recheck access for idempotent replay. Unsent fields remain unchanged. No schema or environment changes.
+
+**Never:** Add date or cover fields to this endpoint, migrate trip date changes or covers, alter server-side page reads, commit directly to the integration branch, or target main.
+
+## I/O & Edge-Case Matrix
+
+| Scenario | Input / state | Expected behavior |
+| --- | --- | --- |
+| Partial edit | Name, destination, tags, budget or transit mode provided | Only supplied metadata changes; nullable values and zero retain their meaning |
+| Currency | Supported currency with conversion requested | Recalculate expense amounts in the same locked transaction; failure rolls back all changes. Without conversion, preserve amounts |
+| Invalid input | Unknown, date, cover, unsupported currency or invalid mode | Reject without writing |
+| Access and replay | Editor, viewer, stranger or keyed retry | Editor succeeds; viewer 403; stranger 404; replay rechecks authorization without repeating writes |
+| Mixed edit | Metadata and dates changed together | Keep entire request on existing date action until story 5.7; conflict preview/cancel commits nothing and confirmation remains atomic |
+
+</frozen-after-approval>
+
+## Code Map
+
+- `src/app/(app)/trips/actions.ts` — `updateTripMetadata` combines metadata, dates, covers and conversion; keep date/cover action and its confirmation behavior for story 5.7. Conversion uses `recalculateAll` and `dbExpenseToType` within a locked transaction.
+- `src/lib/services/trip-write.ts` — reuse `runTripWrite`, locking, authorization, idempotency and after-write effects. Preserve `/trips` revalidation and existing live events. `src/lib/validation-schemas.ts` contains the existing update constraints; derive a strict metadata-only request schema.
+- `src/lib/api/contract/packing.ts`, `src/app/api/v1/packing-items/[itemId]/route.ts` — contract and route patterns. `src/data/types.ts` owns domain types. `docs/api-v1.md` and `tests/e2e/feature-map.mjs` document and map endpoint ownership.
+- `src/components/arrivo/trip-edit-sheet.tsx` sends dates even when unchanged; compare against the original trip in the callers, not mere field presence. Preserve unchanged null/date semantics and whole mixed patches on the legacy action. Detail alone passes conversion choice.
+- `src/app/(app)/trips/use-trips-page-handlers.ts`, `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts`, `src/app/(app)/travel-history/use-travel-history-page-handlers.ts` — migrate metadata-only saves, retaining date confirmation, pending state and error behavior. `src/app/(app)/trips/[tripId]/transit-actions.ts` has no production callers.
+
+## Tasks & Acceptance
+
+**Execution:**
+
+- [ ] Tests first: create `src/lib/services/trips.test.ts`, `src/lib/api/contract/trips.test.ts`, and `src/app/api/v1/trips/[tripId]/route.test.ts`. Cover matrix cases, normalized currency, null/zero, conversion failure rollback, partial preservation, effects and replay authorization. Update `src/app/(app)/trips/actions.test.ts` for retained date/cover behavior.
+- [ ] Tests first: update `src/app/(app)/trips/use-trips-page-handlers.test.tsx`, `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.test.tsx`, `src/app/(app)/travel-history/use-travel-history-page-handlers.test.tsx`, and `src/app/(app)/trips/page-client.test.tsx`. Verify metadata API calls, errors, unchanged dates, mixed edit confirmation/cancel and conversion choice. Create `src/lib/trip-metadata-save.test.ts` for date comparison, nullable dates and dispatch of mixed edits.
+- [ ] Extend `tests/e2e/features/trips.feature`, `trip-tabs.feature`, `travel-history.feature`, `api.feature` and `tests/e2e/steps/trips.steps.ts`, `trip-tabs.steps.ts`, `travel-history.steps.ts`, `api.steps.ts` for edits and reload from all three callers, API partial preservation, conversion and access. Use scenario-owned fixtures and API waits for metadata; retain server-action waits for date saves.
+- [ ] Add `src/lib/services/trips.ts`, `src/lib/api/contract/trips.ts`, and `src/app/api/v1/trips/[tripId]/route.ts` for strict PATCH, atomic conversion and authorized replay. Create `src/lib/trip-metadata-save.ts` for shared date comparison and update the three handlers; keep mixed date edits atomic on the existing action. Remove unused `transit-actions.ts` and its tests. Update `docs/api-v1.md` and register service, contract and route in `tests/e2e/feature-map.mjs` for all affected features.
+
+**Acceptance Criteria:**
+
+- Given an editor changes metadata on trips, trip detail or travel history, when they save and reload, then the change persists and omitted fields remain unchanged.
+- Given a metadata edit with changed dates requiring confirmation, when the user cancels or confirms, then no partial metadata is saved before confirmation and the existing date behavior remains intact.
+- Given a viewer or stranger sends PATCH, when authorization is checked, then the response is 403 or 404 respectively and nothing changes.
+- Given a requested currency conversion, when it succeeds or fails, then expense conversions and trip currency commit together or both roll back.
+
+## Implementation Notes
+
+## Plan Change Log
+
+## Review Triage Log
+
+## Verification
+
+- Run targeted Vitest files and affected trip, travel-history and API scenarios first.
+- Invoke `build-validator` after targeted checks pass; it runs lint, types, build, coverage and affected E2E in the required order.
diff --git a/src/app/api/v1/trips/[tripId]/route.test.ts b/src/app/api/v1/trips/[tripId]/route.test.ts
new file mode 100644
index 00000000..5bfb7736
--- /dev/null
+++ b/src/app/api/v1/trips/[tripId]/route.test.ts
@@ -0,0 +1,17 @@
+import { expect, it, vi } from "vitest";
+const { update, apiRoute } = vi.hoisted(() => ({
+  update: vi.fn(),
+  apiRoute: vi.fn((...args: [unknown, (input: unknown) => unknown, unknown?]) => args[1]),
+}));
+vi.mock("@/lib/services/trips", () => ({ updateTrip: update }));
+vi.mock("@/lib/api/route", () => ({ apiRoute }));
+import { PATCH } from "./route";
+import { updateTrip } from "@/lib/api/contract/trips";
+it("registers the idempotent route and forwards the request", async () => {
+  expect(apiRoute.mock.calls.find((call) => call[0] === updateTrip)?.[2]).toEqual({ idempotent: {} });
+  const actor = { userId: "user" };
+  const replay = { key: "retry", method: "PATCH", path: "/test" };
+  const body = { name: "Trip" };
+  await (PATCH as unknown as (input: unknown) => Promise<unknown>)({ actor, params: { tripId: "trip" }, body, replay });
+  expect(update).toHaveBeenCalledWith(actor, "trip", body, replay);
+});
diff --git a/src/app/api/v1/trips/[tripId]/route.ts b/src/app/api/v1/trips/[tripId]/route.ts
new file mode 100644
index 00000000..6e1a0d97
--- /dev/null
+++ b/src/app/api/v1/trips/[tripId]/route.ts
@@ -0,0 +1,9 @@
+import { apiRoute } from "@/lib/api/route";
+import { updateTrip } from "@/lib/api/contract/trips";
+import { updateTrip as update } from "@/lib/services/trips";
+
+export const PATCH = apiRoute(
+  updateTrip,
+  ({ actor, params, body, replay }) => update(actor, params.tripId, body, replay),
+  { idempotent: {} }
+);
diff --git a/src/lib/api/contract/trips.test.ts b/src/lib/api/contract/trips.test.ts
new file mode 100644
index 00000000..d046cb51
--- /dev/null
+++ b/src/lib/api/contract/trips.test.ts
@@ -0,0 +1,21 @@
+import { expect, it } from "vitest";
+import { updateTrip } from "./trips";
+
+const tripId = "123e4567-e89b-12d3-a456-426614174000";
+it("validates strict partial metadata and normalizes currency", () => {
+  expect(updateTrip.params.parse({ tripId: tripId.toUpperCase() })).toEqual({ tripId });
+  expect(updateTrip.body.parse({ budgetTotal: 0, budgetCurrency: "usd", destinationName: null })).toMatchObject({
+    budgetTotal: 0,
+    budgetCurrency: "USD",
+    destinationName: null,
+  });
+  expect(updateTrip.body.parse({})).toEqual({});
+  for (const body of [
+    { startDate: "2026-01-01" },
+    { coverUrl: "x" },
+    { extra: true },
+    { budgetCurrency: "ZZZ" },
+    { transitMode: "invalid" },
+  ])
+    expect(updateTrip.body.safeParse(body).success).toBe(false);
+});
diff --git a/src/lib/api/contract/trips.ts b/src/lib/api/contract/trips.ts
new file mode 100644
index 00000000..8a90ad17
--- /dev/null
+++ b/src/lib/api/contract/trips.ts
@@ -0,0 +1,31 @@
+import { z } from "zod";
+import type { Trip } from "@/data/types";
+import { TransitMode } from "@/data/types";
+import { isSupportedCurrencyCode } from "@/lib/currencies";
+import { updateTripSchema } from "@/lib/validation-schemas";
+import { defineEndpoint } from "../endpoint";
+
+export const updateTrip = defineEndpoint<Trip>()({
+  method: "PATCH",
+  path: "/api/v1/trips/:tripId",
+  params: z.object({ tripId: z.uuid().toLowerCase() }),
+  body: z.strictObject({
+    ...updateTripSchema.pick({
+      name: true,
+      destinationName: true,
+      destinationCountry: true,
+      destinationCountryCode: true,
+      notes: true,
+      budgetTotal: true,
+      tags: true,
+    }).shape,
+    budgetCurrency: z
+      .string()
+      .trim()
+      .toUpperCase()
+      .refine(isSupportedCurrencyCode, "Invalid budget currency.")
+      .optional(),
+    transitMode: z.enum(TransitMode).nullable().optional(),
+    convertCurrency: z.boolean().optional(),
+  }),
+});
diff --git a/src/lib/services/trips.test.ts b/src/lib/services/trips.test.ts
new file mode 100644
index 00000000..7ea093b1
--- /dev/null
+++ b/src/lib/services/trips.test.ts
@@ -0,0 +1,94 @@
+import { beforeEach, expect, it, vi } from "vitest";
+import { trips, expenses } from "@/db/schema";
+const mocks = vi.hoisted(() => ({
+  requireRole: vi.fn(),
+  lock: vi.fn(),
+  run: vi.fn(),
+  select: vi.fn(),
+  update: vi.fn(),
+  set: vi.fn(),
+  recalculate: vi.fn(),
+  markChanged: vi.fn(),
+}));
+vi.mock("./trip-access", async (original) => ({
+  ...(await original<typeof import("./trip-access")>()),
+  requireTripRole: mocks.requireRole,
+}));
+vi.mock("./trip-write", () => ({ lockTrip: mocks.lock, runTripWrite: mocks.run }));
+vi.mock("@/lib/currency", () => ({ recalculateAll: mocks.recalculate }));
+import { updateTrip } from "./trips";
+const tripId = "123e4567-e89b-12d3-a456-426614174000";
+const actor = { userId: "user" };
+const row = {
+  id: tripId,
+  name: "Old",
+  startDate: null,
+  endDate: null,
+  tags: [],
+  transitMode: null,
+  budgetTotal: null,
+  budgetCurrency: "USD",
+};
+beforeEach(() => {
+  vi.clearAllMocks();
+  mocks.select.mockReturnValue({ from: (table: unknown) => ({ where: async () => (table === trips ? [row] : []) }) });
+  mocks.update.mockReturnValue({ set: mocks.set });
+  mocks.set.mockReturnValue({ where: () => ({ returning: async () => [{ ...row, name: "New" }] }) });
+  mocks.run.mockImplementation(async (_actor, _tripId, _options, steps) => {
+    const work = steps({ select: mocks.select, update: mocks.update }, mocks.markChanged);
+    await work.authorize();
+    return work.mutate();
+  });
+  mocks.recalculate.mockResolvedValue([]);
+});
+it("locks and rechecks editor access, preserving omitted metadata", async () => {
+  await updateTrip(actor, tripId, { name: "New", budgetTotal: 0 });
+  expect(mocks.requireRole).toHaveBeenCalledTimes(2);
+  expect(mocks.lock).toHaveBeenCalled();
+  expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ name: "New", budgetTotal: "0" }));
+  expect(mocks.update).toHaveBeenCalledWith(trips);
+  expect(mocks.markChanged).toHaveBeenCalledOnce();
+  expect(mocks.run).toHaveBeenCalledWith(
+    actor,
+    tripId,
+    expect.objectContaining({ revalidate: ["/trips"] }),
+    expect.any(Function)
+  );
+});
+it("recalculates within the write transaction and aborts on failure", async () => {
+  mocks.recalculate.mockRejectedValueOnce(new Error("conversion failed"));
+  await expect(updateTrip(actor, tripId, { budgetCurrency: "eur", convertCurrency: true })).rejects.toThrow(
+    "conversion failed"
+  );
+  expect(mocks.update).not.toHaveBeenCalledWith(trips);
+  expect(mocks.recalculate).toHaveBeenCalledWith([], "EUR");
+  expect(mocks.select).toHaveBeenCalled();
+  expect(expenses).toBeDefined();
+});
+it("rejects access before starting the write and rechecks inside the lock", async () => {
+  mocks.requireRole.mockRejectedValueOnce(new Error("denied"));
+  await expect(updateTrip(actor, tripId, { name: "New" })).rejects.toThrow("denied");
+  expect(mocks.run).not.toHaveBeenCalled();
+  mocks.requireRole.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("revoked"));
+  await expect(updateTrip(actor, tripId, { name: "New" })).rejects.toThrow("revoked");
+  expect(mocks.update).not.toHaveBeenCalled();
+});
+it("returns unchanged data for an empty patch", async () => {
+  await expect(updateTrip(actor, tripId, {})).resolves.toMatchObject({ id: tripId, name: "Old" });
+  expect(mocks.update).not.toHaveBeenCalled();
+});
+it("converts expenses and persists their rates before the trip update", async () => {
+  mocks.recalculate.mockResolvedValue([{ expenseId: "expense", convertedAmount: 12, rate: 1.2 }]);
+  mocks.set.mockReturnValue({ where: () => ({ returning: async () => [{ ...row, budgetCurrency: "EUR" }] }) });
+  await updateTrip(actor, tripId, { budgetCurrency: "EUR", convertCurrency: true });
+  expect(mocks.update).toHaveBeenCalledWith(expenses);
+  expect(mocks.set).toHaveBeenCalledWith(
+    expect.objectContaining({ convertedAmountTrip: "12", conversionRateTrip: "1.2", convertedCurrencyTrip: "EUR" })
+  );
+});
+it("rejects missing rows before or after updating", async () => {
+  mocks.select.mockReturnValueOnce({ from: () => ({ where: async () => [] }) });
+  await expect(updateTrip(actor, tripId, { name: "New" })).rejects.toThrow();
+  mocks.set.mockReturnValueOnce({ where: () => ({ returning: async () => [] }) });
+  await expect(updateTrip(actor, tripId, { name: "New" })).rejects.toThrow();
+});
diff --git a/src/lib/services/trips.ts b/src/lib/services/trips.ts
new file mode 100644
index 00000000..aed6b5cd
--- /dev/null
+++ b/src/lib/services/trips.ts
@@ -0,0 +1,61 @@
+import "server-only";
+import { eq } from "drizzle-orm";
+import { trips, expenses } from "@/db/schema";
+import type { Actor, IdempotentRequest, Trip } from "@/data/types";
+import { updateTrip as contract } from "@/lib/api/contract/trips";
+import { dbExpenseToType, dbTripToType } from "@/lib/db-mappers";
+import { recalculateAll } from "@/lib/currency";
+import { requireTripRole, TripNotFoundError } from "./trip-access";
+import { lockTrip, runTripWrite } from "./trip-write";
+
+export async function updateTrip(
+  actor: Actor,
+  tripId: string,
+  input: unknown,
+  replay?: IdempotentRequest
+): Promise<Trip> {
+  tripId = contract.params.parse({ tripId }).tripId;
+  const { convertCurrency, ...patch } = contract.body.parse(input);
+  await requireTripRole(tripId, actor.userId, "editor");
+  return runTripWrite(
+    actor,
+    tripId,
+    { replay, payload: { ...patch, convertCurrency }, revalidate: ["/trips"] },
+    (transaction, markChanged) => ({
+      authorize: async () => {
+        await lockTrip(transaction, tripId);
+        await requireTripRole(tripId, actor.userId, "editor", transaction);
+      },
+      mutate: async () => {
+        const [current] = await transaction.select().from(trips).where(eq(trips.id, tripId));
+        if (!current) throw new TripNotFoundError();
+        if (convertCurrency && patch.budgetCurrency) {
+          const rows = await transaction.select().from(expenses).where(eq(expenses.tripId, tripId));
+          const results = await recalculateAll(rows.map(dbExpenseToType), patch.budgetCurrency);
+          await Promise.all(
+            results.map((result) =>
+              transaction
+                .update(expenses)
+                .set({
+                  convertedAmountTrip: result.convertedAmount.toString(),
+                  conversionRateTrip: result.rate.toString(),
+                  convertedCurrencyTrip: patch.budgetCurrency,
+                  updatedAt: new Date(),
+                })
+                .where(eq(expenses.id, result.expenseId))
+            )
+          );
+        }
+        if (Object.keys(patch).length === 0 && !convertCurrency) return dbTripToType(current);
+        const [updated] = await transaction
+          .update(trips)
+          .set({ ...patch, budgetTotal: patch.budgetTotal?.toString(), updatedAt: new Date() })
+          .where(eq(trips.id, tripId))
+          .returning();
+        if (!updated) throw new TripNotFoundError();
+        markChanged();
+        return dbTripToType(updated);
+      },
+    })
+  );
+}
diff --git a/src/lib/trip-metadata-save.test.ts b/src/lib/trip-metadata-save.test.ts
new file mode 100644
index 00000000..8c528fc1
--- /dev/null
+++ b/src/lib/trip-metadata-save.test.ts
@@ -0,0 +1,34 @@
+import { expect, it, vi } from "vitest";
+vi.mock("@/lib/api/client", () => ({ api: vi.fn() }));
+import { hasTripDateChanges } from "./trip-metadata-save";
+
+it("compares supplied dates against the original including null dates", () => {
+  const trip = { startDate: "2026-01-01", endDate: "2026-01-02" };
+  expect(hasTripDateChanges(trip, { startDate: "2026-01-01", endDate: "2026-01-02" })).toBe(false);
+  expect(hasTripDateChanges(trip, { startDate: null })).toBe(true);
+  expect(hasTripDateChanges({}, { startDate: null, endDate: null })).toBe(false);
+  expect(hasTripDateChanges(trip, { name: "Changed" })).toBe(false);
+});
+
+it("dispatches unchanged dates to the API and changed dates together to the legacy action", async () => {
+  const { saveTripMetadata } = await import("./trip-metadata-save");
+  const { api } = await import("@/lib/api/client");
+  const trip = { id: "trip", name: "Old", status: "upcoming" as const, startDate: "2026-01-01", endDate: "2026-01-02" };
+  const legacy = vi.fn().mockResolvedValue({ status: "saved" });
+  vi.mocked(api).mockResolvedValue({} as never);
+  await saveTripMetadata(
+    trip,
+    { name: "New", startDate: trip.startDate, endDate: trip.endDate },
+    legacy,
+    undefined,
+    undefined,
+    true
+  );
+  expect(api).toHaveBeenCalledWith(expect.anything(), {
+    params: { tripId: "trip" },
+    body: { name: "New", convertCurrency: true },
+  });
+  const patch = { name: "New", endDate: "2026-01-03" };
+  await saveTripMetadata(trip, patch, legacy);
+  expect(legacy).toHaveBeenCalledWith("trip", patch, undefined, undefined);
+});
diff --git a/src/lib/trip-metadata-save.ts b/src/lib/trip-metadata-save.ts
new file mode 100644
index 00000000..cfc4560a
--- /dev/null
+++ b/src/lib/trip-metadata-save.ts
@@ -0,0 +1,46 @@
+import type {
+  Trip,
+  TripDateChangeConfirmation,
+  TripDateConflictResolution,
+  UpdateTripMetadataResult,
+  UpdateTripPatch,
+} from "@/data/types";
+import { api } from "@/lib/api/client";
+import { updateTrip } from "@/lib/api/contract/trips";
+
+export function hasTripDateChanges(trip: Pick<Trip, "startDate" | "endDate">, patch: UpdateTripPatch): boolean {
+  return (
+    (patch.startDate !== undefined && (patch.startDate ?? null) !== (trip.startDate ?? null)) ||
+    (patch.endDate !== undefined && (patch.endDate ?? null) !== (trip.endDate ?? null))
+  );
+}
+
+export async function saveTripMetadata(
+  trip: Trip,
+  patch: UpdateTripPatch,
+  legacy: (
+    tripId: string,
+    patch: UpdateTripPatch,
+    resolution?: TripDateConflictResolution,
+    confirmation?: TripDateChangeConfirmation,
+    convertCurrency?: boolean
+  ) => Promise<UpdateTripMetadataResult>,
+  resolution?: TripDateConflictResolution,
+  confirmation?: TripDateChangeConfirmation,
+  convertCurrency?: boolean
+): Promise<UpdateTripMetadataResult> {
+  if (hasTripDateChanges(trip, patch) || patch.coverImageUrl !== undefined || resolution) {
+    return convertCurrency === undefined
+      ? legacy(trip.id, patch, resolution, confirmation)
+      : legacy(trip.id, patch, resolution, confirmation, convertCurrency);
+  }
+  const body = { ...patch };
+  delete body.startDate;
+  delete body.endDate;
+  delete body.coverImageUrl;
+  await api(updateTrip, {
+    params: { tripId: trip.id },
+    body: { ...body, ...(convertCurrency ? { convertCurrency: true } : {}) },
+  });
+  return { status: "saved" };
+}

Your task is strictly descriptive — do not prescribe additional work. Report: (1) the defensible readings of the intent, enumerated; (2) which reading this diff implements; (3) where the readings and the diff diverge — specifically, which surface the intent's expectations live at versus which surface the diff's changes and its tests exercise.

Review by inspection only. Do not modify code, run builds or tests, or invoke quality gates. Do not invoke any skill, and do not spawn subagents of your own — you are the reviewer. Return your findings as text in your final message; do not route them through any findings-reporting tool the host may offer.