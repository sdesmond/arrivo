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

      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.delete("new");
      const nextQueryString = currentUrl.searchParams.toString();
      const nextUrl = `${currentUrl.pathname}${nextQueryString ? `?${nextQueryString}` : ""}${currentUrl.hash}`;

      window.history.replaceState(null, "", nextUrl || `/trips/${tripIdRef.current}`);
    }

    void fireConfetti();
  }, []);

  return null;
}
