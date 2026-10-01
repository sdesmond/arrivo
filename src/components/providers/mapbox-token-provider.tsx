"use client";

import { createContext, useContext } from "react";

// The public Mapbox token is read from the server env per request (not NEXT_PUBLIC_*, which Next
// inlines at build time), so one published image works for every host's token.
const MapboxTokenContext = createContext("");

interface MapboxTokenProviderProps {
  children: React.ReactNode;
  token: string;
}

export function MapboxTokenProvider({ children, token }: MapboxTokenProviderProps) {
  return <MapboxTokenContext.Provider value={token}>{children}</MapboxTokenContext.Provider>;
}

export function useMapboxToken(): string {
  return useContext(MapboxTokenContext);
}
