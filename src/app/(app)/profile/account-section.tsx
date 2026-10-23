"use client";

import { useState, useTransition, useRef } from "react";
import { Trash2 } from "lucide-react";
import { Section, Field } from "@/components/arrivo/form-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AccountDeletionTrip } from "@/data/types";
import { changePassword } from "./actions";
import { DeleteAccountDialog } from "./delete-account-dialog";

interface ProfileAccountSectionProps {
  sharedOwnedTrips?: AccountDeletionTrip[];
  onDirtyChange?: (dirty: boolean) => void;
}

export function ProfileAccountSection({ sharedOwnedTrips = [], onDirtyChange }: ProfileAccountSectionProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [isPwPending, startPwTransition] = useTransition();

  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleteTriggerRef = useRef<HTMLButtonElement>(null);

  const newPasswordError =
    newPassword.length > 0 && newPassword.length < 8 ? "Password must be at least 8 characters." : null;
  const confirmPasswordError =
    confirmPassword.length > 0 && confirmPassword !== newPassword ? "Passwords do not match." : null;

  function computeDirty(currentPassword: string, newPassword: string, confirmPassword: string) {
    return currentPassword.length > 0 || newPassword.length > 0 || confirmPassword.length > 0;
  }

  function handleCurrentPasswordChange(next: string) {
    if (next === currentPassword) return;
    setCurrentPassword(next);
    onDirtyChange?.(computeDirty(next, newPassword, confirmPassword));
  }

  function handleNewPasswordChange(next: string) {
    if (next === newPassword) return;
    setNewPassword(next);
    onDirtyChange?.(computeDirty(currentPassword, next, confirmPassword));
  }

  function handleConfirmPasswordChange(next: string) {
    if (next === confirmPassword) return;
    setConfirmPassword(next);
    onDirtyChange?.(computeDirty(currentPassword, newPassword, next));
  }

  function handlePasswordSave() {
    setPasswordError(null);
    setPasswordSuccess(false);
    startPwTransition(async () => {
      const result = await changePassword({ currentPassword, newPassword });
      if (result.error) {
        setPasswordError(result.error);
      } else {
        setPasswordSuccess(true);
        setJustSaved(true);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        onDirtyChange?.(false);
        setTimeout(() => setJustSaved(false), 2000);
      }
    });
  }

  const isDirty = computeDirty(currentPassword, newPassword, confirmPassword);

  return (
    <>
      <div style={{ borderTop: "1px solid var(--line)", paddingTop: 24 }}>
        <Section>
          <Field label="Current password" htmlFor="pw-current">
            <Input
              id="pw-current"
              type="password"
              value={currentPassword}
              onChange={(event) => handleCurrentPasswordChange(event.target.value)}
              autoComplete="current-password"
            />
          </Field>

          <Field label="New password" htmlFor="pw-new" error={newPasswordError ?? undefined}>
            <Input
              id="pw-new"
              type="password"
              value={newPassword}
              onChange={(event) => handleNewPasswordChange(event.target.value)}
              autoComplete="new-password"
              aria-invalid={!!newPasswordError || undefined}
              aria-describedby={newPasswordError ? "pw-new-error" : undefined}
            />
          </Field>

          <Field label="Confirm new password" htmlFor="pw-confirm" error={confirmPasswordError ?? undefined}>
            <Input
              id="pw-confirm"
              type="password"
              value={confirmPassword}
              onChange={(event) => handleConfirmPasswordChange(event.target.value)}
              autoComplete="new-password"
              aria-invalid={!!confirmPasswordError || undefined}
              aria-describedby={confirmPasswordError ? "pw-confirm-error" : undefined}
            />
          </Field>

          {passwordError && (
            <p style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--destructive)" }} role="alert">
              {passwordError}
            </p>
          )}
          {passwordSuccess && (
            <p style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--fg-2)" }} role="status">
              Password updated.
            </p>
          )}

          <div className="flex items-center justify-end gap-3">
            {justSaved && (
              <span role="status" style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--accent-brand)" }}>
                Saved
              </span>
            )}
            <Button
              size="sm"
              onClick={handlePasswordSave}
              disabled={isPwPending || !isDirty || !!newPasswordError || !!confirmPasswordError}
            >
              {isPwPending ? "Updating…" : "Update password"}
            </Button>
          </div>

          <div style={{ borderTop: "1px solid var(--line)", paddingTop: 16, marginTop: 8 }}>
            <button
              ref={deleteTriggerRef}
              type="button"
              onClick={() => setDeleteOpen(true)}
              className="flex items-center gap-2 rounded-[6px] px-3 py-1.5 font-medium transition-colors"
              style={{
                color: "var(--destructive)",
                background: "transparent",
                fontSize: "calc(13px * var(--font-scale))",
              }}
              onMouseEnter={(event) =>
                (event.currentTarget.style.background = "color-mix(in srgb, var(--destructive) 10%, transparent)")
              }
              onMouseLeave={(event) => (event.currentTarget.style.background = "transparent")}
            >
              <Trash2 size={14} strokeWidth={1.5} />
              Delete account
            </button>
          </div>
        </Section>
      </div>

      <DeleteAccountDialog
        open={deleteOpen}
        sharedTrips={sharedOwnedTrips}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) deleteTriggerRef.current?.focus();
        }}
      />
    </>
  );
}
