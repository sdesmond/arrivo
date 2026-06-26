"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface TripCurrencyChangeDialogProps {
  isOpen: boolean;
  saving?: boolean;
  onCancel: () => void;
  onLeaveAsIs: () => void | Promise<void>;
  onConvert: () => void | Promise<void>;
}

export function TripCurrencyChangeDialog({
  isOpen,
  saving = false,
  onCancel,
  onLeaveAsIs,
  onConvert,
}: TripCurrencyChangeDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Change Trip Currency</DialogTitle>
        </DialogHeader>

        <p style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--fg-2)" }}>
          Some of your expenses don&apos;t match your new currency selection. Do you want to convert them to this new
          currency?
        </p>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" autoFocus onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void onLeaveAsIs()} disabled={saving}>
              Leave As Is
            </Button>
            <Button onClick={() => void onConvert()} disabled={saving}>
              Convert
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
