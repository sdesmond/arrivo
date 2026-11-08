# Services own domain writes; pages keep direct reads

Date: 2026-11-07. Status: accepted.

Accepted. Web mutations migrate incrementally to versioned `/api/v1` routes. Services accept `Actor { userId }` and unknown input, validate before writing, authorize with typed trip access, own their transactions and locks, and return canonical mapped domain types. Services never inspect cookies, headers, or navigation. Route adapters translate HTTP into service calls; server pages keep reading their data source directly, avoiding an HTTP round trip.

The checked-state pilot locks the trip, rechecks item ancestry and editor access inside the transaction, then commits before activity, live sync and path revalidation. Existing checklist lifecycle actions remain until their migration story. This separates transport from business rules without rewriting page reads.

Source: [API direction and phase 0 decisions](../plans/mobile-api.md).
