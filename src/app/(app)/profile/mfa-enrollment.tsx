"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Field } from "@/components/arrivo/form-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MfaEnrollmentStart } from "@/data/types";
import { confirmMfaEnrollment, startMfaEnrollment } from "./security-actions";

interface MfaEnrollmentProps {
  onEnrolled: (recoveryCodes: string[]) => void;
}

const HINT_STYLE: React.CSSProperties = { fontSize: "calc(13px * var(--font-scale))", color: "var(--fg-2)" };

export function MfaEnrollment({ onEnrolled }: MfaEnrollmentProps) {
  const [setup, setSetup] = useState<MfaEnrollmentStart | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const startRef = useRef<HTMLButtonElement>(null);

  function handleStart() {
    setError(null);
    startTransition(async () => {
      const result = await startMfaEnrollment();
      if ("error" in result) setError(result.error);
      else setSetup(result);
    });
  }

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await confirmMfaEnrollment(code);
      if (result.recoveryCodes) onEnrolled(result.recoveryCodes);
      else setError(result.error ?? "Something went wrong.");
    });
  }

  function handleCancel() {
    setSetup(null);
    setCode("");
    setError(null);
    requestAnimationFrame(() => startRef.current?.focus());
  }

  async function handleCopyKey() {
    try {
      await navigator.clipboard.writeText(setup!.secret);
      toast.success("Setup key copied.");
    } catch {
      toast.error("Couldn't copy. Select the key and copy it yourself.");
    }
  }

  const errorMessage = error && (
    <p role="alert" style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--destructive)" }}>
      {error}
    </p>
  );

  if (!setup) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p style={HINT_STYLE}>
          Add a code from an authenticator app (such as 1Password, Google Authenticator or Authy) to every sign-in.
        </p>
        {errorMessage}
        <Button ref={startRef} className="h-11" onClick={handleStart} disabled={isPending}>
          {isPending ? "Preparing…" : "Set up two-factor authentication"}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p style={HINT_STYLE}>Scan this QR code with your authenticator app, then enter the 6-digit code it shows.</p>
      {/* eslint-disable-next-line @next/next/no-img-element -- a generated data URL; next/image adds nothing here */}
      <img src={setup.qrDataUrl} alt="QR code for your authenticator app" width={200} height={200} />
      <div className="flex flex-wrap items-center gap-2" style={HINT_STYLE}>
        <span>Can&apos;t scan it? Enter this key:</span>
        <code
          data-testid="mfa-setup-key"
          style={{ fontFamily: "var(--font-mono-family, ui-monospace)", color: "var(--fg)", wordBreak: "break-all" }}
        >
          {setup.secret}
        </code>
        <Button variant="outline" className="h-11" onClick={handleCopyKey}>
          Copy key
        </Button>
      </div>
      <Field label="Code from your app" htmlFor="mfa-enroll-code">
        <Input
          id="mfa-enroll-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          aria-invalid={!!error || undefined}
        />
      </Field>
      {errorMessage}
      <div className="flex justify-end gap-3">
        <Button variant="outline" className="h-11" onClick={handleCancel} disabled={isPending}>
          Cancel
        </Button>
        <Button
          className="h-11"
          onClick={handleConfirm}
          disabled={isPending || !/^\d{6}$/.test(code.replace(/\s/g, ""))}
        >
          {isPending ? "Checking…" : "Turn on"}
        </Button>
      </div>
    </div>
  );
}
