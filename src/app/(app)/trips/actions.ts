"use server";

import { requireUser } from "@/lib/auth-helpers";
import * as locations from "@/lib/services/locations";
import type { LocationLookupSuggestion, LocationSuggestion, RetrievedLocation } from "@/data/types";

export async function searchLocations(query: string, sessionToken: string): Promise<LocationSuggestion[]> {
  const user = await requireUser();
  return locations.searchDestinationLocations({ userId: user.id! }, query, sessionToken);
}

export async function searchAddressLocations(query: string, sessionToken: string): Promise<LocationLookupSuggestion[]> {
  const user = await requireUser();
  return locations.searchAddressLocations({ userId: user.id! }, query, sessionToken);
}

export async function retrieveLocation(mapboxId: string, sessionToken: string): Promise<RetrievedLocation> {
  const user = await requireUser();
  return locations.retrieveLocation({ userId: user.id! }, mapboxId, sessionToken);
}
