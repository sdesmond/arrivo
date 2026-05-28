"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Field, Section } from "@/components/packt/form-section";
import { Input } from "@/components/ui/input";

export interface TripEditCoverProps {
  tripName: string;
  coverImageUrl?: string;
  onCoverImageUrlChange: (url: string | undefined) => void;
  disabled?: boolean;
}

export function TripEditCover({
  tripName,
  coverImageUrl,
  onCoverImageUrlChange,
  disabled = false,
}: TripEditCoverProps) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setImgError(false);
  }, [coverImageUrl]);

  return (
    <Section title="Cover image">
      <Field label="Image URL" htmlFor="trip-cover-image-url">
        <Input
          id="trip-cover-image-url"
          disabled={disabled}
          value={coverImageUrl ?? ""}
          placeholder="https://…"
          onChange={(event) => onCoverImageUrlChange(event.target.value.trim() || undefined)}
        />
      </Field>
      {coverImageUrl && !imgError ? (
        <Image
          src={coverImageUrl}
          alt={tripName.length > 100 ? `${tripName.slice(0, 100)}…` : tripName}
          width={400}
          height={120}
          unoptimized
          onError={() => setImgError(true)}
          style={{
            width: "100%",
            maxHeight: 120,
            objectFit: "cover",
            borderRadius: 6,
            border: "1px solid var(--line)",
          }}
        />
      ) : null}
    </Section>
  );
}
