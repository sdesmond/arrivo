"use client";

import { useState, useTransition } from "react";
import { Copy } from "lucide-react";
import { Section, Field } from "@/components/arrivo/form-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { toast } from "sonner";
import { updateProfile } from "./actions";
import type { UserProfile } from "@/data/types";
import { copyToClipboard } from "@/lib/clipboard";
import { FIELD_LIMITS, overLimitMessage } from "@/lib/validation-limits";

interface PassportSectionProps {
  user: UserProfile;
  onDirtyChange?: (dirty: boolean) => void;
}

export function PassportSection({ user, onDirtyChange }: PassportSectionProps) {
  const [passportNumber, setPassportNumber] = useState(user.passportNumber ?? "");
  const [passportExpiry, setPassportExpiry] = useState<string | undefined>(user.passportExpiry ?? undefined);
  const [passportNationality, setPassportNationality] = useState(user.passportNationality ?? "");
  const [knownTravelerNumber, setKnownTravelerNumber] = useState(user.knownTravelerNumber ?? "");
  const [isPending, startTransition] = useTransition();

  function computeDirty(
    passportNumber: string,
    passportExpiry: string | undefined,
    passportNationality: string,
    knownTravelerNumber: string
  ) {
    return (
      passportNumber !== (user.passportNumber ?? "") ||
      passportExpiry !== (user.passportExpiry ?? undefined) ||
      passportNationality !== (user.passportNationality ?? "") ||
      knownTravelerNumber !== (user.knownTravelerNumber ?? "")
    );
  }

  const passportNumberError =
    passportNumber.length > FIELD_LIMITS.passportNumber
      ? overLimitMessage("Passport number", FIELD_LIMITS.passportNumber)
      : null;
  const nationalityError =
    passportNationality.length > FIELD_LIMITS.passportNationality
      ? overLimitMessage("Nationality", FIELD_LIMITS.passportNationality)
      : null;
  const ktnError =
    knownTravelerNumber.length > FIELD_LIMITS.knownTravelerNumber
      ? overLimitMessage("Known traveler number", FIELD_LIMITS.knownTravelerNumber)
      : null;
  const hasError = !!(passportNumberError || nationalityError || ktnError);

  function handleSave() {
    startTransition(async () => {
      const result = await updateProfile({
        passportNumber: passportNumber || null,
        passportExpiry: passportExpiry,
        passportNationality: passportNationality || null,
        knownTravelerNumber: knownTravelerNumber || null,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      onDirtyChange?.(false);
    });
  }

  const isDirty = computeDirty(passportNumber, passportExpiry, passportNationality, knownTravelerNumber);

  return (
    <Section title="Passport & Travel Documents">
      <Field label="Passport number" htmlFor="passport-number" error={passportNumberError ?? undefined}>
        <div className="flex items-center gap-2">
          <Input
            className="min-w-0 flex-1"
            id="passport-number"
            type="text"
            value={passportNumber}
            onChange={(event) => {
              const next = event.target.value;
              if (next === passportNumber) return;
              setPassportNumber(next);
              onDirtyChange?.(computeDirty(next, passportExpiry, passportNationality, knownTravelerNumber));
            }}
            placeholder="e.g. A12345678"
            autoComplete="off"
            aria-invalid={!!passportNumberError || undefined}
            aria-describedby={passportNumberError ? "passport-number-error" : undefined}
          />
          {passportNumber.trim() && (
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              title="Copy passport number"
              aria-label="Copy passport number"
              onClick={() => {
                void copyToClipboard(passportNumber, "Could not copy passport number.");
              }}
            >
              <Copy strokeWidth={1.5} aria-hidden="true" />
            </Button>
          )}
        </div>
      </Field>

      <Field label="Expiry date">
        <DatePicker
          value={passportExpiry}
          onChange={(value) => {
            if (value === passportExpiry) return;
            setPassportExpiry(value);
            onDirtyChange?.(computeDirty(passportNumber, value, passportNationality, knownTravelerNumber));
          }}
          placeholder="Expiry date"
        />
      </Field>

      <Field label="Nationality" htmlFor="passport-nationality" error={nationalityError ?? undefined}>
        <Input
          id="passport-nationality"
          type="text"
          value={passportNationality}
          onChange={(event) => {
            const next = event.target.value;
            if (next === passportNationality) return;
            setPassportNationality(next);
            onDirtyChange?.(computeDirty(passportNumber, passportExpiry, next, knownTravelerNumber));
          }}
          placeholder="e.g. American"
          aria-invalid={!!nationalityError || undefined}
          aria-describedby={nationalityError ? "passport-nationality-error" : undefined}
        />
      </Field>

      <Field label="Known traveler number (TSA PreCheck / Global Entry)" htmlFor="ktn" error={ktnError ?? undefined}>
        <div className="flex items-center gap-2">
          <Input
            className="min-w-0 flex-1"
            id="ktn"
            type="text"
            value={knownTravelerNumber}
            onChange={(event) => {
              const next = event.target.value;
              if (next === knownTravelerNumber) return;
              setKnownTravelerNumber(next);
              onDirtyChange?.(computeDirty(passportNumber, passportExpiry, passportNationality, next));
            }}
            placeholder="e.g. 123456789"
            autoComplete="off"
            aria-invalid={!!ktnError || undefined}
            aria-describedby={ktnError ? "ktn-error" : undefined}
          />
          {knownTravelerNumber.trim() && (
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              title="Copy known traveler number"
              aria-label="Copy known traveler number"
              onClick={() => {
                void copyToClipboard(knownTravelerNumber, "Could not copy known traveler number.");
              }}
            >
              <Copy strokeWidth={1.5} aria-hidden="true" />
            </Button>
          )}
        </div>
      </Field>

      <div className="flex items-center justify-end gap-3">
        <Button size="sm" onClick={handleSave} loading={isPending} disabled={!isDirty || hasError}>
          Save
        </Button>
      </div>
    </Section>
  );
}
