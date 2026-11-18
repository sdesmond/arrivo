"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api, ApiClientError } from "@/lib/api/client";
import { leaveTrip } from "@/lib/api/contract/sharing";

interface UseLeaveTripOptions {
  tripId: string;
}

export function useLeaveTrip({ tripId }: UseLeaveTripOptions) {
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
      await api(leaveTrip, { params: { tripId }, body: {} });
      // Stay in the pending state until navigation unmounts this page, so the request can't re-fire. An
      // already-absent membership is the same empty success, so this view is left either way.
      router.replace("/trips");
    } catch (error) {
      reportFailure(error instanceof ApiClientError ? error.message : "Couldn't leave this trip. Try again.");
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
