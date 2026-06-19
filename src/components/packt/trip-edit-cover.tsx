"use client";

import { useState } from "react";
import { Section } from "@/components/packt/form-section";
import { Button } from "@/components/ui/button";
import { TripCover } from "@/components/packt/trip-cover";
import { CoverImagePicker } from "@/components/packt/cover-image-picker";
import type { CoverImageSelection } from "@/data/types";

export interface TripEditCoverProps {
  tripId: string;
  tripName: string;
  coverImageUrl?: string;
  onCoverImageUrlChange: (url: string | null) => void;
  disabled?: boolean;
  destinationName?: string;
  destinationCountry?: string;
  center?: [number, number];
}

export function TripEditCover({
  tripId,
  tripName,
  coverImageUrl,
  onCoverImageUrlChange,
  disabled = false,
  destinationName,
  destinationCountry,
  center,
}: TripEditCoverProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  return (
    <Section title="Cover image">
      <TripCover
        key={coverImageUrl || "__empty__"}
        name={tripName}
        coverImageUrl={coverImageUrl}
        destinationCountry={destinationCountry}
        showCity={false}
        style={{ height: 120, width: "100%", borderRadius: 6, border: "1px solid var(--line)" }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <Button variant="outline" size="sm" disabled={disabled} onClick={() => setIsPickerOpen(true)}>
          Edit cover image
        </Button>
        {coverImageUrl ? (
          <Button variant="ghost" size="sm" disabled={disabled} onClick={() => onCoverImageUrlChange(null)}>
            Remove image
          </Button>
        ) : null}
      </div>
      {isPickerOpen ? (
        <CoverImagePicker
          tripId={tripId}
          destinationName={destinationName}
          destinationCountry={destinationCountry}
          center={center}
          currentCoverImageUrl={coverImageUrl}
          onImageSelected={(image: CoverImageSelection) => {
            onCoverImageUrlChange(image.url);
            setIsPickerOpen(false);
          }}
          onClose={() => setIsPickerOpen(false)}
        />
      ) : null}
    </Section>
  );
}
