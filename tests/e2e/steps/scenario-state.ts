let tripIdOverride: string | undefined;

export function getTripIdOverride(): string | undefined {
  return tripIdOverride;
}

export function setTripIdOverride(nextTripId: string | undefined): void {
  tripIdOverride = nextTripId;
}

export function clearTripIdOverride(): void {
  tripIdOverride = undefined;
}
