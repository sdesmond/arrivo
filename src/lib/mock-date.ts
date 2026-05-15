const KEY = "__packt_mock_date__";

export function getNow(): Date {
  if (process.env.NODE_ENV !== "development") return new Date();
  if (typeof document === "undefined") return new Date();
  const iso = getMockDateISO();
  return iso ? new Date(iso) : new Date();
}

export function setMockDate(iso: string | null): void {
  const maxAge = 365 * 24 * 60 * 60;
  if (iso) {
    document.cookie = `${KEY}=${encodeURIComponent(iso)}; path=/; max-age=${maxAge}; SameSite=Lax`;
  } else {
    document.cookie = `${KEY}=; path=/; max-age=0; SameSite=Lax`;
  }
  window.location.reload();
}

export function getMockDateISO(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)__packt_mock_date__=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}
