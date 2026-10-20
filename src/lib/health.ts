export interface HealthResult {
  status: 200 | 503;
  body: { status: "ok" | "error" };
}

// Liveness for the container HEALTHCHECK and reverse proxies: healthy means the app can reach its database.
export async function checkHealth(ping: () => Promise<unknown>): Promise<HealthResult> {
  try {
    await ping();
    return { status: 200, body: { status: "ok" } };
  } catch {
    return { status: 503, body: { status: "error" } };
  }
}
