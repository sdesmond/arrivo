"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { Field, Section } from "@/components/arrivo/form-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SignInNotice, type MfaStatus, type SecondFactorInput, type TrustedDeviceSummary } from "@/data/types";
import { MfaEnrollment } from "./mfa-enrollment";
import { RecoveryCodesDialog } from "./recovery-codes-dialog";
import { TrustedDevicesList } from "./trusted-devices-list";
import { disableMfa, regenerateRecoveryCodes, signOutEverywhere } from "./security-actions";

interface ProfileSecuritySectionProps {
  status: MfaStatus;
  devices: TrustedDeviceSummary[];
  encryptionConfigured: boolean;
}

type ConfirmKind = "regenerate" | "disable";

const TEXT_STYLE: React.CSSProperties = { fontSize: "calc(13px * var(--font-scale))", color: "var(--fg-2)" };

const CONFIRM_COPY: Record<ConfirmKind, { title: string; description: string; action: string }> = {
  regenerate: {
    title: "Regenerate recovery codes?",
    description: "Your old recovery codes stop working. Confirm with your password and a code from your app.",
    action: "Regenerate codes",
  },
  disable: {
    title: "Turn off two-factor authentication?",
    description: "Signing in will only need your password. You'll be signed out on every device.",
    action: "Turn off",
  },
};

export function ProfileSecuritySection({ status, devices, encryptionConfigured }: ProfileSecuritySectionProps) {
  const router = useRouter();
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [codesFromEnrollment, setCodesFromEnrollment] = useState(false);
  const [confirmKind, setConfirmKind] = useState<ConfirmKind | null>(null);
  const [isSignOutPending, startSignOutTransition] = useTransition();
  const regenerateRef = useRef<HTMLButtonElement>(null);
  const disableRef = useRef<HTMLButtonElement>(null);

  function handleEnrolled(codes: string[]) {
    setCodesFromEnrollment(true);
    setRecoveryCodes(codes);
  }

  function handleCodesSaved() {
    setRecoveryCodes(null);
    // Turning two-factor on already signed out every session, this one included; sign in again with a code.
    if (codesFromEnrollment) router.push(`/sign-in?notice=${SignInNotice.MfaEnabled}`);
    else router.refresh();
  }

  function closeConfirm() {
    const trigger = confirmKind === "regenerate" ? regenerateRef : disableRef;
    setConfirmKind(null);
    requestAnimationFrame(() => trigger.current?.focus());
  }

  async function handleConfirm(input: SecondFactorInput): Promise<string | undefined> {
    if (confirmKind === "disable") return (await disableMfa(input)).error;

    const result = await regenerateRecoveryCodes(input);
    if (result.error) return result.error;
    setConfirmKind(null);
    setCodesFromEnrollment(false);
    setRecoveryCodes(result.recoveryCodes ?? null);
  }

  return (
    <div className="flex flex-col gap-8">
      <Section title="Two-factor authentication">
        {status.enabled ? (
          <>
            <p role="status" style={TEXT_STYLE}>
              Two-factor authentication is on
              {status.enabledAt ? ` (since ${format(parseISO(status.enabledAt), "MMM d, yyyy")})` : ""}.{" "}
              {status.recoveryCodesRemaining} recovery {status.recoveryCodesRemaining === 1 ? "code" : "codes"} left.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                ref={regenerateRef}
                variant="outline"
                className="h-11"
                onClick={() => setConfirmKind("regenerate")}
              >
                Regenerate recovery codes
              </Button>
              <Button ref={disableRef} variant="destructive" className="h-11" onClick={() => setConfirmKind("disable")}>
                Turn off two-factor authentication
              </Button>
            </div>
          </>
        ) : (
          <>
            <p role="status" style={TEXT_STYLE}>
              Two-factor authentication is off.
            </p>
            {encryptionConfigured ? (
              <MfaEnrollment onEnrolled={handleEnrolled} />
            ) : (
              <p style={TEXT_STYLE}>
                Setting it up needs DATA_ENCRYPTION_KEY set on the server. Ask whoever runs this Arrivo install.
              </p>
            )}
          </>
        )}
      </Section>

      <Section title="Your browsers">
        <p style={TEXT_STYLE}>
          Browsers you&apos;ve signed in from. Failed sign-ins elsewhere never lock you out of these. Remove any you
          don&apos;t recognize; removing one signs it out.
        </p>
        <TrustedDevicesList devices={devices} />
      </Section>

      <Section title="Sessions">
        <p style={TEXT_STYLE}>Signed in somewhere you no longer use? Sign out everywhere, including here.</p>
        <div>
          <Button
            variant="outline"
            className="h-11"
            disabled={isSignOutPending}
            onClick={() => startSignOutTransition(() => signOutEverywhere())}
          >
            {isSignOutPending ? "Signing out…" : "Sign out all devices"}
          </Button>
        </div>
      </Section>

      <SecondFactorDialog kind={confirmKind} onCancel={closeConfirm} onConfirm={handleConfirm} />
      <RecoveryCodesDialog codes={recoveryCodes} onDone={handleCodesSaved} />
    </div>
  );
}

interface SecondFactorDialogProps {
  kind: ConfirmKind | null;
  onCancel: () => void;
  onConfirm: (input: SecondFactorInput) => Promise<string | undefined>;
}

function SecondFactorDialog({ kind, onCancel, onConfirm }: SecondFactorDialogProps) {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const copy = kind ? CONFIRM_COPY[kind] : null;

  function reset() {
    setPassword("");
    setCode("");
    setError(null);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const failure = await onConfirm({ password, code });
      if (failure) setError(failure);
      else reset();
    });
  }

  return (
    <Dialog
      open={kind !== null}
      onOpenChange={(open) => {
        if (!open) {
          reset();
          onCancel();
        }
      }}
    >
      <DialogContent showCloseButton={false}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{copy?.title}</DialogTitle>
            <DialogDescription>{copy?.description}</DialogDescription>
          </DialogHeader>
          <Field label="Current password" htmlFor="second-factor-password">
            <Input
              id="second-factor-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              autoFocus
            />
          </Field>
          <Field label="Code from your app or a recovery code" htmlFor="second-factor-code">
            <Input
              id="second-factor-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoComplete="one-time-code"
              aria-invalid={!!error || undefined}
            />
          </Field>
          {error && (
            <p role="alert" style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--destructive)" }}>
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={() => {
                reset();
                onCancel();
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant={kind === "disable" ? "destructive" : "default"}
              className="h-11"
              disabled={isPending || !password || !code}
            >
              {isPending ? "Checking…" : copy?.action}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
