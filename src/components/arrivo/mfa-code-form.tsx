"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { MfaActionState } from "@/data/types";
import { AuthSubmitButton } from "./auth-submit-button";

interface MfaCodeFormProps {
  action: (prev: MfaActionState, formData: FormData) => Promise<MfaActionState>;
  onBack: () => void;
}

const LINK_BUTTON_STYLE: React.CSSProperties = { color: "var(--accent-brand)" };

export function MfaCodeForm({ action, onBack }: MfaCodeFormProps) {
  const [state, formAction] = useActionState(action, undefined);
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const hasError = !!state?.error;
  const expired = !!state?.expired;

  useEffect(() => {
    (expired ? backRef.current : inputRef.current)?.focus();
  }, [expired, useRecoveryCode]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <p id="mfa-instructions" style={{ color: "var(--fg-2)" }}>
        {useRecoveryCode
          ? "Enter one of the recovery codes you saved when you set up two-factor authentication."
          : "Enter the 6-digit code from your authenticator app."}
      </p>
      {hasError && (
        <p id="mfa-error" role="alert" aria-live="polite" style={{ color: "var(--destructive)" }}>
          {state!.error}
        </p>
      )}
      {!expired && (
        <>
          <div className="flex flex-col gap-1">
            <label htmlFor="code">{useRecoveryCode ? "Recovery code" : "Authentication code"}</label>
            <input
              key={useRecoveryCode ? "recovery" : "totp"}
              ref={inputRef}
              id="code"
              name="code"
              type="text"
              required
              inputMode={useRecoveryCode ? "text" : "numeric"}
              autoComplete={useRecoveryCode ? "off" : "one-time-code"}
              className="h-11 rounded-lg border px-3"
              style={{ borderColor: "var(--line)", background: "var(--surface)" }}
              aria-invalid={hasError || undefined}
              aria-describedby={hasError ? "mfa-instructions mfa-error" : "mfa-instructions"}
            />
          </div>
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" name="remember" className="size-5" style={{ accentColor: "var(--accent-brand)" }} />
            Remember this computer for 30 days
          </label>
          <AuthSubmitButton label="Verify" />
          <button
            type="button"
            onClick={() => setUseRecoveryCode((current) => !current)}
            className="h-11 px-3 text-sm underline"
            style={LINK_BUTTON_STYLE}
          >
            {useRecoveryCode ? "Use your authenticator app instead" : "Use a recovery code"}
          </button>
        </>
      )}
      <button ref={backRef} type="button" onClick={onBack} className="h-11 px-3 text-sm" style={LINK_BUTTON_STYLE}>
        Back to sign in
      </button>
    </form>
  );
}
