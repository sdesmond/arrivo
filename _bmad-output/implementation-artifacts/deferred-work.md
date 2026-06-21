## Deferred from: code review of 1-1-switch-to-client-generated-entity-ids (2026-06-21)

- `crypto.randomUUID()` in `startTransition` may fail in insecure HTTP context — pre-existing concern not introduced by this change.
- `handleAddDay`'s `crypto.randomUUID()` inside transition callback may regenerate if React re-executes the transition — generic React concern.
- `addDocument` validation path wastes generated UUID on error — harmless, caller regenerates on retry.
- Unrelated tsx/esbuild dependency bump in `package.json` — housekeeping, pre-existing.
