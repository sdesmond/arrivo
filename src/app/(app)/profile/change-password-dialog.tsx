"use client";

import { useRef, useState, useTransition } from "react";
import { Field } from "@/components/arrivo/form-section";
import { PasswordRequirements } from "@/components/arrivo/password-requirements";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { PasswordPolicy } from "@/data/types";
import { PASSWORD_POLICY_UNAVAILABLE_ERROR } from "@/lib/password-policy";
import { changePassword } from "./actions";

export interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Rules from the server page; undefined when they could not be read. */
  passwordPolicy?: PasswordPolicy;
}

type InvalidField = "current" | "new" | "confirm";

const INCORRECT_CURRENT_PASSWORD = "Current password is incorrect.";
const TEXT_SIZE = { fontSize: "calc(12px * var(--font-scale))" };

/**
 * The change-password form, in a dialog. A successful change signs the user out (the action redirects), so success
 * keeps the submit disabled until that navigation lands. Closing resets every field and error.
 */
export function ChangePasswordDialog({ open, onOpenChange, passwordPolicy }: ChangePasswordDialogProps) {
  // A refused save returns the rules as the server now sees them, so a stale checklist corrects itself.
  const [refreshedPolicy, setRefreshedPolicy] = useState<PasswordPolicy | undefined>();
  const activePolicy = refreshedPolicy ?? passwordPolicy;
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [invalidField, setInvalidField] = useState<InvalidField | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();
  const currentRef = useRef<HTMLInputElement>(null);
  const newRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  const mismatch = confirmPassword.length > 0 && confirmPassword !== newPassword;
  const confirmError = mismatch ? "Passwords do not match." : undefined;

  function reset() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
    setInvalidField(null);
    setSuccess(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  function focusField(field: InvalidField) {
    setInvalidField(field);
    const target = { current: currentRef, new: newRef, confirm: confirmRef }[field];
    setTimeout(() => target.current?.focus(), 0);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setInvalidField(null);
    if (mismatch) {
      focusField("confirm");
      return;
    }
    startTransition(async () => {
      const result = await changePassword({ currentPassword, newPassword });
      if (result.error) {
        setError(result.error);
        if (result.policy) setRefreshedPolicy(result.policy);
        focusField(result.error === INCORRECT_CURRENT_PASSWORD ? "current" : "new");
        return;
      }
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    });
  }

  const describedBy = (field: InvalidField, extra?: string) =>
    [invalidField === field ? "change-password-error" : undefined, extra].filter(Boolean).join(" ") || undefined;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Change password</DialogTitle>
            <DialogDescription>
              Enter your current password and choose a new one. You&apos;ll be signed out on every device afterwards.
            </DialogDescription>
          </DialogHeader>

          <Field label="Current password" htmlFor="pw-current">
            <Input
              ref={currentRef}
              id="pw-current"
              className="h-11"
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
              aria-invalid={invalidField === "current" || undefined}
              aria-describedby={describedBy("current")}
            />
          </Field>

          {activePolicy ? (
            <Field label="New password" htmlFor="pw-new">
              <Input
                ref={newRef}
                id="pw-new"
                className="h-11"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                aria-invalid={invalidField === "new" || undefined}
                aria-describedby={describedBy("new", "pw-new-requirements")}
              />
              <div style={{ marginTop: 8 }}>
                <PasswordRequirements id="pw-new-requirements" password={newPassword} policy={activePolicy} />
              </div>
            </Field>
          ) : (
            <p style={{ ...TEXT_SIZE, color: "var(--destructive)" }} role="alert">
              {PASSWORD_POLICY_UNAVAILABLE_ERROR}
            </p>
          )}

          <Field label="Confirm new password" htmlFor="pw-confirm" error={confirmError}>
            <Input
              ref={confirmRef}
              id="pw-confirm"
              className="h-11"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              aria-invalid={mismatch || invalidField === "confirm" || undefined}
              aria-describedby={mismatch ? "pw-confirm-error" : undefined}
            />
          </Field>

          {error && (
            <p id="change-password-error" role="alert" style={{ ...TEXT_SIZE, color: "var(--destructive)" }}>
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" className="h-11" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="h-11" loading={isPending} disabled={success || !activePolicy}>
              Update password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
