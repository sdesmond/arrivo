"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TripDeletionAction } from "@/data/types";
import type { AccountDeletionTrip, TripDeletionChoice } from "@/data/types";
import { deleteAccount } from "./actions";

// User ids are UUIDs, so this can never collide with a collaborator option.
const DELETE_TRIP_VALUE = "delete-trip";

interface DeleteAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sharedTrips: AccountDeletionTrip[];
}

// A pick survives a refresh only while that person is still on the trip; otherwise the new suggestion wins.
function resolveChoiceValue(trip: AccountDeletionTrip, picked: string | undefined): string {
  if (picked === DELETE_TRIP_VALUE) return picked;
  if (picked && trip.collaborators.some((collaborator) => collaborator.userId === picked)) return picked;
  return trip.suggestedHeirUserId;
}

function choiceLabel(trip: AccountDeletionTrip, value: string): string {
  const heir = trip.collaborators.find((collaborator) => collaborator.userId === value);
  return heir ? `Transfer to ${heir.name} · ${heir.role}` : "Delete this trip";
}

export function DeleteAccountDialog({ open, onOpenChange, sharedTrips }: DeleteAccountDialogProps) {
  const router = useRouter();
  const [pickedByTripId, setPickedByTripId] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function buildChoices(): TripDeletionChoice[] {
    return sharedTrips.map((trip) => {
      const value = resolveChoiceValue(trip, pickedByTripId[trip.tripId]);
      return value === DELETE_TRIP_VALUE
        ? { tripId: trip.tripId, action: TripDeletionAction.Delete }
        : { tripId: trip.tripId, action: TripDeletionAction.Transfer, newOwnerUserId: value };
    });
  }

  function handleConfirm() {
    setErrorMessage(null);
    startTransition(async () => {
      try {
        const result = await deleteAccount(buildChoices());
        if (result.status === "error") {
          setErrorMessage(result.message);
          if (result.stale) router.refresh();
          return;
        }
        router.push("/sign-in");
      } catch {
        toast.error("Couldn't delete your account. Try again.");
      }
    });
  }

  const hasSharedTrips = sharedTrips.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Delete account?</DialogTitle>
          <DialogDescription>Your account will be deleted. This can&apos;t be undone.</DialogDescription>
        </DialogHeader>

        {hasSharedTrips && (
          <section aria-labelledby="delete-account-shared-heading" className="flex flex-col gap-2">
            <h3
              id="delete-account-shared-heading"
              className="font-medium tracking-wide uppercase"
              style={{ color: "var(--fg-2)", fontSize: "calc(11px * var(--font-scale))" }}
            >
              Shared trips — choose who takes over
            </h3>
            <ul
              className="flex flex-col overflow-y-auto rounded-lg"
              style={{ border: "1px solid var(--line)", maxHeight: "50vh" }}
            >
              {sharedTrips.map((trip, index) => {
                const value = resolveChoiceValue(trip, pickedByTripId[trip.tripId]);
                const nameId = `delete-account-trip-${trip.tripId}`;
                const membersId = `${nameId}-members`;
                return (
                  <li
                    key={trip.tripId}
                    className="flex flex-col gap-2 p-3"
                    style={index > 0 ? { borderTop: "1px solid var(--line)" } : undefined}
                  >
                    <p style={{ color: "var(--fg)", fontSize: "calc(14px * var(--font-scale))" }}>
                      <span id={nameId} className="font-medium">
                        {trip.name}
                      </span>{" "}
                      <span style={{ color: "var(--fg-3)" }}>
                        · <span id={membersId}>{trip.memberCount} people</span>
                      </span>
                    </p>
                    <Select
                      value={value}
                      disabled={isPending}
                      onValueChange={(nextValue) =>
                        setPickedByTripId((previous) => ({ ...previous, [trip.tripId]: nextValue as string }))
                      }
                    >
                      <SelectTrigger aria-labelledby={nameId} aria-describedby={membersId} className="h-11 w-full">
                        <SelectValue>{choiceLabel(trip, value)}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {trip.collaborators.map((collaborator) => (
                          <SelectItem key={collaborator.userId} value={collaborator.userId}>
                            {choiceLabel(trip, collaborator.userId)}
                          </SelectItem>
                        ))}
                        <SelectSeparator />
                        <SelectItem value={DELETE_TRIP_VALUE} style={{ color: "var(--destructive)" }}>
                          <Trash2 size={14} strokeWidth={1.5} aria-hidden />
                          Delete this trip
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {value === DELETE_TRIP_VALUE && (
                      <p style={{ color: "var(--destructive)", fontSize: "calc(12px * var(--font-scale))" }}>
                        Everyone on this trip will lose access.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <p style={{ color: "var(--fg-3)", fontSize: "calc(13px * var(--font-scale))" }}>
          {hasSharedTrips
            ? "New owners become managers. Pending invites you sent will be cancelled."
            : "Pending invites you sent will be cancelled."}
        </p>

        {errorMessage && (
          <p role="alert" style={{ color: "var(--destructive)", fontSize: "calc(13px * var(--font-scale))" }}>
            {errorMessage}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending} autoFocus>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={isPending}>
            {isPending ? "Deleting…" : "Delete account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
