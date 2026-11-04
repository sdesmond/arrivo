"use client";
import { useState, useTransition } from "react";
import { Field } from "@/components/arrivo/form-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SecondFactorInput } from "@/data/types";
type ConfirmKind = "regenerate" | "disable";
const CONFIRM_COPY: Record<ConfirmKind, { title: string; description: string; action: string }> = {
  regenerate: {
    title: "Regenerate recovery codes?",
    description: "Your old recovery codes stop working. Confirm with your password and a code from your app.",
    action: "Regenerate codes",
  },
  disable: {
    title: "Turn off two-factor authentication?",
    description: "Signing in will only need your password. You'll be signed out on every device.",
    action: "Turn off",
  },
};

interface SecondFactorDialogProps {
  kind: ConfirmKind | null;
  onCancel: () => void;
  onConfirm: (input: SecondFactorInput) => Promise<string | undefined>;
}

export function SecondFactorDialog({ kind, onCancel, onConfirm }: SecondFactorDialogProps) {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const copy = kind ? CONFIRM_COPY[kind] : null;

  function reset() {
    setPassword("");
    setCode("");
    setError(null);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const failure = await onConfirm({ password, code });
      if (failure) setError(failure);
      else reset();
    });
  }

  return (
    <Dialog
      open={kind !== null}
      onOpenChange={(open) => {
        if (!open) {
          reset();
          onCancel();
        }
      }}
    >
      <DialogContent showCloseButton={false}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{copy?.title}</DialogTitle>
            <DialogDescription>{copy?.description}</DialogDescription>
          </DialogHeader>
          <Field label="Current password" htmlFor="second-factor-password">
            <Input
              id="second-factor-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              autoFocus
            />
          </Field>
          <Field label="Code from your app or a recovery code" htmlFor="second-factor-code">
            <Input
              id="second-factor-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoComplete="one-time-code"
              aria-invalid={!!error || undefined}
            />
          </Field>
          {error && (
            <p role="alert" style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--destructive)" }}>
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={() => {
                reset();
                onCancel();
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant={kind === "disable" ? "destructive" : "default"}
              className="h-11"
              disabled={isPending || !password || !code}
            >
              {isPending ? "Checking…" : copy?.action}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
