import type {
  Trip,
  TripDateChangeConfirmation,
  TripDateConflictResolution,
  UpdateTripMetadataResult,
  UpdateTripPatch,
} from "@/data/types";
import { api } from "@/lib/api/client";
import { updateTrip } from "@/lib/api/contract/trips";

export function hasTripDateChanges(trip: Pick<Trip, "startDate" | "endDate">, patch: UpdateTripPatch): boolean {
  return (
    (patch.startDate !== undefined && (patch.startDate ?? null) !== (trip.startDate ?? null)) ||
    (patch.endDate !== undefined && (patch.endDate ?? null) !== (trip.endDate ?? null))
  );
}

export async function saveTripMetadata(
  trip: Trip,
  patch: UpdateTripPatch,
  legacy: (
    tripId: string,
    patch: UpdateTripPatch,
    resolution?: TripDateConflictResolution,
    confirmation?: TripDateChangeConfirmation,
    convertCurrency?: boolean
  ) => Promise<UpdateTripMetadataResult>,
  resolution?: TripDateConflictResolution,
  confirmation?: TripDateChangeConfirmation,
  convertCurrency?: boolean
): Promise<UpdateTripMetadataResult> {
  if (hasTripDateChanges(trip, patch) || patch.coverImageUrl !== undefined || resolution) {
    return convertCurrency === undefined
      ? legacy(trip.id, patch, resolution, confirmation)
      : legacy(trip.id, patch, resolution, confirmation, convertCurrency);
  }
  const body = { ...patch };
  delete body.startDate;
  delete body.endDate;
  delete body.coverImageUrl;
  await api(updateTrip, {
    params: { tripId: trip.id },
    body: { ...body, ...(convertCurrency ? { convertCurrency: true } : {}) },
  });
  return { status: "saved" };
}
