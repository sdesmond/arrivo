"use client";

import { createContext, useContext } from "react";

export const MockDateContext = createContext<string | null>(null);

interface MockDateProviderProps {
  children: React.ReactNode;
  initialISO: string | null;
}

export function MockDateProvider({ children, initialISO }: MockDateProviderProps) {
  return <MockDateContext.Provider value={initialISO}>{children}</MockDateContext.Provider>;
}

export function useNow(): Date {
  const iso = useContext(MockDateContext);
  if (!iso) return new Date();
  return new Date(iso);
}
