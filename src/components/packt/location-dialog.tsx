"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import type { RetrievedLocation } from "@/app/(app)/trips/actions";
import type { SavedLocationValue } from "@/data/types";
import { LocationLookupInput } from "./location-lookup-input";

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
  const [draft, setDraft] = useState(address ?? "");
  const [resolvedLocation, setResolvedLocation] = useState<SavedLocationValue | undefined>(
    address
      ? {
          name: locationName,
          address,
          lat: locationLat,
          lng: locationLng,
        }
      : undefined
  );

  // Sync draft from prop each time the dialog opens so stale state doesn't cause accidental clears

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(address ?? "");
    setResolvedLocation(
      address
        ? {
            name: locationName,
            address,
            lat: locationLat,
            lng: locationLng,
          }
        : undefined
    );
  }, [open, address, locationLat, locationLng, locationName]);

  function handleSave() {
    const trimmedAddress = draft.trim();
    if (!trimmedAddress) {
      onSave(undefined);
      onOpenChange(false);
      return;
    }

    onSave(
      resolvedLocation && resolvedLocation.address === trimmedAddress ? resolvedLocation : { address: trimmedAddress }
    );
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => onOpenChange(isOpen as boolean)}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Location</DialogTitle>
          {eventName && (
            <p style={{ fontSize: "calc(11px * var(--font-scale))", color: "var(--fg-4)", marginTop: -4 }}>
              {eventName}
            </p>
          )}
        </DialogHeader>
        <LocationLookupInput
          id="event-location"
          value={draft}
          resolvedValue={resolvedLocation?.address ?? null}
          placeholder="Enter address or place name"
          autoFocus
          onValueChange={setDraft}
          onResolved={(location: RetrievedLocation) =>
            setResolvedLocation({
              name: location.fullAddress !== location.placeName ? location.name : undefined,
              address: location.fullAddress,
              lat: location.center[1],
              lng: location.center[0],
            })
          }
          onClearResolved={() => setResolvedLocation(undefined)}
          onSubmit={handleSave}
        />
        <DialogFooter>
          {address && (
            <Button
              variant="ghost"
              className="sm:mr-auto"
              onClick={() => {
                onSave(undefined);
                onOpenChange(false);
              }}
            >
              Remove
            </Button>
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
