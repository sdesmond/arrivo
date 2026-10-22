"use client";

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

interface RecoveryCodesDialogProps {
  codes: string[] | null;
  onDone: () => void;
}

// Shown once, right after the codes are generated; only their hashes are stored, so closing loses them.
export function RecoveryCodesDialog({ codes, onDone }: RecoveryCodesDialogProps) {
  const text = codes?.join("\n") ?? "";

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Recovery codes copied.");
    } catch {
      toast.error("Couldn't copy. Select the codes and copy them yourself.");
    }
  }

  function handleDownload() {
    const url = URL.createObjectURL(new Blob([`Arrivo recovery codes\n\n${text}\n`], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "arrivo-recovery-codes.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    // Only "I saved these" closes it: Escape or a stray click would throw away codes that can't be shown again.
    <Dialog open={codes !== null} onOpenChange={() => {}} disablePointerDismissal>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Save your recovery codes</DialogTitle>
          <DialogDescription>
            If you lose your phone, each code signs you in once. They won&apos;t be shown again, so close this once your
            codes are saved.
          </DialogDescription>
        </DialogHeader>
        <ul
          aria-label="Recovery codes"
          className="grid grid-cols-2 gap-2"
          style={{ fontFamily: "var(--font-mono-family, ui-monospace)", color: "var(--fg)" }}
        >
          {codes?.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" className="h-11" onClick={handleCopy} autoFocus>
            Copy codes
          </Button>
          <Button variant="outline" className="h-11" onClick={handleDownload}>
            Download .txt
          </Button>
          <Button className="h-11" onClick={onDone}>
            I saved these
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
