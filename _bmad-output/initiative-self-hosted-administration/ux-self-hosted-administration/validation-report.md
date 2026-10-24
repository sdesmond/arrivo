# Validation Report — Arrivo administration

- **DESIGN.md:** [DESIGN.md](DESIGN.md)
- **EXPERIENCE.md:** [EXPERIENCE.md](EXPERIENCE.md)
- **Run at:** 2026-10-23T22:32:25Z
- **Findings:** 0 critical, 1 high, 7 medium, 0 low

## Overall verdict

The pair captures confirmed coaching decisions accurately and provides a usable contract for approved administration surfaces. Contract review found three bounded handoff gaps: failed-login presentation, still-open edit-batch behavior, and a committed accessible primary-action pairing. Exact CLI commands, token mechanisms, audit storage, and equal-membership-time tie handling remain architecture concerns.

Privacy/security review adds one high finding about outstanding cross-purpose recovery authorizations, plus clarification of MFA recovery-code retirement and invitation email binding. Accessibility review adds focus handoff and assisted MFA-entry requirements. Totals: 0 critical, 1 high, 7 medium, 0 low. No spines or production files were changed during validation.

## Category verdicts

- Flow coverage — **adequate**. All seven original scope headings and subsequent decisions map to eight named journeys. Failed-login presentation needs explicit action/fallback actor and destination filter.
- Token completeness — **adequate**. YAML, source paths, token references, and inherited aliases resolve. UI-system inheritance permits CSS aliases. Accessible primary-action pairing remains a finalization task.
- Component coverage — **strong**. All thirteen named components have matching visual and behavioral contracts.
- State coverage — **adequate**. All fourteen IA surfaces have state coverage. Active edit-batch visibility, refresh/order, and date-filter semantics need definition.
- Visual reference coverage — **adequate**. No orphan artifacts or broken visual links. All surfaces are explicitly spine-only; coverage confirmation and settings-entry placement remain acknowledged finalization work.
- Bloat & overspecification — **strong**. Lifecycle and Activity rules are centralized; journeys and state tables serve distinct lookup needs. Architecture mechanisms remain appropriately deferred.
- Inheritance discipline — **strong**. Source paths and token references resolve. Canonical coaching log explicitly supplies subsequent overrides; domain and component names stay consistent.
- Shape fit — **strong**. Canonical DESIGN order and required EXPERIENCE sections are present, with justified responsive and product-specific sections. Draft status is appropriate.

## Additional reviewer verdicts

- **Accessibility review:** Adequate overall; authentication assistance is thin. Strong keyboard/target foundation, with two missing transition/assistance contracts. Static inherited light primary contrast is 4.18:1; draft already calls for remediation. Review is of contract, not rendered conformance.
- **Privacy and security review:** Authority/private-trip boundaries, deletion, and audit are strong; invitations adequate; recovery completion thin. Earlier recovery authority can remain live unless cross-purpose invalidation is explicitly defined. Exact token enforcement is architecture-owned; outcome policy needs resolution.

## Findings by severity

### Critical (0)

None.

### High (1)

**PS-1 [Privacy/security] — Outstanding links of another purpose may survive recovery**

Location: EXPERIENCE.md — Link Lifecycles; Flow 6.

Replacement invalidation is defined by link purpose. Completion revokes sessions and trusted devices, but does not explicitly retire outstanding reset and CLI recovery links of another purpose. An earlier CLI link could still replace password and MFA after ordinary reset, or an earlier reset link could change password after CLI recovery.

Fix: User decision: define whether completing either flow invalidates all outstanding reset/recovery authorizations for that account, including already-open unfinished flows. Architecture chooses enforcement.

Source: [review-privacy-security.md](review-privacy-security.md).

### Medium (7)

**R-1 [Contract] — Failed-login destination is underspecified**

Location: EXPERIENCE.md — Activity Rules; Flows 7–8.

Overview promises failed logins and links to Activity, but Activity names login/logout without an explicit failed-sign-in action or safe actor label for unattributed attempts.

Fix: Name failed-sign-in events, define a safe fallback actor label, and make Overview links land on corresponding Activity action filter. Keep this within user activity, without sensitive diagnostic fields.

Source: [review-rubric.md](review-rubric.md).

**R-2 [Contract] — Accessible primary-action pairing remains unresolved**

Location: DESIGN.md — Colors; action-button.

Inherited light primary/foreground pairing measures 4.18:1, below stated 4.5:1 normal-text target. Draft acknowledges remediation, but has not committed a usable accessible variant. Accessibility reviewer treats this as known implementation-acceptance work rather than an additional finding.

Fix: Before visual finalization, name accessible primary-action variant/token pairing and verify both themes while retaining existing visual language.

Source: [review-rubric.md](review-rubric.md).

**R-3 [Contract] — Active edit batches lack visible and filtering behavior**

Location: EXPERIENCE.md — Activity Rules; Activity state.

Ten-minute sliding grouping and time range are defined, but first visibility, updates while Activity is open, ordering, and date-filter behavior for batches crossing a date boundary are not. Long editing sessions could disappear from recent history or move unpredictably between pages.

Fix: Specify when first summary appears, how end time/order refreshes, and which timestamp or interval controls date filtering. Preserve summary-only rows and ten-minute grouping; storage remains architecture-owned.

Source: [review-rubric.md](review-rubric.md).

**A11Y-01 [Accessibility] — One-time link result has no focus handoff**

Location: EXPERIENCE.md — link-result transition; share-link; Interaction Primitives.

Creation result replaces form inside existing dialog. Focused submit control can disappear, leaving keyboard or screen-reader user without useful focus near the only copyable URL.

Fix: Move focus to stable result heading/landmark, identify recipient and expiry, then order URL and Copy link logically. Keep focus on Copy link after copying; retain manual selection fallback and dialog-close focus restoration.

Source: [review-accessibility.md](review-accessibility.md).

**A11Y-02 [Accessibility] — Accessible replacement-MFA setup is implicit**

Location: EXPERIENCE.md — recovery-form; Flow 6; Accessibility Floor.

New recovery requires replacement MFA but does not expressly inherit existing selectable manual setup key, Copy key fallback, paste/autofill, and password-manager support. QR-only setup or forced transcription could exclude one-device and assistive-technology users.

Fix: Explicitly reuse QR plus selectable manual setup key, accessible copy/failure handling, whole-code paste and one-time-code autofill, password-manager filling, and associated verification errors without discarding setup context.

Source: [review-accessibility.md](review-accessibility.md).

**PS-2 [Privacy/security] — Old MFA recovery codes are not explicitly retired**

Location: EXPERIENCE.md — recovery-form; Link Lifecycles; Flow 6.

Replacing MFA does not explicitly address existing alternate MFA recovery codes or handoff of replacements. Existing Arrivo enrollment already rotates these codes; this is distinct from deferred emergency recovery-code features.

Fix: Explicitly inherit confirmed-enrollment behavior: retire previous codes at successful CLI recovery, issue replacement codes through existing one-time presentation, and define handoff before fresh sign-in. Preserve all-or-nothing recovery.

Source: [review-privacy-security.md](review-privacy-security.md).

**PS-3 [Privacy/security] — Invitation email binding is implicit in signup contract**

Location: EXPERIENCE.md — registration-form; Link Lifecycles; Flow 2.

Username is expressly fixed, but invitation email is not equally explicit. Reusing editable email from existing signup could allow acceptance under a different email, weakening admin-selected identity and email-specific replacement checks.

Fix: Display invitation email read-only or as fixed context; create account for that email and reject submitted replacement. This clarifies recipient binding without adding a separate proof-of-email requirement.

Source: [review-privacy-security.md](review-privacy-security.md).

### Low (0)

None.

## Mechanical notes and limits

- Source links, YAML, token references, inherited color aliases, thirteen-component parity, and canonical section order checked.
- All fourteen surfaces map to states; eight illustrative journeys cover approved scope.
- No live browser, assistive-technology, or rendered UI audit was performed. Static contrast measurements are limited to named current token pairings.
- No visual artifacts exist; settings-entry placement and visual-reference coverage confirmation remain pending.
- Reviewer findings are retained by lens. Primary contrast is counted once under Contract; Accessibility explicitly acknowledged the same existing limitation without duplicating it.
- Reviewer files preserve original citations/line references to reviewed drafts. Review findings are proposals/clarifications, not new approved policy.

Authentication-assistance reference: [W3C Accessible Authentication](https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication-minimum.html).

## Reviewer files

- [review-rubric.md](review-rubric.md)
- [review-accessibility.md](review-accessibility.md)
- [review-privacy-security.md](review-privacy-security.md)

[Open HTML report](validation-report.html).
