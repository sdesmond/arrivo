"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useOnlineStatus } from "@/lib/offline/use-online-status";

interface OfflineContextValue {
  online: boolean;
  offline: boolean;
  conflict: boolean;
  pendingCount: number;
  retrySync: () => void;
  openConflictReview: () => void;
  pinFailure: string | null;
}

const OfflineContext = createContext<OfflineContextValue | null>(null);

interface OfflineProviderProps {
  children: ReactNode;
}

export function OfflineProvider({ children }: OfflineProviderProps) {
  const online = useOnlineStatus();

  const value: OfflineContextValue = {
    online,
    offline: !online,
    conflict: false,
    pendingCount: 0,
    retrySync: () => {},
    openConflictReview: () => {},
    pinFailure: null,
  };

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOffline(): OfflineContextValue {
  const context = useContext(OfflineContext);
  if (!context) {
    throw new Error("useOffline must be used within an OfflineProvider");
  }
  return context;
}
