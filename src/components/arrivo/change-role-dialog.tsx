"use client";

import { useState, useTransition, type ReactElement } from "react";
import { unstable_rethrow, useRouter } from "next/navigation";
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
import { RoleChangeFailure, UserRole, type InstanceUserSummary } from "@/data/types";
import { changeUserRoleAction } from "@/app/(app)/admin/users/actions";

interface ChangeRoleDialogProps {
  user: InstanceUserSummary;
  onSuccess: (role: UserRole) => void;
  children: ReactElement;
}

export function ChangeRoleDialog({ user, onSuccess, children }: ChangeRoleDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const demoting = user.role === UserRole.Admin;
  const role = demoting ? UserRole.Member : UserRole.Admin;
  const action = demoting ? "Remove admin" : "Make admin";

  function handleConfirm() {
    setErrorMessage(null);
    startTransition(async () => {
      let result;
      try {
        result = await changeUserRoleAction(user.id, role);
      } catch (error) {
        unstable_rethrow(error);
        setErrorMessage("Couldn't save. Try again.");
        return;
      }
      if (!result.ok) {
        setErrorMessage(
          result.reason === RoleChangeFailure.LastAdmin
            ? "Make another user an admin first."
            : "Couldn't save. Try again."
        );
        if (result.reason === RoleChangeFailure.NotFound || result.reason === RoleChangeFailure.Forbidden)
          router.refresh();
        return;
      }
      setOpen(false);
      onSuccess(result.role);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && isPending) return;
        setOpen(nextOpen);
        setErrorMessage(null);
      }}
    >
      <DialogTrigger render={children} />
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>
            {action} for {user.username}?
          </DialogTitle>
          <DialogDescription>
            {demoting
              ? `${user.username} will lose instance management authority.`
              : `${user.username} will be able to manage this instance.`}{" "}
            Admin authority does not grant access to private trips.
          </DialogDescription>
        </DialogHeader>
        {errorMessage && (
          <p role="alert" style={{ color: "var(--destructive)" }}>
            {errorMessage}
          </p>
        )}
        <DialogFooter>
          <Button
            className="h-11"
            variant="outline"
            autoFocus={demoting}
            disabled={isPending}
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button className="h-11" disabled={isPending} onClick={handleConfirm}>
            {isPending ? "Saving…" : action}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
