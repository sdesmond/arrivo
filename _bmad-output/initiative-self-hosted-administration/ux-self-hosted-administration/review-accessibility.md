# Accessibility Review — Arrivo administration

## Overall verdict

Overall: **adequate**, with authentication-assistance detail **thin**. Accessibility floor is well defined: keyboard orientation follows responsive layout, destructive dialogs start on Cancel, targets have a 44px floor, status/errors are associated and announced, and private data is excluded from hidden accessibility text. Two contract gaps remain: focus handoff when creation form becomes its one-time link result, and explicit accessible mechanisms for replacement-MFA enrollment in new recovery flow.

Findings: **0 critical, 0 high, 2 medium, 0 low**. This reviews the UX contract, not rendered implementation conformance. No production code or spine was changed.

## Keyboard, targets, and dialog controls — strong

EXPERIENCE.md:65–70, 124–127, 131–138 specify meaningful action labels, matching tab orientation, Home/End, reading order, destructive-action focus, containment/restoration, pending handling, and minimum target size. DESIGN.md:116, 125 explicitly override undersized inherited controls; existing shared button/input dimensions are therefore not treated as permission to implement smaller targets. No finding.

## Dynamic focus and status — adequate

Success, errors, copy feedback, and restored focus after closing dialogs are covered. Replacing an open form with a different result view needs one additional focus rule.

### A11Y-01 — Medium — One-time link result has no focus handoff

- **Location:** EXPERIENCE.md:39, 70–72, 127; DESIGN.md:128.
- **Trigger:** Invitation/reset creation succeeds and replaces form within existing dialog. Focused submit control can disappear while dialog remains open.
- **Consequence:** Keyboard or screen-reader user can lose useful focus or remain unaware of result location, despite a completion announcement. This matters because full URL can only be copied from current result and later retrieval is intentionally unavailable.
- **Fix:** On form-to-result transition, move focus to result heading or another stable result landmark inside dialog; identify recipient and expiry, then order URL and Copy link logically. Keep focus on Copy link after copying and preserve manual selection fallback. Existing close/restore behavior still applies when dialog closes.
- **Scope:** Missing transition contract, not evidence that current dialog primitive fails.

## Accessible authentication and MFA recovery — thin

New CLI recovery requires replacement-MFA verification. Generic labels and WCAG target are present, but contract does not expressly retain assistive mechanisms already available in existing enrollment UI.

### A11Y-02 — Medium — Accessible MFA setup and assisted entry are implicit

- **Location:** EXPERIENCE.md:77, 87, 134–137, 190–191; DESIGN.md:134.
- **Trigger:** Builder creates browser recovery flow from new `recovery-form` contract, which requires replacement MFA but does not bind it to existing enrollment assistance.
- **Consequence:** A QR-only setup or manually transcribed verification-code flow could omit support needed by someone using one device, assistive technology, or a password manager. This is a contract omission; no claim is made that existing enrollment is QR-only.
- **Evidence:** Existing `src/app/(app)/profile/mfa-enrollment.tsx:115` provides selectable manual setup key, Copy key, and clipboard fallback; `:134` provides single code field with `inputMode="numeric"` and `autoComplete="one-time-code"`. These are useful inherited behaviors to make explicit for new recovery surface.
- **Fix:** Require QR plus selectable manual setup key with accessible Copy/failure fallback; preserve password-manager filling and paste in password/code inputs; accept whole verification-code paste with one-time-code autofill. Keep verification failure associated with code input without discarding setup context. This reuses existing enrollment support rather than adding an alternative recovery authority.
- **Standards context:** Authentication assistance includes password-manager entry and copy/paste, and applies across MFA and account-recovery steps. [W3C: Accessible Authentication (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication-minimum.html).

## Responsive reflow, mobile keyboard, and obstruction — adequate

EXPERIENCE.md:133–138, 215–217 and DESIGN.md:102, 106, 127 require semantic stacked content, 320 CSS px reflow, text enlargement, reachable dialog actions, and visible active fields above virtual keyboard. Full-width administration retains padding; forms need not stretch. Existing app bottom navigation remains unchanged; inherited app layout reserves bottom content space. No finding from unrendered layouts.

Visual verification remains pending: exercise long identities, full invitation URLs, 200% text, keyboard-open sheets, safe areas, and existing fixed bottom navigation together. Those checks confirm stated requirements rather than introduce new design requirements.

## Theme contrast and text legibility — adequate

CSS aliases are intentional UI-system inheritance. DESIGN.md:92–100 correctly requires contrast checks in both themes and explicitly refuses to assume inherited primary pairing or muted labels pass. Stronger label token, readable wrapping, font scaling, and distinct selected/focus states are specified.

Static calculations using current `src/app/globals.css` hex values and standard relative-luminance contrast formula:

- Light primary: white `--primary-foreground` on `--primary` = **4.18:1**.
- Dark primary: `--primary-foreground` on `--primary` = **7.30:1**.
- Secondary text on canvas: light **8.91:1**, dark **9.92:1**.
- Focus token on canvas light **4.18:1**; on selected dark surface **6.33:1**.

Light primary is below draft's 4.5:1 normal-text target. This is a measured inherited limitation already acknowledged by DESIGN.md:96, whose accessible-variant remediation remains an implementation acceptance requirement. It is not counted again as an unacknowledged draft defect. These calculations do not establish contrast of every state, opacity, overlay, destructive action, or control boundary; rendered checks are still required.

## Timing and recoverability — adequate

Expiry is disclosed, unavailable links have an authorized reissue path, unfinished recovery leaves account unchanged, result does not auto-dismiss, and ambiguous mutations reconcile before retry. No finding demanding removal or extension of confirmed security-link expiry: W3C permits essential security time limits; applicability depends on mechanism implemented. [W3C: Timing Adjustable](https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html).

## Review scope and limits

Reviewed both spines, canonical decision log, source brainstorming, current theme tokens, shared tabs/dialog/input primitives, MFA enrollment, mobile bottom navigation, and app layout. No live browser, assistive-technology, or rendered contrast audit was performed. Existing unrelated runtime issues were excluded. Exact token, CLI, and storage mechanisms remain architecture concerns within confirmed UX constraints.
