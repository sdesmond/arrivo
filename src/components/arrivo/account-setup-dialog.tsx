"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface AccountSetupDialogProps {
  username: string;
}

const ignoreDismissal = () => {};

// Setup-only stub: the person can neither close nor leave it, because there is nothing behind it yet. The form that
// finishes setup replaces this body; the non-dismissable shell stays.
export function AccountSetupDialog({ username }: AccountSetupDialogProps) {
  return (
    <Dialog open onOpenChange={ignoreDismissal} disablePointerDismissal>
      <DialogContent showCloseButton={false} aria-describedby="account-setup-description">
        <DialogHeader>
          <DialogTitle>Set up your account</DialogTitle>
          <DialogDescription id="account-setup-description">
            Account setup for{" "}
            <span className="font-medium" style={{ color: "var(--fg)" }}>
              {username}
            </span>
            . Choosing a password is not available yet.
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
