"use client";

import { useRef, useState, useTransition } from "react";
import { unstable_rethrow, useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteAccountAction, previewAccountDeletionAction } from "@/app/(app)/admin/users/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AdminDeletionFailure, type AdminDeletionPreview } from "@/data/types";

interface DeleteAccountDialogProps {
  userId: string;
  username: string;
  setupComplete: boolean;
  isCurrentUser: boolean;
  /** Where focus goes once the row, and so the trigger, is gone. */
  getFocusTargetAfterDelete?: () => HTMLElement | null;
}

type ReviewState =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; preview: AdminDeletionPreview; changed: boolean };

// Module-level so the ref identity is stable and focus moves only when the dialog opens.
function focusOnMount(node: HTMLButtonElement | null) {
  node?.focus();
}

const REFRESH_MESSAGES: Partial<Record<AdminDeletionFailure, string>> = {
  [AdminDeletionFailure.Forbidden]: "Admin access changed. Users has been refreshed.",
  [AdminDeletionFailure.LastAdmin]: "This is the only finished admin account. Make another user an admin first.",
  [AdminDeletionFailure.Changed]: "Account changed. Users has been refreshed.",
};

function pluralTrips(count: number): string {
  return `${count} ${count === 1 ? "trip" : "trips"}`;
}

interface OutcomeSummaryProps {
  preview: AdminDeletionPreview;
}

function OutcomeSummary({ preview }: OutcomeSummaryProps) {
  const { transferredTripCount, deletedTripCount } = preview;
  if (transferredTripCount === 0 && deletedTripCount === 0) return null;
  return (
    <ul className="list-disc pl-5">
      {transferredTripCount > 0 && (
        <li>{pluralTrips(transferredTripCount)} will pass to the earliest manager or editor on each.</li>
      )}
      {deletedTripCount > 0 && <li>{pluralTrips(deletedTripCount)} with no manager or editor left will be deleted.</li>}
    </ul>
  );
}

export function DeleteAccountDialog({
  userId,
  username,
  setupComplete,
  isCurrentUser,
  getFocusTargetAfterDelete,
}: DeleteAccountDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [review, setReview] = useState<ReviewState>({ status: "loading" });
  const [errorMessage, setErrorMessage] = useState<string>();
  const [isPending, startTransition] = useTransition();
  const requestId = useRef(0);
  const deleted = useRef(false);

  // The list changed under the admin: show Users as it now is and say why, instead of guessing at success.
  function closeAndRefresh(message: string) {
    toast.info(message);
    router.refresh();
    setOpen(false);
  }

  // The row was drawn for a pending or a completed account. If it is now the other, the admin never reviewed
  // what is about to happen, so show Users as it now is instead of a review under the wrong heading.
  function showReview(nextPreview: AdminDeletionPreview, changed: boolean) {
    if (nextPreview.setupComplete !== setupComplete) {
      closeAndRefresh(REFRESH_MESSAGES[AdminDeletionFailure.Changed]!);
      return;
    }
    setReview({ status: "ready", preview: nextPreview, changed });
  }

  async function loadReview() {
    const current = ++requestId.current;
    setReview({ status: "loading" });
    setErrorMessage(undefined);
    let result;
    try {
      result = await previewAccountDeletionAction(userId);
    } catch (error) {
      unstable_rethrow(error);
      if (current === requestId.current) setReview({ status: "failed" });
      return;
    }
    if (current !== requestId.current) return;
    if (result.ok) {
      showReview(result.preview, false);
      return;
    }
    const message = REFRESH_MESSAGES[result.reason];
    if (message) closeAndRefresh(message);
    else setReview({ status: "failed" });
  }

  function changeOpen(nextOpen: boolean) {
    if (!nextOpen && isPending) return;
    setOpen(nextOpen);
    setErrorMessage(undefined);
    if (nextOpen) void loadReview();
    else requestId.current++;
  }

  function confirmDelete() {
    if (isPending || review.status !== "ready") return;
    const { preview } = review;
    setErrorMessage(undefined);
    startTransition(async () => {
      let outcome;
      try {
        outcome = await deleteAccountAction(userId, preview.fingerprint);
      } catch (error) {
        unstable_rethrow(error);
        // The response is unknown: never claim success, show Users as it now is.
        toast.info("Couldn't confirm the deletion. Review Users.");
        router.refresh();
        setOpen(false);
        return;
      }
      if (outcome.ok) {
        deleted.current = true;
        toast.success(setupComplete ? "Account deleted." : "Unfinished account deleted.");
        router.refresh();
        setOpen(false);
        return;
      }
      if (outcome.reason === AdminDeletionFailure.Changed && outcome.preview) {
        // Nothing was written. The admin has to look at the new outcome and confirm again.
        showReview(outcome.preview, true);
        return;
      }
      const message = REFRESH_MESSAGES[outcome.reason];
      if (message) {
        closeAndRefresh(message);
        return;
      }
      setErrorMessage("Couldn't delete the account. Try again.");
    });
  }

  const ready = review.status === "ready" ? review : undefined;
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" className="h-11" aria-label={`Delete account: ${username}`}>
            Delete
          </Button>
        }
      />
      <DialogContent
        showCloseButton={false}
        finalFocus={() => (deleted.current ? (getFocusTargetAfterDelete?.() ?? undefined) : true)}
      >
        <DialogHeader>
          <DialogTitle>{setupComplete ? "Delete account" : "Delete unfinished account"}</DialogTitle>
          <DialogDescription>Are you sure you want to delete {username}? This can&apos;t be undone.</DialogDescription>
        </DialogHeader>
        {/* One persistent live region, so the outcome is announced when it replaces the loading line. The loading
            line is screen-reader only: sighted users would see it flash for the moment the review takes. */}
        <div role="status" className="empty:hidden" style={{ color: "var(--fg)" }}>
          {review.status === "loading" && <p className="sr-only">Checking what deleting {username} changes…</p>}
          {ready && <OutcomeSummary preview={ready.preview} />}
        </div>
        {isCurrentUser && <p style={{ color: "var(--fg)" }}>This is your account. You will be signed out.</p>}
        {review.status === "failed" && <p role="alert">Couldn&apos;t check what deleting this account changes.</p>}
        {ready?.changed && (
          <p role="alert">Trips changed since you reviewed them. Check the new outcome, then confirm again.</p>
        )}
        {errorMessage && <p role="alert">{errorMessage}</p>}
        <DialogFooter>
          <Button
            ref={focusOnMount}
            variant="outline"
            className="h-11"
            disabled={isPending}
            onClick={() => changeOpen(false)}
          >
            Cancel
          </Button>
          {review.status === "failed" && (
            <Button variant="outline" className="h-11" onClick={() => void loadReview()}>
              Try again
            </Button>
          )}
          <Button className="h-11" disabled={isPending || !ready} onClick={confirmDelete}>
            {isPending ? "Deleting…" : "Delete account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
