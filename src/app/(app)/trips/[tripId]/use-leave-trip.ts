"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { leaveTrip } from "@/app/(app)/trips/actions";

interface UseLeaveTripOptions {
  tripId: string;
  tripName: string;
}

export function useLeaveTrip({ tripId, tripName }: UseLeaveTripOptions) {
  const router = useRouter();
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  // Bumped when a force-close supersedes an in-flight leave, so its late result can't write stale dialog state.
  const leaveAttemptRef = useRef(0);

  function forceCloseLeaveDialog(): void {
    leaveAttemptRef.current += 1;
    setLeaveDialogOpen(false);
    setIsLeaving(false);
    setLeaveError(null);
  }

  function handleLeaveDialogOpenChange(nextOpen: boolean): void {
    setLeaveDialogOpen(nextOpen);
    if (!nextOpen) setLeaveError(null);
  }

  async function handleConfirmLeave(): Promise<void> {
    const attempt = leaveAttemptRef.current;
    setIsLeaving(true);
    setLeaveError(null);

    // A superseded attempt's dialog is closed (or unmounted), so its error goes to a toast instead.
    function reportFailure(message: string): void {
      if (attempt !== leaveAttemptRef.current) {
        toast.error(message);
        return;
      }
      setLeaveError(message);
      setIsLeaving(false);
    }

    try {
      const result = await leaveTrip(tripId);
      if (result.status === "success") {
        // Stay in the pending state until navigation unmounts this page, so the action can't re-fire.
        toast.success(`You left ${tripName}.`);
        router.replace("/trips");
        return;
      }
      if (result.stale) {
        // Membership was already gone — nothing to confirm, and this view is no longer reachable.
        toast.error(result.message);
        router.replace("/trips");
        return;
      }
      reportFailure(result.message);
    } catch {
      reportFailure("Couldn't leave this trip. Try again.");
    }
  }

  return {
    forceCloseLeaveDialog,
    handleConfirmLeave,
    handleLeaveDialogOpenChange,
    isLeaving,
    leaveDialogOpen,
    leaveError,
    openLeaveDialog: () => setLeaveDialogOpen(true),
  };
}
