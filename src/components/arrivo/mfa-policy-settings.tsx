"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import type { MfaPolicySaveResult } from "@/data/types";
import { saveMfaPolicySettings } from "@/app/(app)/admin/security/actions";

interface MfaRequirementControlProps {
  required: boolean;
  label: string;
  inherited?: boolean;
  unavailable?: boolean;
  explainTiming?: boolean;
  onSave: (required: boolean, expected: boolean) => Promise<MfaPolicySaveResult>;
}

const ERRORS = {
  stale: "Policy changed. Reload before saving again.",
  forbidden: "Your admin access changed. Reload before saving again.",
  unavailable: "Two-factor policy is unavailable. Try again.",
  invalid: "Invalid policy change.",
  "key-unavailable": "Set DATA_ENCRYPTION_KEY on the server before requiring two-factor authentication.",
};

export function MfaRequirementControl({
  required,
  label,
  inherited,
  unavailable,
  explainTiming,
  onSave,
}: MfaRequirementControlProps) {
  const router = useRouter();
  const tooltipId = useId();
  const [saved, setSaved] = useState(required);
  const [authoritative, setAuthoritative] = useState(required);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (required !== authoritative) {
    setAuthoritative(required);
    setSaved(required);
    setError(null);
  }
  const control = (
    <label className="flex min-h-11 cursor-pointer items-center gap-3">
      <Switch
        checked={inherited || saved}
        disabled={pending || unavailable || inherited}
        onCheckedChange={(checked) => {
          if (pending || unavailable || inherited) return;
          setError(null);
          startTransition(async () => {
            try {
              const result = await onSave(checked === true, saved);
              if (result.status === "ok") {
                setSaved(result.required);
                router.refresh();
              } else setError(ERRORS[result.status]);
            } catch {
              setError(ERRORS.unavailable);
            }
          });
        }}
      />
      <span>{label}</span>
    </label>
  );
  return (
    <div className="flex flex-col gap-2" style={{ color: "var(--fg)" }}>
      {inherited ? (
        <Tooltip>
          <TooltipTrigger
            render={<span tabIndex={0} className="inline-flex min-h-11" />}
            aria-label="2FA requirement managed by Security"
            aria-describedby={tooltipId}
          >
            {control}
          </TooltipTrigger>
          <TooltipContent id={tooltipId} role="tooltip">
            2FA is turned on for everyone in the Security tab
          </TooltipContent>
        </Tooltip>
      ) : (
        control
      )}
      {explainTiming && (
        <p style={{ color: "var(--fg-2)" }}>
          {saved
            ? "Turning this off will not remove 2FA from users currently enrolled"
            : "Turning this on will enforce 2FA enrollment at next sign-in"}
        </p>
      )}
      {(error || unavailable) && (
        <p role="alert" style={{ color: "var(--destructive)" }}>
          {error ?? ERRORS.unavailable}
        </p>
      )}
    </div>
  );
}

interface MfaPolicySettingsProps {
  required?: boolean;
}

export function MfaPolicySettings({ required }: MfaPolicySettingsProps) {
  return (
    <div className="mt-6 flex flex-col gap-2">
      <h3 className="font-semibold">Two-factor authentication</h3>
      <MfaRequirementControl
        explainTiming
        required={required ?? false}
        unavailable={required === undefined}
        label="Require two-factor authentication for everyone"
        onSave={saveMfaPolicySettings}
      />
    </div>
  );
}
