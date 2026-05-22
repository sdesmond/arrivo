"use client";

import type { TripEvent, Document } from "@/data/types";
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
  onLocationSave: (address?: string) => void;
  showAddDocDialog: boolean;
  onAddDocOpenChange: (v: boolean) => void;
  showDeleteDialog: boolean;
  onDeleteOpenChange: (v: boolean) => void;
}

export function PlaceRowDialogs({
  place: p,
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
        time={p.startAt ? toHHMM(p.startAt) : undefined}
        endTime={p.endAt ? toHHMM(p.endAt) : undefined}
        eventName={p.name}
        open={showTimeDialog}
        onOpenChange={onTimeOpenChange}
        onSave={onTimeSave}
      />
      <CostDialog
        cost={p.cost}
        eventName={p.name}
        open={showCostDialog}
        onOpenChange={onCostOpenChange}
        onSave={onCostSave}
      />
      <LocationDialog
        address={p.locationAddress}
        eventName={p.name}
        open={showLocationDialog}
        onOpenChange={onLocationOpenChange}
        onSave={onLocationSave}
      />
      <AddDocDialog
        eventId={p.id}
        eventName={p.name}
        open={showAddDocDialog}
        onOpenChange={onAddDocOpenChange}
        tripDocs={tripDocs}
      />
      <DeleteEventDialog
        eventId={p.id}
        eventName={p.name}
        docCount={p.docs?.length ?? 0}
        open={showDeleteDialog}
        onOpenChange={onDeleteOpenChange}
      />
    </>
  );
}
