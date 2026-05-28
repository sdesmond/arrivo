"use client";

import { Field, Section } from "@/components/packt/form-section";

export interface TripEditDestinationProps {
  destinationName?: string;
  destinationCountry?: string;
}

export function TripEditDestination({ destinationName, destinationCountry }: TripEditDestinationProps) {
  if (!destinationName && !destinationCountry) {
    return null;
  }

  return (
    <Section title="Destination">
      {destinationName ? (
        <Field label="Destination">
          <div style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--fg)" }}>{destinationName}</div>
        </Field>
      ) : null}
      {destinationCountry ? (
        <Field label="Country">
          <div style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--fg)" }}>{destinationCountry}</div>
        </Field>
      ) : null}
    </Section>
  );
}
