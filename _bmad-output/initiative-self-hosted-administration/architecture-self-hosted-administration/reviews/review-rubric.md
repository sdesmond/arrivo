# Architecture rubric review

Reviewed: 2026-10-24

Target: `../architecture-self-hosted-administration.md`

Verdict: **PASS**. No new critical, high, or medium findings. Transport policy was initially tracked as open; user has since confirmed trusted LAN HTTP compatibility, and current convention incorporates it.

## Checklist

| Check | Result | Evidence |
| --- | --- | --- |
| Real divergence points fixed | Pass | AD-1–7 establish current authority, durable bootstrap state, setup isolation, purpose-specific authorizations, credential replacement, CLI trust, and deterministic deletion succession. AD-8–11 settle logging independence, identity snapshots, minimal storage, aggregation, and tolerant retention. |
| Enforceable rules | Pass | Rules name DB serialization boundaries, conditional authorization consumption, session generation, shared ownership/membership locks, event-time snapshots, aggregation interval semantics, and cleanup eligibility. They constrain independent implementations rather than merely expressing preferences. |
| Deferred decisions safe | Pass | File/table names and concrete transport/response shapes must be settled once by owning feature specs before sharing. Deferred algorithms remain behind named owners and fixed semantic contracts; out-of-scope platform capabilities are explicit. |
| Brownfield compatibility | Pass | Existing web DB singleton, account IDs, username normalization, trip invitations, session-version revocation, storage adapter, route-adjacent actions, migration entrypoint, and isolated E2E environment are ratified. Required changes to old immediate MFA-reset tooling and newly shared lock boundaries are explicit rather than silently assumed to exist. |
| Operational envelope covered | Pass | AD-6/12 cover CLI packaging and environment limitations, existing deployment topology, persistent storage, migration lifecycle, measurement boundaries, and environment isolation. AD-11 states no idle scheduler guarantee; URL convention retains explicit trusted LAN HTTP support. |
| Data ownership and privacy | Pass | Account lifecycle, instance state, trip domain, and Activity have separate ownership. Historical snapshots survive account/trip deletion without exposing private trip content. Admin authority is distinct from sharing permission. |
| Scope and altitude | Pass | Initiative scope coordinates account lifecycle, administration, recovery, Activity and Overview. SQL/file details are deferred to feature work; no implementation-ready task sequence is introduced. Twelve decisions are justified by shared cross-feature behavior. |
| Inherited constraints | Pass | UX package remains binding except clearly recorded architecture coaching overrides. Explicit wrong-account continuation, retained expired setup accounts, and completed-account-only reset now appear in AD-3. No parent architecture spine is claimed or silently overridden. |
| Named technology evidence | Pass on rubric scope | Baseline versions are identified as existing lockfile/container reality, not upgrade targets. Primary documentation links support introduced transaction, callback, token, and CLI assumptions; specialized source/version review remains separate configured lens. |

## Residual limits

- This pass judges architecture contract, not implementation correctness. Shared locks and authorization checks still require adoption by existing call paths, as AD-5/7 and Deferred testing explicitly require.
- Best-effort delivery admits missing Activity records; such gaps are a user-approved property, not a rubric failure.
- Test inventory is intentionally downstream. No runtime code changed in this architecture run.

No changes requested by this lens.
