"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { unstable_rethrow, useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { checkSetupLinkTargetAction, regenerateSetupLinkAction } from "@/app/(app)/admin/users/actions";
import type { RegenerateSetupLinkResult, SetupLinkTargetState } from "@/data/types";
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

interface RegenerateSetupLinkDialogProps {
  userId: string;
  username: string;
}

export function RegenerateSetupLinkDialog({ userId, username }: RegenerateSetupLinkDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<Extract<RegenerateSetupLinkResult, { ok: true }> | null>(null);
  const [phase, setPhase] = useState<"ready" | "generating" | "checking" | "uncertain" | "reconciled" | "changed">(
    "ready"
  );
  const [errorMessage, setErrorMessage] = useState<string>();
  const [copyMessage, setCopyMessage] = useState("");
  const [currentState, setCurrentState] = useState<SetupLinkTargetState>();
  const [isPending, startTransition] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const busy = isPending || phase === "generating" || phase === "checking";
  useEffect(() => {
    if (result) headingRef.current?.focus();
  }, [result]);

  function changeOpen(nextOpen: boolean) {
    if (!nextOpen && busy) return;
    setOpen(nextOpen);
    setResult(null);
    setCopyMessage("");
    setErrorMessage(undefined);
    // A lost result cannot be cleared by closing. Only a successful authoritative read unlocks issuance.
  }
  async function checkAccount() {
    setPhase("checking");
    try {
      const state = await checkSetupLinkTargetAction(userId);
      setCurrentState(state);
      setPhase(state.state === "unfinished" ? "reconciled" : "changed");
      if (state.state !== "unfinished") toast.info("Account changed. Users has been refreshed.");
      router.refresh();
    } catch (error) {
      unstable_rethrow(error);
      setPhase("uncertain");
    }
  }
  function generate() {
    if (busy || result || phase === "uncertain" || phase === "changed") return;
    setPhase("generating");
    setErrorMessage(undefined);
    startTransition(async () => {
      let outcome;
      try {
        outcome = await regenerateSetupLinkAction(userId);
      } catch (error) {
        unstable_rethrow(error);
        await checkAccount();
        return;
      }
      setPhase("ready");
      if (!outcome.ok) {
        setErrorMessage(
          outcome.reason === "origin-unavailable" && outcome.message
            ? outcome.message
            : outcome.reason === "changed-state"
              ? "Account changed. Users has been refreshed; no further link can be generated here."
              : outcome.reason === "forbidden"
                ? "Admin access changed. Users has been refreshed."
                : "Couldn't generate a link. Try again."
        );
        if (outcome.reason === "changed-state" || outcome.reason === "forbidden") {
          setPhase("changed");
          toast.info(
            outcome.reason === "forbidden"
              ? "Admin access changed. Users has been refreshed."
              : "Account changed. Users has been refreshed."
          );
          router.refresh();
        }
        return;
      }
      setResult(outcome);
      router.refresh();
    });
  }
  async function copyLink() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.setupUrl);
      setCopyMessage("Link copied.");
    } catch {
      setCopyMessage("Couldn't copy. Select the link and copy it manually.");
    }
  }
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" className="h-11" aria-label={`Generate new link: ${username}`}>
            Generate new link
          </Button>
        }
      />
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle ref={headingRef} tabIndex={-1}>
            {result ? "New setup link ready" : "Generate new setup link"}
          </DialogTitle>
          <DialogDescription>
            {result
              ? "This link is shown once. Share it so this person can finish account setup."
              : `Replace the setup link for ${username}. Previous links and open setup flows will stop working.`}
          </DialogDescription>
        </DialogHeader>
        {result ? (
          <div className="flex min-w-0 flex-col gap-3">
            <p>
              Username: <strong>{result.username}</strong>
            </p>
            <p>
              Expires: <time dateTime={result.expiresAt}>{new Date(result.expiresAt).toLocaleString()}</time>
            </p>
            <p className="select-text" style={{ overflowWrap: "anywhere" }}>
              {result.setupUrl}
            </p>
            <Button
              variant="outline"
              size="icon"
              className="size-11"
              title="Copy link"
              aria-label="Copy link"
              onClick={copyLink}
            >
              <Copy strokeWidth={1.5} />
            </Button>
            {copyMessage && <p role="status">{copyMessage}</p>}
          </div>
        ) : (
          <>
            {errorMessage && <p role="alert">{errorMessage}</p>}
            {phase === "checking" && <p role="status">Checking current account state…</p>}
            {phase === "uncertain" && (
              <p role="status">Result uncertain. Check again before generating another link.</p>
            )}
            {phase === "changed" && !errorMessage && (
              <p role="status">Account changed. Users has been refreshed; no further link can be generated here.</p>
            )}
            {phase === "reconciled" && (
              <p role="status">
                Account still needs setup. Previous result cannot be recovered. Generate a replacement link
                deliberately.
                {currentState?.setupExpiresAt && (
                  <>
                    {" "}
                    Current expiry:{" "}
                    <time dateTime={currentState.setupExpiresAt}>
                      {new Date(currentState.setupExpiresAt).toLocaleString()}
                    </time>
                    .
                  </>
                )}
              </p>
            )}
          </>
        )}
        <DialogFooter>
          <Button variant="outline" className="h-11" disabled={busy} onClick={() => changeOpen(false)}>
            {result || phase === "changed" ? "Close" : "Cancel"}
          </Button>
          {!result &&
            phase !== "changed" &&
            (phase === "uncertain" ? (
              <Button className="h-11" onClick={() => startTransition(checkAccount)}>
                Check again
              </Button>
            ) : (
              <Button className="h-11" disabled={busy} onClick={generate}>
                {phase === "generating"
                  ? "Generating…"
                  : phase === "checking"
                    ? "Checking…"
                    : phase === "reconciled"
                      ? "Generate replacement link"
                      : "Generate new link"}
              </Button>
            ))}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
