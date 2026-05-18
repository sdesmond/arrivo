"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Section, Field } from "@/components/packt/form-section";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { changePassword, deleteAccount } from "./actions";

interface ProfileAccountSectionProps {
  onDirtyChange?: (dirty: boolean) => void;
}

export function ProfileAccountSection({ onDirtyChange }: ProfileAccountSectionProps) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [isPwPending, startPwTransition] = useTransition();

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeletePending, startDeleteTransition] = useTransition();
  const deleteTriggerRef = useRef<HTMLButtonElement>(null);

  function computeDirty(cp: string, np: string, conf: string) {
    return cp.length > 0 || np.length > 0 || conf.length > 0;
  }

  function handleCurrentPasswordChange(next: string) {
    setCurrentPassword(next);
    onDirtyChange?.(computeDirty(next, newPassword, confirmPassword));
  }

  function handleNewPasswordChange(next: string) {
    setNewPassword(next);
    onDirtyChange?.(computeDirty(currentPassword, next, confirmPassword));
  }

  function handleConfirmPasswordChange(next: string) {
    setConfirmPassword(next);
    onDirtyChange?.(computeDirty(currentPassword, newPassword, next));
  }

  function handlePasswordSave() {
    setPasswordError(null);
    setPasswordSuccess(false);
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }
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

  function handleDeleteConfirm() {
    startDeleteTransition(async () => {
      await deleteAccount();
      router.push("/sign-in");
    });
  }

  const isDirty = computeDirty(currentPassword, newPassword, confirmPassword);

  const inputStyle = {
    background: "var(--surface-2)",
    color: "var(--fg)",
    border: "1px solid var(--line)",
  };

  return (
    <>
      <div style={{ borderTop: "1px solid var(--line)", paddingTop: 24 }}>
        <Section>
          <Field label="Current password" htmlFor="pw-current">
            <input
              id="pw-current"
              type="password"
              value={currentPassword}
              onChange={(e) => handleCurrentPasswordChange(e.target.value)}
              className="w-full rounded-[6px] px-2.5 py-1.5 text-[13px] outline-none transition-colors"
              style={inputStyle}
              autoComplete="current-password"
            />
          </Field>

          <Field label="New password" htmlFor="pw-new">
            <input
              id="pw-new"
              type="password"
              value={newPassword}
              onChange={(e) => handleNewPasswordChange(e.target.value)}
              className="w-full rounded-[6px] px-2.5 py-1.5 text-[13px] outline-none transition-colors"
              style={inputStyle}
              autoComplete="new-password"
            />
          </Field>

          <Field label="Confirm new password" htmlFor="pw-confirm">
            <input
              id="pw-confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => handleConfirmPasswordChange(e.target.value)}
              className="w-full rounded-[6px] px-2.5 py-1.5 text-[13px] outline-none transition-colors"
              style={inputStyle}
              autoComplete="new-password"
            />
          </Field>

          {passwordError && (
            <p style={{ fontSize: 12, color: "var(--destructive)" }} role="alert">
              {passwordError}
            </p>
          )}
          {passwordSuccess && (
            <p style={{ fontSize: 12, color: "var(--fg-2)" }} role="status">
              Password updated.
            </p>
          )}

          <div className="flex items-center justify-end gap-3">
            {justSaved && (
              <span role="status" style={{ fontSize: "12px", color: "var(--accent-brand)" }}>
                Saved
              </span>
            )}
            <Button size="sm" onClick={handlePasswordSave} disabled={isPwPending || !isDirty}>
              {isPwPending ? "Updating…" : "Update password"}
            </Button>
          </div>

          <div style={{ borderTop: "1px solid var(--line)", paddingTop: 16, marginTop: 8 }}>
            <button
              ref={deleteTriggerRef}
              type="button"
              onClick={() => setDeleteOpen(true)}
              className="flex items-center gap-2 rounded-[6px] px-3 py-1.5 text-[13px] font-medium transition-colors"
              style={{ color: "var(--destructive)", background: "transparent" }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "color-mix(in srgb, var(--destructive) 10%, transparent)")
              }
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <Trash2 size={14} strokeWidth={1.5} />
              Delete account
            </button>
          </div>
        </Section>
      </div>

      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) deleteTriggerRef.current?.focus();
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete account?</DialogTitle>
            <DialogDescription>
              This will permanently delete your account and all trips you own. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} autoFocus>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={isDeletePending}>
              {isDeletePending ? "Deleting…" : "Delete account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
