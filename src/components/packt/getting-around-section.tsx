"use client";

import { Car, Footprints, TrainFront } from "lucide-react";
import { Section, Field } from "@/components/packt/form-section";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TransitMode } from "@/data/types";

const TRANSIT_MODE_OPTIONS = [
  { value: TransitMode.Walk, label: "Walk", Icon: Footprints },
  { value: TransitMode.Drive, label: "Drive", Icon: Car },
  { value: TransitMode.Transit, label: "Transit", Icon: TrainFront },
] as const;

export interface GettingAroundSectionProps {
  transitMode: TransitMode;
  onTransitModeChange: (mode: TransitMode) => void;
  disabled?: boolean;
}

export function GettingAroundSection({ transitMode, onTransitModeChange, disabled }: GettingAroundSectionProps) {
  return (
    <Section title="Getting Around">
      <Field label="Default transit mode">
        <ToggleGroup
          aria-label="Default transit mode"
          value={[transitMode]}
          disabled={disabled}
          onValueChange={(values) => {
            const next = values[0];
            if (next && next !== transitMode) {
              onTransitModeChange(next as TransitMode);
            }
          }}
        >
          {TRANSIT_MODE_OPTIONS.map(({ value, label, Icon }) => (
            <ToggleGroupItem
              key={value}
              value={value}
              className="h-11 min-w-11 px-3.5 text-fg-3 aria-pressed:bg-accent-soft aria-pressed:text-accent-ink"
            >
              <Icon strokeWidth={1.5} />
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>
    </Section>
  );
}
