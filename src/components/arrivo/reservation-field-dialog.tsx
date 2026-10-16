"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { RetrievedLocation } from "@/app/(app)/trips/actions";
import type { SavedLocationValue } from "@/data/types";
import { LocationLookupInput } from "./location-lookup-input";

interface ReservationFieldDialogBaseProps {
  title: string;
  subtitle?: string;
  placeholder?: string;
  inputStyle?: CSSProperties;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ReservationFieldDialogTextProps extends ReservationFieldDialogBaseProps {
  mode?: "text";
  value?: string;
  onSave: (value?: string) => void;
}

interface ReservationFieldDialogLocationProps extends ReservationFieldDialogBaseProps {
  mode: "location";
  id?: string;
  value?: string;
  locationName?: string;
  locationLat?: number;
  locationLng?: number;
  onSave: (value?: SavedLocationValue) => void;
}

export type ReservationFieldDialogProps = ReservationFieldDialogTextProps | ReservationFieldDialogLocationProps;

export function ReservationFieldDialog(props: ReservationFieldDialogProps) {
  const locationName = props.mode === "location" ? props.locationName : undefined;
  const locationLat = props.mode === "location" ? props.locationLat : undefined;
  const locationLng = props.mode === "location" ? props.locationLng : undefined;
  const [draft, setDraft] = useState(props.value ?? "");
  const [resolvedLocation, setResolvedLocation] = useState<SavedLocationValue | undefined>(
    props.mode === "location" && props.value
      ? {
          name: locationName,
          address: props.value,
          lat: locationLat,
          lng: locationLng,
        }
      : undefined
  );

  useEffect(() => {
    if (!props.open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(props.value ?? "");
    if (props.mode === "location") {
      setResolvedLocation(
        props.value
          ? {
              name: locationName,
              address: props.value,
              lat: locationLat,
              lng: locationLng,
            }
          : undefined
      );
      return;
    }
    setResolvedLocation(undefined);
  }, [locationLat, locationLng, locationName, props.mode, props.open, props.value]);

  function handleSave() {
    const trimmedValue = draft.trim();
    if (props.mode === "location") {
      props.onSave(
        !trimmedValue
          ? undefined
          : resolvedLocation && resolvedLocation.address === trimmedValue
            ? resolvedLocation
            : { address: trimmedValue }
      );
    } else {
      props.onSave(trimmedValue || undefined);
    }
    props.onOpenChange(false);
  }

  return (
    <Dialog open={props.open} onOpenChange={(isOpen) => props.onOpenChange(isOpen as boolean)}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
          {props.subtitle && (
            <p style={{ fontSize: "calc(11px * var(--font-scale))", color: "var(--fg-4)", marginTop: -4 }}>
              {props.subtitle}
            </p>
          )}
        </DialogHeader>
        {props.mode === "location" ? (
          <LocationLookupInput
            id={props.id ?? "reservation-location"}
            value={draft}
            resolvedValue={resolvedLocation?.address ?? null}
            placeholder={props.placeholder}
            inputStyle={props.inputStyle}
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
        ) : (
          <Input
            placeholder={props.placeholder}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleSave();
            }}
            style={props.inputStyle}
            autoFocus
          />
        )}
        <DialogFooter className="flex-row items-center justify-between">
          {props.value ? (
            <Button
              variant="ghost"
              onClick={() => {
                props.onSave(undefined);
                props.onOpenChange(false);
              }}
            >
              Remove
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => props.onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
