"use client";

import { useState, useTransition } from "react";
import { unstable_rethrow, useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteUnfinishedAccountAction } from "@/app/(app)/admin/users/actions";
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

interface DeleteUnfinishedAccountDialogProps {
  userId: string;
  username: string;
}

// Module-level so the ref identity is stable and focus moves only when the dialog opens.
function focusOnMount(node: HTMLHeadingElement | null) {
  node?.focus();
}

const CHANGED_MESSAGE = "Account changed. Users has been refreshed.";

export function DeleteUnfinishedAccountDialog({ userId, username }: DeleteUnfinishedAccountDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [isPending, startTransition] = useTransition();

  function changeOpen(nextOpen: boolean) {
    if (!nextOpen && isPending) return;
    setOpen(nextOpen);
    setErrorMessage(undefined);
  }
  function confirmDelete() {
    if (isPending) return;
    setErrorMessage(undefined);
    startTransition(async () => {
      let outcome;
      try {
        outcome = await deleteUnfinishedAccountAction(userId);
      } catch (error) {
        unstable_rethrow(error);
        // The response is unknown: never claim success, show Users as it now is.
        toast.info("Couldn't confirm the deletion. Review Users.");
        router.refresh();
        setOpen(false);
        return;
      }
      if (outcome.ok) {
        toast.success("Unfinished account deleted.");
        router.refresh();
        setOpen(false);
        return;
      }
      if (outcome.reason === "changed-state" || outcome.reason === "forbidden") {
        toast.info(
          outcome.reason === "forbidden" ? "Admin access changed. Users has been refreshed." : CHANGED_MESSAGE
        );
        router.refresh();
        setOpen(false);
        return;
      }
      setErrorMessage("Couldn't delete the account. Try again.");
    });
  }
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" className="h-11" aria-label={`Delete account: ${username}`}>
            Delete
          </Button>
        }
      />
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle tabIndex={-1} ref={focusOnMount}>
            Delete unfinished account
          </DialogTitle>
          <DialogDescription>
            Delete {username}? Its username is freed and its setup link stops working. This can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>
        {errorMessage && <p role="alert">{errorMessage}</p>}
        <DialogFooter>
          <Button variant="outline" className="h-11" disabled={isPending} onClick={() => changeOpen(false)}>
            Cancel
          </Button>
          <Button className="h-11" disabled={isPending} onClick={confirmDelete}>
            {isPending ? "Deleting…" : "Delete account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
