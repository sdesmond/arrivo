"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";
import { toast } from "sonner";
import { IconSize } from "@/lib/size-tokens";
import { ANCHOR_LABELS } from "@/components/arrivo/reservation-type-badge";
import { ReservationFieldDialog } from "@/components/arrivo/reservation-field-dialog";
import { useReservationPatch, type ReservationPatchBody } from "@/components/arrivo/use-reservation-patch";
import type { ReservationType, SavedLocationValue } from "@/data/types";
import { getLocationDisplayLabel } from "@/lib/utils";

export interface ReservationLocationChipProps {
  reservationId: string;
  type: ReservationType;
  side: "start" | "end";
  initialLocation?: SavedLocationValue;
}

export function buildSavedLocationValue(
  address: string | undefined,
  name?: string,
  lat?: number,
  lng?: number
): SavedLocationValue | undefined {
  return address
    ? {
        address,
        name,
        lat,
        lng,
      }
    : undefined;
}

/** Clearing an address needs only the address: the API clears the name, lat and lng with it. */
function locationPatch(side: "start" | "end", next: SavedLocationValue | undefined): ReservationPatchBody {
  if (!next) return side === "start" ? { startAddress: null } : { endAddress: null };
  return side === "start"
    ? {
        startAddress: next.address,
        startLocationName: next.name,
        startLocationLat: next.lat,
        startLocationLng: next.lng,
      }
    : {
        endAddress: next.address,
        endLocationName: next.name,
        endLocationLat: next.lat,
        endLocationLng: next.lng,
      };
}

export function ReservationLocationChip({ reservationId, type, side, initialLocation }: ReservationLocationChipProps) {
  const patchReservation = useReservationPatch();
  const [location, setLocation] = useState<SavedLocationValue | undefined>(initialLocation);
  const [showDialog, setShowDialog] = useState(false);
  const label = getLocationDisplayLabel(location?.name, location?.address);
  const anchorLabel = ANCHOR_LABELS[type][side];

  return (
    <>
      <button
        type="button"
        onClick={() => setShowDialog(true)}
        className="flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors hover:bg-surface-2"
        style={{
          fontSize: "calc(var(--fs-action-chip) * var(--font-scale))",
          color: location?.address ? "var(--accent-ink)" : "var(--fg-4)",
          background: location?.address ? "var(--accent-soft)" : "none",
          border: "1px solid transparent",
          maxWidth: 180,
        }}
      >
        <MapPin size={IconSize.actionChip} strokeWidth={1.5} style={{ flexShrink: 0 }} aria-hidden="true" />
        <span className="truncate">
          {location?.address ? `${anchorLabel} · ${label}` : `Add ${anchorLabel.toLowerCase()} address`}
        </span>
      </button>
      <ReservationFieldDialog
        mode="location"
        title={`${anchorLabel} address`}
        value={location?.address}
        locationName={location?.name}
        locationLat={location?.lat}
        locationLng={location?.lng}
        placeholder="Enter address or place name"
        open={showDialog}
        onOpenChange={setShowDialog}
        onSave={(next) => {
          void patchReservation(reservationId, locationPatch(side, next))
            .then(() => setLocation(next))
            .catch((error) => toast.error(error instanceof Error ? error.message : "Failed to save."));
        }}
      />
    </>
  );
}
