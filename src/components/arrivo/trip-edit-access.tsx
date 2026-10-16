"use client";

import { createContext, useContext } from "react";
import type { ReactElement, ReactNode } from "react";

// Defaults to editable so components rendered outside a trip page (and their tests) keep their controls.
const TripEditAccessContext = createContext(true);

interface TripEditAccessProviderProps {
  canEdit: boolean;
  children: ReactNode;
}

/** Tells the itinerary below whether the current member may edit it; viewers get a read-only view. */
export function TripEditAccessProvider({ canEdit, children }: TripEditAccessProviderProps): ReactElement {
  return <TripEditAccessContext.Provider value={canEdit}>{children}</TripEditAccessContext.Provider>;
}

export function useCanEditTrip(): boolean {
  return useContext(TripEditAccessContext);
}
