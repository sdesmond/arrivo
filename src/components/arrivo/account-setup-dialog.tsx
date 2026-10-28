"use client";

import { useActionState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AccountSetupActionState } from "@/data/types";
import { PASSWORD_MIN_LENGTH } from "@/lib/password-policy";
import { AuthSubmitButton } from "./auth-submit-button";

interface AccountSetupDialogProps {
  username: string;
  action: (prev: AccountSetupActionState, formData: FormData) => Promise<AccountSetupActionState>;
}

const ignoreDismissal = () => {};
const INPUT_CLASS = "h-11 rounded-lg border px-3";
const INPUT_STYLE = { borderColor: "var(--line)", background: "var(--surface)" };

// Non-dismissable on purpose: nothing behind it is reachable until the password is saved.
export function AccountSetupDialog({ username, action }: AccountSetupDialogProps) {
  const [state, formAction] = useActionState(action, undefined);
  const nameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!state) return;
    const target = { name: nameRef, password: passwordRef, confirmPassword: confirmRef }[state.field];
    target.current?.focus();
  }, [state]);

  const invalid = (field: string) => (state?.field === field ? true : undefined);
  const describedBy = (field: string) => (state?.field === field ? "account-setup-error" : undefined);

  return (
    <Dialog open onOpenChange={ignoreDismissal} disablePointerDismissal>
      <DialogContent showCloseButton={false} aria-describedby="account-setup-description">
        <DialogHeader>
          <DialogTitle>Set up your account</DialogTitle>
          <DialogDescription id="account-setup-description">
            Choose a name and password to finish setting up your account. A password is required before you can use
            Arrivo.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} noValidate className="flex flex-col gap-4">
          {state && (
            <p id="account-setup-error" role="alert" style={{ color: "var(--destructive)" }}>
              {state.error}
            </p>
          )}
          <div className="flex flex-col gap-1">
            <span>Username</span>
            <span className="flex min-h-11 items-center font-medium" style={{ color: "var(--fg)" }}>
              {username}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="account-setup-name">Name</label>
            <input
              ref={nameRef}
              id="account-setup-name"
              name="name"
              type="text"
              required
              defaultValue={state?.name ?? ""}
              autoComplete="name"
              className={INPUT_CLASS}
              style={INPUT_STYLE}
              aria-invalid={invalid("name")}
              aria-describedby={describedBy("name")}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="account-setup-password">Password</label>
            <input
              ref={passwordRef}
              id="account-setup-password"
              name="password"
              type="password"
              required
              minLength={PASSWORD_MIN_LENGTH}
              autoComplete="new-password"
              className={INPUT_CLASS}
              style={INPUT_STYLE}
              aria-invalid={invalid("password")}
              aria-describedby={describedBy("password")}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="account-setup-confirm-password">Confirm password</label>
            <input
              ref={confirmRef}
              id="account-setup-confirm-password"
              name="confirmPassword"
              type="password"
              required
              autoComplete="new-password"
              className={INPUT_CLASS}
              style={INPUT_STYLE}
              aria-invalid={invalid("confirmPassword")}
              aria-describedby={describedBy("confirmPassword")}
            />
          </div>
          <AuthSubmitButton label="Save and continue" />
        </form>
      </DialogContent>
    </Dialog>
  );
}
