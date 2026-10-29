"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { unstable_rethrow, useRouter } from "next/navigation";
import { addUserAction, checkAddedUserAction } from "@/app/(app)/admin/users/actions";
import { AddUserFailure, type AddUserResult } from "@/data/types";
import { normalizeUsername, validateUsername } from "@/lib/username";
import { Button } from "@/components/ui/button";
import { SetupLinkResult } from "./setup-link-result";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, Section as FieldGroup } from "./form-section";

interface AddUserDialogProps {
  triggerLabel?: string;
}

export function AddUserDialog({ triggerLabel = "Add User" }: AddUserDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [errorMessage, setErrorMessage] = useState<string>();
  const [result, setResult] = useState<Extract<AddUserResult, { ok: true }> | null>(null);
  const [phase, setPhase] = useState<"form" | "creating" | "checking" | "found" | "absent" | "uncertain">("form");
  const [isPending, startTransition] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const busy = isPending || phase === "creating" || phase === "checking";
  const locked = busy || phase === "uncertain" || phase === "found";

  useEffect(() => {
    if (result) headingRef.current?.focus();
  }, [result]);

  function changeOpen(nextOpen: boolean) {
    if (!nextOpen && busy) return;
    setOpen(nextOpen);
    setResult(null);
    setErrorMessage(undefined);
    if (phase !== "uncertain") {
      setUsername("");
      setPhase("form");
    }
  }

  async function checkAccount(name: string) {
    setPhase("checking");
    setErrorMessage(undefined);
    let exists;
    try {
      exists = await checkAddedUserAction(name);
    } catch (error) {
      unstable_rethrow(error);
      setPhase("uncertain");
      return;
    }
    setPhase(exists ? "found" : "absent");
    if (exists) router.refresh();
  }

  function createAccount() {
    if (locked || result) return;
    const name = normalizeUsername(username);
    const validationError = validateUsername(name);
    setErrorMessage(validationError ?? undefined);
    if (validationError) return;
    setUsername(name);
    setPhase("creating");
    startTransition(async () => {
      let outcome;
      try {
        outcome = await addUserAction(name);
      } catch (error) {
        unstable_rethrow(error);
        await checkAccount(name);
        return;
      }
      setPhase("form");
      if (!outcome.ok) {
        setErrorMessage(
          outcome.reason === AddUserFailure.UsernameTaken
            ? "That username is already taken."
            : outcome.reason === AddUserFailure.InvalidUsername
              ? "Enter a valid username."
              : outcome.reason === AddUserFailure.OriginUnavailable && outcome.message
                ? outcome.message
                : "Couldn't create the account. Try again."
        );
        if (outcome.reason === AddUserFailure.Forbidden || outcome.reason === AddUserFailure.AppUnavailable)
          router.refresh();
        return;
      }
      setResult(outcome);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger render={<Button className="h-11">{triggerLabel}</Button>} />
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle ref={headingRef} tabIndex={-1}>
            {result ? "Account created. Share this setup link." : "Add User"}
          </DialogTitle>
          <DialogDescription>
            {result
              ? "This link is shown once. Share it with this person so they can set up their account."
              : "Create an account and share its setup link."}
          </DialogDescription>
        </DialogHeader>
        {result ? (
          <SetupLinkResult username={result.username} expiresAt={result.expiresAt} setupUrl={result.setupUrl} />
        ) : (
          <form
            id="add-user-form"
            onSubmit={(event) => {
              event.preventDefault();
              createAccount();
            }}
          >
            <FieldGroup>
              <Field label="Username" htmlFor="add-user-username" error={errorMessage}>
                <Input
                  id="add-user-username"
                  className="h-11"
                  value={username}
                  disabled={locked}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  aria-invalid={!!errorMessage}
                  aria-describedby={errorMessage ? "add-user-username-error" : undefined}
                  onChange={(event) => {
                    setUsername(event.target.value);
                    setErrorMessage(undefined);
                    setPhase("form");
                  }}
                />
              </Field>
            </FieldGroup>
            {phase === "checking" && <p role="status">Checking current account state…</p>}
            {phase === "found" && (
              <p role="status">Account exists; link unavailable. Review Users before continuing.</p>
            )}
            {phase === "absent" && <p role="status">No account found. You can retry creation.</p>}
            {phase === "uncertain" && (
              <p role="status">Result uncertain. Check again before trying to create this account.</p>
            )}
          </form>
        )}
        <DialogFooter>
          <Button variant="outline" className="h-11" disabled={busy} onClick={() => changeOpen(false)}>
            {result || phase === "found" ? "Close" : "Cancel"}
          </Button>
          {!result &&
            phase !== "found" &&
            (phase === "uncertain" ? (
              <Button className="h-11" onClick={() => startTransition(() => checkAccount(normalizeUsername(username)))}>
                Check again
              </Button>
            ) : (
              <Button className="h-11" type="submit" form="add-user-form" disabled={busy}>
                {phase === "creating"
                  ? "Creating…"
                  : phase === "checking"
                    ? "Checking…"
                    : phase === "absent"
                      ? "Retry creation"
                      : "Create account"}
              </Button>
            ))}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
