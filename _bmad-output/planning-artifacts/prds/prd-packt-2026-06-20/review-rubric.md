# PRD Quality Review — Offline Functionality for Packt

## Overall verdict

The PRD has a real thesis (full read/write offline parity, not a cached view) and FRs that mostly follow from it, with one of the better-than-average conflict-resolution trade-offs (entity-tiered: last-write-wins / prompt-merge / review-merge) stated as a decision rather than smoothed into a "balances everything" platitude. What's at risk is everything downstream of "done": several FRs lean on vague verbs ("adapts," "fully interactive") with no testable bound, there is zero open-items density (no Open Questions, no `[ASSUMPTION]`, no `[NOTE FOR PM]`) despite launch-grade stakes on a genuinely tricky sync/conflict design, and there's no Glossary despite several terms (sync, conflict, pin, offline) carrying precise meaning that downstream architecture work will need pinned down. For a pre-alpha product this is a defensible PRD to build from, but it currently reads more decided than it has actually earned in a few load-bearing spots.

## Decision-readiness — adequate

FR2 is the standout: it states a real trade-off by entity tier and names what's given up (packing list accepts silent overwrite risk in exchange for zero friction; docs/itinerary cost user attention to avoid loss). NFR4 ("within seconds... not on next manual refresh") and FR9 ("not a static read-only export") are written as decisions with a rejected alternative named, which is exactly what this dimension wants.

But the PRD never surfaces the genuine tension the brainstorming and decision log circle without resolving: **FR6's Smart Pin auto-downloads trips without user action** — on what connection (any/Wi-Fi-only)? At what storage cost, and does it conflict with NFR2's "no schema changes" portability promise if a user is metered or storage-constrained? The decision log (line 17) shows architecture mechanics were explicitly deferred to addendum.md, but the *product* trade-off (silent background downloads vs. user control/data cost) isn't a technical-how question — it belongs in the PRD and isn't there. There is also no Open Questions section anywhere in `prd.md` — for a PRD calibrated to "launch-grade rigor" covering sync/conflict (one of the hardest things to get right in any offline-first app), having literally zero open items reads as smoothed-over rather than resolved.

### Findings

- **high** No Open Questions section despite launch-grade stakes (whole doc) — A sync/conflict redesign this complex with zero acknowledged open items suggests questions were closed by assertion, not resolution. _Fix:_ Add at minimum the Smart Pin data-cost question and the IndexedDB-quota-exceeded question (see Done-ness/Scope findings below) as genuine Open Questions, not silently-decided FRs.
- **medium** Smart Pin's auto-download trade-off un-stated (§FR6, line 45) — "Trips within a configurable lead-time window... auto-pin without user action" never names the cost (storage, data usage on metered connections) being traded for convenience, nor whether the user can opt out per-trip vs. globally. _Fix:_ State the trade-off explicitly and confirm whether FR6 is overridable per trip.

## Substance over theater — strong

No persona section — and per the entry point decision (Vision+Features, single-role traveler) this is the right call, not an omission to flag. The Vision (lines 12–23) is specific to Packt's actual current behavior ("loads nothing beyond whatever the browser happened to cache") rather than a swappable boilerplate "we will delight users" statement. NFRs have real, falsifiable thresholds instead of adjectives: NFR3 "never block the UI thread" and NFR4 "within seconds of connectivity returning" are testable, which is the opposite of NFR theater. FR10/NFR2's storage-swap requirement is concrete and specific to this product's self-host ambitions, not a generic "must be extensible" line. No findings — this dimension holds up.

## Strategic coherence — strong

Thesis is explicit and singular: offline is "a full write surface, not a cached view" (line 19), and every FR traces back to it — FR9 restates it as a constraint, FR1/FR3/FR4/FR8 build the sync mechanics it requires, FR5/FR6/FR11/FR12 build the lifecycle around what's available offline. Success Metrics are paired with counter-metrics that genuinely guard against gaming the thesis (e.g., "% of pinned-trip actions that work fully offline" countered by crash/error rate, so feature coverage can't be claimed at the cost of stability) rather than vanity/activity metrics like DAU. MVP scope kind reads as "experience" (parity of feel, not a new capability surface) and the scope logic — sync, then UX control, then storage/lifecycle — matches that. No findings.

## Done-ness clarity — thin

This is where the PRD is weakest, and it's the dimension downstream story work leans on hardest.

- **FR9** ("Offline is a fully interactive degraded mode — browsing, reordering, editing all work — not a static read-only export") is a restatement of intent already covered by FR1/FR5/FR7, not a new testable consequence. As written it has no acceptance condition of its own.
- **FR4** ("Sync behavior adapts to what's waiting: push silently when server has no conflicting changes, prompt for review when it does") is actually well-specified *only because the addendum fills it in* (line 20: compare `last_synced_at` vs `updated_at`). The PRD body alone gives an engineer no way to verify "adapts" — the testable mechanism lives in a document the PRD explicitly says doesn't belong to the spec (addendum.md line 3: "Technical-how content... belongs in architecture/solution design, not the PRD body"). That's a real tension: the addendum makes FR4 testable, but FR4 standing alone in the PRD is not.
- **NFR3** ("Local storage operations... never block the UI thread") has no bound on what counts as compliant — frame budget, perceptible lag threshold, or test methodology. "Never block" is binary and good, but lacks a verification method (e.g., is this enforced via async/Web Worker requirement, profiled threshold, or simply asserted?).
- **FR2**'s "prompt-merge" and "review-merge" tiers are distinguished by name but not by what UI/interaction difference makes them different tiers rather than the same flow with different copy — addendum line 35–38 only disambiguates attribution-copy, not the merge UX itself. An engineer can't yet tell if itinerary prompt-merge and document review-merge are different screens or the same screen with different framing.

### Findings

- **high** FR9 has no independent testable consequence (line 48) — it restates FR1/FR5/FR7's commitments without adding a verification condition. _Fix:_ Either fold FR9's claim into the other FRs' acceptance criteria or give it its own: e.g., "100% of read/write actions available online are available offline, enumerated as: [list]."
- **medium** FR4's only testable mechanism lives in addendum.md, not the PRD (prd.md line 40 vs. addendum.md line 20) — by the addendum's own framing this is architecture-layer detail, but that leaves FR4 itself untestable from the PRD alone. _Fix:_ Either promote the `last_synced_at`/`updated_at` comparison rule into the PRD as the FR's acceptance criterion (it's a product-visible behavior, not internal architecture) or add an explicit testable condition to FR4 that doesn't require the addendum.
- **low** NFR3 lacks a verification bound (line 60) — "never block the UI thread" needs either a measurable threshold or a stated enforcement mechanism to be checkable. _Fix:_ Add a frame-budget or perceptible-lag number, or state the enforcement approach (e.g., "all storage I/O runs off main thread via Web Worker/async").
- **low** FR2's prompt-merge vs. review-merge distinction underspecified (line 38) — both are described as "user reviews," differing only in whether discard is possible; unclear if these are different screens. _Fix:_ One sentence distinguishing the two interaction flows, or confirm they're the same UI with different copy/options.

## Scope honesty — thin

The Out of Scope section (lines 69–73) does real work — native/mobile, true multi-collaborator UI, and third-party-API-while-offline are each named with a one-line reason, and the third item shows visible correction ("generalized beyond map lookup per user correction" per decision log line 22), which is a good sign of genuine scoping rather than rubber-stamping.

But there are zero `[ASSUMPTION]` tags and zero `[NOTE FOR PM]` callouts anywhere in the PRD body, despite the decision log itself recording several inference points that never got tagged inline: the 7-day default grace period (addendum.md line 33) is asserted as a default with no PRD-visible flag that it's a placeholder pending product input; IndexedDB storage-quota-exceeded behavior is never addressed at all (not in PRD, not in addendum, not in Out of Scope) despite being one of the most likely failure modes of a "relational mirror in IndexedDB" approach — this is a silent omission, not a flagged one. For a PRD explicitly calibrated to "launch-grade rigor," an open-items density of zero is itself a finding: either the Discovery session genuinely resolved everything (unlikely given the addendum's existence as a release valve for deferred technical decisions) or omissions were folded into FRs/addendum without being marked as decisions made on the user's behalf.

### Findings

- **high** Storage-quota-exceeded behavior never addressed (whole doc) — what happens when a device's available storage can't fit a pinned trip, or runs out mid-sync, is not in Goals, FRs, NFRs, or Out of Scope. _Fix:_ Add an FR/NFR for quota-exceeded behavior (graceful failure + user notification at minimum) or an explicit `[NON-GOAL for MVP]` if intentionally deferred.
- **medium** Zero `[ASSUMPTION]` tags despite inferred defaults (e.g. addendum.md line 33, "Default grace period: 7 days, configurable") — the 7-day default is stated as settled fact with no flag that it's an unconfirmed placeholder, even though nothing in the decision log shows the user confirming that specific number. _Fix:_ Tag inferred numeric defaults as `[ASSUMPTION: 7-day default unconfirmed, configurable]` and add to an Assumptions Index, or confirm the log shows explicit user sign-off on the number.

## Downstream usability — thin

No Glossary section exists. The PRD uses several terms that carry precise, non-obvious meaning — "pin" / "pinning" (FR5, FR6, FR12) is a defined offline-availability mechanism, not generic UI language; "sync" spans both the background reconnect-push (FR1) and the user-facing review flow (FR8) without ever being decomposed into those two distinct meanings in one place. For a PRD whose addendum is explicitly designed to feed architecture work next (addendum.md line 3: "belongs in architecture/solution design"), the absence of a glossary anchoring "conflict," "sync," "pin," and "tier" in one place means downstream architecture/story work has to infer definitions by reading FRs in sequence rather than extracting them.

FR/NFR IDs are clean — FR1–FR12 and NFR1–NFR4 are contiguous, unique, with no gaps or duplicates, and every addendum cross-reference ("informs FR1–FR4, FR7, FR9" etc.) resolves to a real FR. No UJs exist, which is addressed under Shape fit rather than penalized twice here.

### Findings

- **medium** No Glossary section (whole doc) — "pin," "sync," "conflict," "tier" each carry specific meaning used across multiple FRs/addendum sections without a single definitional anchor. _Fix:_ Add a short Glossary (4–6 terms) before Features; this is cheap now and expensive to retrofit once architecture/stories start quoting these terms independently.

## Shape fit — adequate

The decision log (line 8) explicitly chose Vision+Features entry point with no standalone persona/UJ section because Packt is single-role (traveler) and brainstorming was already organized around feature clusters. That's a defensible shape call for a single-operator-role consumer product where the "job" doesn't vary by user type.

The gap: the decision log also promises "Key UX moments (losing connectivity mid-trip, sync conflicts) will be captured inline rather than as a standalone persona section" (line 8) — but searching the PRD body for that framing turns up nothing. The FRs are pure capability statements (FR1: "System syncs offline writes...") with no inline narrative moment ("a traveler mid-trip loses signal and needs to keep reordering events without noticing"). The promised compromise — UJ rigor traded for inline-captured moments — wasn't actually delivered; the PRD just has no UJs and no inline moments either. For a consumer product the rubric flags under-formalization as a real risk, and this is a case of it: the offline scenario (e.g., what a traveler sees the instant connectivity drops mid-edit) is the single highest-value moment for this PRD's domain and it's never narrated anywhere, only implied by FR7's "pending-sync badge."

### Findings

- **medium** Promised inline UX moments never materialized (decision log line 8 vs. PRD body) — the connectivity-loss-mid-trip moment that justified skipping a UJ section doesn't appear anywhere in `prd.md`; FRs are capability-stated, not moment-narrated. _Fix:_ Add 2–3 sentences inline (e.g., under Goals or as a callout near FR7/FR8) narrating the connectivity-loss and conflict-surfacing moments concretely, to make good on the entry-point trade-off the decision log claims was made.

## Mechanical notes

- **Glossary:** absent (see Downstream usability finding above) — no drift to report since there's no glossary to drift from, but terms aren't centrally defined either.
- **ID continuity:** FR1–FR12 and NFR1–NFR4 are contiguous, unique, no gaps/dupes. Addendum cross-references ("informs FR1–FR4, FR7, FR9," "informs FR10," "informs FR1, FR3, FR4, FR8," "informs FR6," "informs FR11," "informs FR2, FR8") all resolve to real FRs in prd.md.
- **Assumptions Index roundtrip:** N/A — zero inline `[ASSUMPTION]` tags exist, so there is no index to check for roundtrip. This absence itself is flagged under Scope honesty.
- **UJ protagonist naming:** N/A — no UJs in this PRD by design (Vision+Features entry point, single-role product). See Shape fit for whether that omission was fully made good on.
- **Required sections for stakes/type:** Vision, Goals, Features (FRs), NFRs, Success Metrics, Out of Scope are all present and match a Vision+Features-entry, single-role, launch-grade-rigor PRD. Missing relative to stated stakes: Open Questions section (absent entirely — see Decision-readiness), Glossary (absent — see Downstream usability).
