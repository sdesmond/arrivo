"use client";
import { useRef, useState, type ReactElement } from "react";
import { Pencil, MoreHorizontal, Trash2, Info } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CoverAttributionDialog } from "./cover-attribution-dialog";
import { CoverImagePicker } from "./cover-image-picker";
import type { CoverImageSelection, CoverType, TripDetailPayload } from "@/data/types";
import { parseGraphicCover } from "@/lib/utils";
import { setTripCover, deleteTripCover } from "@/lib/api/contract/covers";
import { useApiMutation } from "@/lib/api/use-api-mutation";
interface TripCoverControlsProps {
  trip: TripDetailPayload["trip"];
  canEdit: boolean;
}
function getCoverType(coverImageUrl?: string): CoverType {
  if (!coverImageUrl || parseGraphicCover(coverImageUrl)) {
    return "graphic";
  }

  if (coverImageUrl.startsWith("/api/mapbox/static")) {
    return "map";
  }

  return "photo";
}

export function TripCoverControls({ trip, canEdit }: TripCoverControlsProps): ReactElement | null {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isAttributionOpen, setIsAttributionOpen] = useState(false);
  const saving = useRef(false);
  const selectCover = useApiMutation(setTripCover);
  const removeCover = useApiMutation(deleteTripCover);
  const isPending = selectCover.isPending || removeCover.isPending;
  const coverType = getCoverType(trip.coverImageUrl);
  const canRemoveCover = coverType === "photo" || coverType === "map";
  const canShowAttribution = coverType === "photo" && !!trip.coverPhotographer;
  function release() {
    saving.current = false;
  }
  function handleCoverSelection(image: CoverImageSelection) {
    if (saving.current) return;
    saving.current = true;
    void selectCover.mutate(
      {
        params: { tripId: trip.id },
        body: {
          coverImageUrl: image.url,
          coverPhotographer: image.photographer || null,
          coverPhotographerUrl: image.photographerUrl || null,
        },
      },
      { onSuccess: () => setIsPickerOpen(false), onSettled: release, onAuthLost: release }
    );
  }
  function handleRemoveCover() {
    if (saving.current) return;
    saving.current = true;
    void removeCover.mutate({ params: { tripId: trip.id }, body: {} }, { onSettled: release, onAuthLost: release });
  }
  if (!canEdit) return null;
  return (
    <>
      <div className="absolute right-2 top-2 z-10">
        <DropdownMenu>
          <DropdownMenuTrigger
            title="Cover options"
            disabled={isPending}
            className="inline-flex size-11 items-center justify-center rounded-md bg-black/25 backdrop-blur-sm transition-colors hover:bg-black/45"
            style={{ color: "var(--cover-text)" }}
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <MoreHorizontal size={18} strokeWidth={1.5} />
          </DropdownMenuTrigger>

          <DropdownMenuContent
            side="bottom"
            align="end"
            className="rounded-xl shadow-3"
            style={{ background: "var(--bg)", border: "1px solid var(--line)" }}
          >
            <DropdownMenuItem disabled={isPending} onClick={() => setIsPickerOpen(true)}>
              <Pencil size={13} strokeWidth={1.5} />
              Edit Cover
            </DropdownMenuItem>

            {canRemoveCover ? (
              <DropdownMenuItem variant="destructive" disabled={isPending} onClick={handleRemoveCover}>
                <Trash2 size={13} strokeWidth={1.5} />
                Remove Cover
              </DropdownMenuItem>
            ) : null}

            {canShowAttribution ? (
              <DropdownMenuItem disabled={isPending} onClick={() => setIsAttributionOpen(true)}>
                <Info size={13} strokeWidth={1.5} />
                Info
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {isPickerOpen ? (
        <CoverImagePicker
          tripId={trip.id}
          destinationName={trip.destinationName}
          destinationCountry={trip.destinationCountry}
          currentCoverImageUrl={trip.coverImageUrl}
          onImageSelected={handleCoverSelection}
          onClose={() => setIsPickerOpen(false)}
        />
      ) : null}

      {trip.coverPhotographer ? (
        <CoverAttributionDialog
          open={isAttributionOpen}
          photographer={trip.coverPhotographer}
          photographerUrl={trip.coverPhotographerUrl}
          onClose={() => setIsAttributionOpen(false)}
        />
      ) : null}
    </>
  );
}
