# PRD Quality Review - Packt Location-Aware Itinerary

## Overall verdict

The PRD has a strong product thesis: location is an enrichment layer, not a requirement. It is usable for downstream UX and architecture, but launch decision-readiness is weakened by bundling account-level transit preferences, smart inference, distance exceptions, and Per-Hop Overrides into MVP without deciding which are needed for first release.

## Decision-readiness - thin

The PRD names the central trade-off well: provide useful location features without forcing location entry. It also rejects silent title geocoding, static Address popovers, and accommodation search clearly.

The main gap is MVP shape. §9.1 includes Trip Transit Default and Day Route Strip, while §4.3 includes account preference, smart inference, distance-threshold exceptions, and Per-Hop Overrides. §13 then leaves most transit decisions open. That makes the next architecture step unclear: the team could either design a large preference system or a smaller trip-level mode selector and still claim compliance.

### Findings

- **[high] Transit Mode MVP is not decision-ready** (§4.3, §9.1, §13) - FR-7, FR-8, and FR-9 define substantial behavior while core choices remain open. _Fix:_ split Transit Mode into MVP-required and post-MVP layers, keeping only what Day Route Strip and Schedule Conflict need for launch.

## Substance over theater - strong

The PRD is grounded in concrete surfaces and source discoveries: Now Card, Address surfaces, Day Route Strip, Map Tab, and missing-location behavior. User journeys drive real requirements rather than decorating the doc.

### Findings

None.

## Strategic coherence - adequate

The thesis is coherent and repeated through requirements: location features should appear only where data exists. The build order largely supports this, with the Now Card first and Map Tab later.

### Findings

- **[medium] Address Pill priority differs from source sequence without enough decision framing** (§10) - The PRD moves Address Pill earlier than brainstorming source. The note says why, but not whether this is a product decision or draft recommendation. _Fix:_ state it as a proposed sequencing decision requiring PM confirmation, or restore source order.

## Done-ness clarity - adequate

Most FRs have testable consequences. Some NFRs remain directional rather than bounded, but enough detail exists for architecture to refine.

### Findings

- **[medium] Performance and cost NFRs lack launch thresholds** (§5) - "should not block" and "bounded" are directionally useful but not measurable. _Fix:_ add explicit architecture acceptance targets or mark them as architecture-owned open questions.

## Scope honesty - adequate

Non-goals are clear, rejected ideas are captured, and assumptions are indexed. Open questions are visible rather than hidden.

### Findings

- **[medium] Open questions include phase-blockers** (§13) - Questions 1, 2, 4, 6, and 7 can materially change architecture and epic shape. _Fix:_ label blockers vs architecture-owned details.

## Downstream usability - strong

Glossary exists, FR IDs are contiguous, UJs are named, and cross-references mostly resolve. Requirements are grouped into coherent feature areas.

### Findings

None.

## Shape fit - adequate

Journey-led shape fits a consumer itinerary feature with meaningful UX and day-of behavior. Launch-level detail is appropriate, but the doc should cut or stage the Transit Mode system before story creation.

### Findings

None beyond Transit Mode MVP finding.

## Mechanical notes

- FR IDs are contiguous.
- UJ IDs are contiguous and named.
- Assumptions Index entries appear inline.
- Glossary uses `Event`, `Reservation`, and `Address` consistently enough for draft stage.

## Resolution Notes

- High finding resolved in PRD: §4.3 now defines Trip Transit Default as MVP and moves account preference, distance exception, and Per-Hop Override to post-MVP extension unless PM pulls them forward.
- Medium sequencing finding resolved in PRD: §10 now frames Address Pill order as proposed PM-confirmed sequencing.
- Medium NFR finding resolved in PRD: §5 now requires architecture-owned latency and request-budget targets.
- Medium open-question finding resolved in PRD: §13 separates PM confirmation, architecture-owned questions, and post-MVP product questions.
