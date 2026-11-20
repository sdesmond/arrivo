import type {
  Trip,
  TripDateChangeConfirmation,
  TripDateConflictResolution,
  UpdateTripMetadataResult,
  UpdateTripPatch,
} from "@/data/types";
import { api, ApiClientError } from "@/lib/api/client";
import { updateTrip } from "@/lib/api/contract/trips";

export function hasTripDateChanges(trip: Pick<Trip, "startDate" | "endDate">, patch: UpdateTripPatch): boolean {
  return (
    (patch.startDate !== undefined && (patch.startDate ?? null) !== (trip.startDate ?? null)) ||
    (patch.endDate !== undefined && (patch.endDate ?? null) !== (trip.endDate ?? null))
  );
}

/**
 * Saves a trip's metadata and dates through the API. A date change that would remove planned content comes back as a
 * `confirmation-required` result; send the same patch again with a resolution and that confirmation to apply it.
 */
export async function saveTripMetadata(
  trip: Trip,
  patch: UpdateTripPatch,
  resolution?: TripDateConflictResolution,
  confirmation?: TripDateChangeConfirmation,
  convertCurrency?: boolean
): Promise<UpdateTripMetadataResult> {
  // Covers have their own endpoint, and unchanged dates need no day sync.
  const { coverImageUrl: _coverImageUrl, startDate, endDate, ...rest } = patch;
  void _coverImageUrl;
  const body = {
    ...rest,
    ...(hasTripDateChanges(trip, patch) ? { startDate, endDate } : {}),
    ...(resolution && confirmation ? { resolution, confirmation } : {}),
    ...(convertCurrency ? { convertCurrency: true } : {}),
  };
  try {
    await api(updateTrip, { params: { tripId: trip.id }, body });
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 409 && error.code === "confirmation_required") {
      return { status: "confirmation-required", confirmation: error.confirmation as TripDateChangeConfirmation };
    }
    throw error;
  }
  return { status: "saved" };
}
