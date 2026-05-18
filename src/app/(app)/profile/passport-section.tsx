"use client";

import { useState, useTransition } from "react";
import { Section, Field } from "@/components/packt/form-section";
import { Button } from "@/components/ui/button";
import { updateProfile } from "./actions";
import type { UserProfile } from "@/data/types";

interface PassportSectionProps {
  user: UserProfile;
}

const INPUT_CLASS = "w-full rounded-[6px] px-2.5 py-1.5 text-[13px] outline-none transition-colors";
const INPUT_STYLE: React.CSSProperties = {
  background: "var(--surface-2)",
  color: "var(--fg)",
  border: "1px solid var(--line)",
};

export function PassportSection({ user }: PassportSectionProps) {
  const [passportNumber, setPassportNumber] = useState(user.passportNumber ?? "");
  const [passportExpiry, setPassportExpiry] = useState(user.passportExpiry ?? "");
  const [passportNationality, setPassportNationality] = useState(user.passportNationality ?? "");
  const [knownTravelerNumber, setKnownTravelerNumber] = useState(user.knownTravelerNumber ?? "");
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      await updateProfile({
        passportNumber: passportNumber || undefined,
        passportExpiry: passportExpiry || undefined,
        passportNationality: passportNationality || undefined,
        knownTravelerNumber: knownTravelerNumber || undefined,
      });
    });
  }

  return (
    <Section title="Passport & Travel Documents">
      <Field label="Passport number" htmlFor="passport-number">
        <input
          id="passport-number"
          type="text"
          value={passportNumber}
          onChange={(e) => setPassportNumber(e.target.value)}
          className={INPUT_CLASS}
          style={INPUT_STYLE}
          placeholder="e.g. A12345678"
          autoComplete="off"
        />
      </Field>

      <Field label="Expiry date" htmlFor="passport-expiry">
        <input
          id="passport-expiry"
          type="date"
          value={passportExpiry}
          onChange={(e) => setPassportExpiry(e.target.value)}
          className={INPUT_CLASS}
          style={INPUT_STYLE}
        />
      </Field>

      <Field label="Nationality" htmlFor="passport-nationality">
        <input
          id="passport-nationality"
          type="text"
          value={passportNationality}
          onChange={(e) => setPassportNationality(e.target.value)}
          className={INPUT_CLASS}
          style={INPUT_STYLE}
          placeholder="e.g. American"
        />
      </Field>

      <Field label="Known traveler number (TSA PreCheck / Global Entry)" htmlFor="ktn">
        <input
          id="ktn"
          type="text"
          value={knownTravelerNumber}
          onChange={(e) => setKnownTravelerNumber(e.target.value)}
          className={INPUT_CLASS}
          style={INPUT_STYLE}
          placeholder="e.g. 123456789"
          autoComplete="off"
        />
      </Field>

      <div>
        <Button size="sm" onClick={handleSave} disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </Section>
  );
}
