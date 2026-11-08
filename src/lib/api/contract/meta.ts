/** Public `GET /api/v1/meta` body. Deliberately omits app version, user and environment data. */
export const API_META = {
  apiVersion: 1,
  capabilities: ["idempotency-key"],
} as const;
