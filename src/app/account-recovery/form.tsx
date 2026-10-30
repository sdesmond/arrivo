"use client";

import { useActionState, useEffect, useRef } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import type { AdminRecoveryActionState } from "@/data/types";
import { PASSWORD_MIN_LENGTH } from "@/lib/password-policy";
import { AuthSubmitButton } from "@/components/arrivo/auth-submit-button";
import { RecoveryCodesStep } from "./codes-step";

interface AdminRecoveryFormProps {
  action: (previous: AdminRecoveryActionState, form: FormData) => Promise<AdminRecoveryActionState>;
  secret: string;
  qrDataUrl: string;
}

const INPUT_CLASS = "h-11 rounded-lg border px-3";
const INPUT_STYLE = { borderColor: "var(--line)", background: "var(--surface)" };

export function AdminRecoveryForm({ action, secret, qrDataUrl }: AdminRecoveryFormProps) {
  const [state, formAction] = useActionState(action, undefined);
  const password = useRef<HTMLInputElement>(null);
  const confirmation = useRef<HTMLInputElement>(null);
  const code = useRef<HTMLInputElement>(null);
  const failure = state && "error" in state ? state : undefined;
  useEffect(() => {
    if (!failure) return;
    const refs = { password, confirmPassword: confirmation, code };
    refs[failure.field].current?.focus();
  }, [failure]);

  if (state && "recoveryCodes" in state) return <RecoveryCodesStep codes={state.recoveryCodes} />;

  async function handleCopyKey() {
    try {
      await navigator.clipboard.writeText(secret);
      toast.success("Setup key copied.");
    } catch {
      toast.error("Couldn't copy. Select the key and copy it yourself.");
    }
  }
  const describedBy = (field: string) => (failure?.field === field ? "recovery-error" : undefined);
  const invalid = (field: string) => (failure?.field === field ? true : undefined);

  return (
    <>
      <h1 className="mb-2 text-xl font-semibold">Recover account</h1>
      <p className="mb-4" style={{ color: "var(--fg-2)" }}>
        Choose a new password and set up a new authenticator. Your old password and two-factor sign-in stop working when
        you finish.
      </p>
      <form action={formAction} noValidate className="flex flex-col gap-4">
        {failure && (
          <p id="recovery-error" role="alert" style={{ color: "var(--destructive)" }}>
            {failure.error}
          </p>
        )}
        <div className="flex flex-col gap-1">
          <label htmlFor="recovery-password">Password</label>
          <input
            ref={password}
            id="recovery-password"
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
          <label htmlFor="recovery-confirm">Confirm password</label>
          <input
            ref={confirmation}
            id="recovery-confirm"
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
        <div className="flex flex-col gap-2">
          <p>Scan this QR code with your authenticator app, then enter the 6-digit code it shows.</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- a generated data URL; next/image adds nothing here */}
          <img
            src={qrDataUrl}
            alt="QR code for your authenticator app"
            width={200}
            height={200}
            className="self-center"
          />
          <div className="flex flex-col gap-1" style={{ color: "var(--fg-2)" }}>
            <span>Can&apos;t scan it? Enter this key:</span>
            <div className="flex items-center gap-2">
              <code
                data-testid="recovery-setup-key"
                className="min-w-0 flex-1"
                style={{
                  fontFamily: "var(--font-mono-family, ui-monospace)",
                  color: "var(--fg)",
                  wordBreak: "break-all",
                }}
              >
                {secret}
              </code>
              <button
                type="button"
                title="Copy key"
                aria-label="Copy key"
                onClick={handleCopyKey}
                className="inline-flex size-11 items-center justify-center rounded-lg"
              >
                <Copy strokeWidth={1.5} />
              </button>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="recovery-code">Code from your app</label>
          <input
            ref={code}
            id="recovery-code"
            name="code"
            inputMode="numeric"
            required
            autoComplete="one-time-code"
            className={INPUT_CLASS}
            style={INPUT_STYLE}
            aria-invalid={invalid("code")}
            aria-describedby={describedBy("code")}
          />
        </div>
        <AuthSubmitButton label="Recover account" />
      </form>
    </>
  );
}
