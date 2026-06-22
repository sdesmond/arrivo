## Deferred from: code review of story 1-2-local-data-mirror-and-offline-reads (2026-06-21)

- No Dexie version upgrade path — Only `OFFLINE_DB_SCHEMA_V1` exists. Future schema migration will fail with version-conflict errors.
- TripEvent fields omitted from offline round-trip — `displacedDate`, `locationLat`, `locationLng`, `linkedReservationId`, `reservationType` exist on TripEvent type but not in OfflineEvent. Verify against Drizzle schema.
