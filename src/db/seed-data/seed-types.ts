import type { Document, Collaborator } from "../../data/types";

export interface SeedEventLocation {
  name?: string;
  address?: string;
  geo?: { lat: number; lng: number };
}

export interface SeedTripEvent {
  id: string;
  name: string;
  note?: string;
  time?: string;
  endTime?: string;
  location?: SeedEventLocation;
  locationName?: string;
  locationAddress?: string;
  confirmationNumber?: string;
  docs?: Document[];
}

export interface SeedDayItinerary {
  id?: string;
  tripId?: string;
  dayNumber: number;
  date?: string;
  label: string;
  subtitle?: string;
  today?: boolean;
  weather?: string;
  travelSummary?: string;
  events: SeedTripEvent[];
}

export type { Collaborator };
