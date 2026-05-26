"use client";

import { useEffect } from "react";
import { useRef } from "react";

interface TripConfettiProps {
  tripId: string;
}

export function TripConfetti({ tripId }: TripConfettiProps): null {
  const tripIdRef = useRef(tripId);

  useEffect(() => {
    async function fireConfetti(): Promise<void> {
      try {
        const confetti = (await import("canvas-confetti")).default;
        confetti({
          particleCount: 150,
          spread: 80,
          origin: { y: 0.55 },
        });
      } catch {
        // Dynamic import failed — confetti silently skipped
      }

      window.history.replaceState(null, "", `/trips/${tripIdRef.current}`);
    }

    void fireConfetti();
  }, []);

  return null;
}
