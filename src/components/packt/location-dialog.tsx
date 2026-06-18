"use client";

import type { SavedLocationValue } from "@/data/types";
import { ReservationFieldDialog } from "./reservation-field-dialog";

export interface LocationDialogProps {
  address?: string;
  locationName?: string;
  locationLat?: number;
  locationLng?: number;
  eventName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (location?: SavedLocationValue) => void;
}

export function LocationDialog({
  address,
  locationName,
  locationLat,
  locationLng,
  eventName,
  open,
  onOpenChange,
  onSave,
}: LocationDialogProps) {
  return (
    <ReservationFieldDialog
      mode="location"
      id="event-location"
      title="Location"
      subtitle={eventName}
      value={address}
      locationName={locationName}
      locationLat={locationLat}
      locationLng={locationLng}
      placeholder="Enter address or place name"
      open={open}
      onOpenChange={onOpenChange}
      onSave={onSave}
    />
  );
}
