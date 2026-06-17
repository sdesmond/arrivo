"use client";

import type { TripEvent, Document, SavedLocationValue } from "@/data/types";
import { toHHMM } from "@/lib/utils";
import { TimeDialog } from "./time-dialog";
import { CostDialog } from "./cost-dialog";
import { LocationDialog } from "./location-dialog";
import { AddDocDialog } from "./add-doc-dialog";
import { DeleteEventDialog } from "./delete-event-dialog";

export interface PlaceRowDialogsProps {
  place: TripEvent;
  tripDocs?: Document[];
  showTimeDialog: boolean;
  onTimeOpenChange: (v: boolean) => void;
  onTimeSave: (t?: string, et?: string) => void;
  showCostDialog: boolean;
  onCostOpenChange: (v: boolean) => void;
  onCostSave: (cost?: number) => void;
  showLocationDialog: boolean;
  onLocationOpenChange: (v: boolean) => void;
  onLocationSave: (location?: SavedLocationValue) => void;
  showAddDocDialog: boolean;
  onAddDocOpenChange: (v: boolean) => void;
  showDeleteDialog: boolean;
  onDeleteOpenChange: (v: boolean) => void;
}

export function PlaceRowDialogs({
  place,
  tripDocs,
  showTimeDialog,
  onTimeOpenChange,
  onTimeSave,
  showCostDialog,
  onCostOpenChange,
  onCostSave,
  showLocationDialog,
  onLocationOpenChange,
  onLocationSave,
  showAddDocDialog,
  onAddDocOpenChange,
  showDeleteDialog,
  onDeleteOpenChange,
}: PlaceRowDialogsProps) {
  return (
    <>
      <TimeDialog
        time={place.startAt ? toHHMM(place.startAt) : undefined}
        endTime={place.endAt ? toHHMM(place.endAt) : undefined}
        eventName={place.name}
        open={showTimeDialog}
        onOpenChange={onTimeOpenChange}
        onSave={onTimeSave}
      />
      <CostDialog
        cost={place.cost}
        eventName={place.name}
        open={showCostDialog}
        onOpenChange={onCostOpenChange}
        onSave={onCostSave}
      />
      <LocationDialog
        address={place.locationAddress}
        locationName={place.locationName}
        locationLat={place.locationLat}
        locationLng={place.locationLng}
        eventName={place.name}
        open={showLocationDialog}
        onOpenChange={onLocationOpenChange}
        onSave={onLocationSave}
      />
      <AddDocDialog
        eventId={place.id}
        eventName={place.name}
        open={showAddDocDialog}
        onOpenChange={onAddDocOpenChange}
        tripDocs={tripDocs}
      />
      <DeleteEventDialog
        eventId={place.id}
        eventName={place.name}
        docCount={place.docs?.length ?? 0}
        open={showDeleteDialog}
        onOpenChange={onDeleteOpenChange}
      />
    </>
  );
}
