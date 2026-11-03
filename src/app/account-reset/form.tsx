"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { PasswordPolicy, PasswordResetActionState } from "@/data/types";
import { AuthSubmitButton } from "@/components/arrivo/auth-submit-button";
import { PasswordRequirements } from "@/components/arrivo/password-requirements";

interface PasswordResetFormProps {
  action: (previous: PasswordResetActionState, form: FormData) => Promise<PasswordResetActionState>;
  /** Rules read by the server page; a failed submission returns the current ones. */
  policy: PasswordPolicy;
}
export function PasswordResetForm({ action, policy }: PasswordResetFormProps) {
  const [state, formAction] = useActionState(action, undefined);
  const [newPassword, setNewPassword] = useState("");
  const password = useRef<HTMLInputElement>(null);
  const confirmation = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (state) (state.field === "password" ? password : confirmation).current?.focus();
  }, [state]);
  const inputClass = "h-11 rounded-lg border px-3";
  const style = { borderColor: "var(--line)", background: "var(--surface)" };
  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      {state && (
        <p id="reset-error" role="alert" style={{ color: "var(--destructive)" }}>
          {state.error}
        </p>
      )}
      <div className="flex flex-col gap-1">
        <label htmlFor="reset-password">Password</label>
        <input
          ref={password}
          id="reset-password"
          name="password"
          type="password"
          required
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          autoComplete="new-password"
          className={inputClass}
          style={style}
          aria-invalid={state?.field === "password" || undefined}
          aria-describedby={state?.field === "password" ? "reset-error reset-requirements" : "reset-requirements"}
        />
        <PasswordRequirements id="reset-requirements" password={newPassword} policy={state?.policy ?? policy} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="reset-confirm">Confirm password</label>
        <input
          ref={confirmation}
          id="reset-confirm"
          name="confirmPassword"
          type="password"
          required
          autoComplete="new-password"
          className={inputClass}
          style={style}
          aria-invalid={state?.field === "confirmPassword" || undefined}
          aria-describedby={state?.field === "confirmPassword" ? "reset-error" : undefined}
        />
      </div>
      <AuthSubmitButton label="Reset password" />
    </form>
  );
}
