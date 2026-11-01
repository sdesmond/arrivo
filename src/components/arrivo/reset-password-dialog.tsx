"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { unstable_rethrow, useRouter } from "next/navigation";
import { checkSetupLinkTargetAction, issuePasswordResetAction } from "@/app/(app)/admin/users/actions";
import type { PasswordResetLinkResult } from "@/data/types";
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
import { SetupLinkResult } from "./setup-link-result";

interface ResetPasswordDialogProps {
  userId: string;
  username: string;
}

export function ResetPasswordDialog({ userId, username }: ResetPasswordDialogProps) {
  const hydrated = useSyncExternalStore(
    /* istanbul ignore next */ () => /* istanbul ignore next */ () => {},
    () => true,
    () => false
  );
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<Extract<PasswordResetLinkResult, { ok: true }> | null>(null);
  const [phase, setPhase] = useState<"ready" | "uncertain" | "changed">("ready");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (result) heading.current?.focus();
  }, [result]);
  function changeOpen(next: boolean) {
    if (pending) return;
    setOpen(next);
    setResult(null);
    setError(undefined);
  }
  function generate() {
    if (pending || phase !== "ready") return;
    startTransition(async () => {
      try {
        const outcome = await issuePasswordResetAction(userId);
        if (outcome.ok) setResult(outcome);
        else {
          setError(outcome.message ?? "Could not generate a link. Refresh Users and try again.");
          if (outcome.reason === "changed-state" || outcome.reason === "forbidden") {
            setPhase("changed");
            router.refresh();
          }
        }
      } catch (failure) {
        unstable_rethrow(failure);
        setPhase("uncertain");
      }
    });
  }
  function check() {
    startTransition(async () => {
      try {
        const state = await checkSetupLinkTargetAction(userId);
        setPhase(state.state === "completed" ? "ready" : "changed");
        setError(
          state.state === "completed"
            ? "Previous result cannot be recovered. Generate a replacement link."
            : "Account changed. Refresh Users."
        );
        router.refresh();
      } catch (failure) {
        unstable_rethrow(failure);
        setPhase("uncertain");
      }
    });
  }
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" className="h-11" disabled={!hydrated} aria-label={`Reset password: ${username}`}>
            Reset password
          </Button>
        }
      />
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle ref={heading} tabIndex={-1}>
            {result ? "Password reset link ready" : "Reset password"}
          </DialogTitle>
          <DialogDescription>
            {result
              ? "This link is shown once. Share it manually."
              : `Generate a one-hour password reset link for ${username}. Their password stays unchanged until they complete the reset.`}
          </DialogDescription>
        </DialogHeader>
        {result && (
          <SetupLinkResult username={result.username} expiresAt={result.expiresAt} setupUrl={result.resetUrl} />
        )}
        {error && <p role="alert">{error}</p>}
        {phase === "uncertain" && (
          <p role="status">Result uncertain. Check the account before generating a replacement.</p>
        )}
        <DialogFooter>
          <Button variant="outline" className="h-11" disabled={pending} onClick={() => changeOpen(false)}>
            {result || phase === "changed" ? "Close" : "Cancel"}
          </Button>
          {!result && phase !== "changed" && (
            <Button className="h-11" disabled={pending} onClick={phase === "uncertain" ? check : generate}>
              {pending ? "Working…" : phase === "uncertain" ? "Check account" : "Generate link"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
