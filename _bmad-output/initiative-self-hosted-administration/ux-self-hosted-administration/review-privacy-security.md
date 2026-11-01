# Privacy and Security UX Review — Arrivo

Reviewed DESIGN.md, EXPERIENCE.md, canonical coaching decisions in .memlog.md, brainstorming intent, and source reconciliation. Existing signup and MFA flows were inspected only to verify inherited behavior. No spines or implementation files changed.

## Overall verdict

Access, private-trip handling, automatic ownership succession, and last-admin protection are well defined. Link expiry, same-purpose replacement, explicit sign-out, and completed-recovery session revocation are also clear. Three lifecycle/identity outcomes need clarification before the contract can guarantee that account recovery retires earlier access paths and invitation acceptance preserves admin-selected identity.

These findings do not challenge confirmed policies. Exact token storage, CLI syntax, database locking, audit aggregation, and equal-membership-time tie mechanisms remain architecture concerns.

## Category verdicts

- Admin authority and private-trip boundaries — **strong**.
- Deletion, ownership succession, and last-admin protection — **strong**.
- Invitation identity and lifecycle — **adequate**.
- Reset and emergency-recovery completion — **thin**.
- Audit privacy, grouping, and retention — **strong**.

## Findings

### PS-1 — High — Outstanding links of another purpose survive credential recovery unless explicitly retired

**Location:** EXPERIENCE.md:86–89, Link Lifecycles; EXPERIENCE.md:187–193, Account recovery.

Replacement invalidation is defined separately for ordinary reset links and CLI recovery links. Successful completion retires sessions and trusted devices, but the contract does not say whether other outstanding credential-reset/recovery links for that account become invalid. This is a missing security outcome, rather than a choice of token mechanism.

**Trigger and consequence:** Rowan generates a CLI recovery link, but it is lost or exposed. Maya subsequently completes an ordinary password reset and signs out every session. The earlier CLI link could still authorize password and MFA replacement until its original expiry. Conversely, an ordinary reset link issued before CLI recovery could remain able to change password and sign the recovered owner out again. A user cannot tell whether completed recovery has ended earlier recovery authority.

**Focused fix — proposal requiring user decision:** Define whether successful ordinary reset or CLI recovery invalidates **all** outstanding reset and CLI recovery authorizations for that account, regardless of purpose, including an already-open but unfinished flow. Recommended contract wording should make this a completion outcome; architecture chooses enforcement. This adds cross-purpose completion invalidation without changing the confirmed same-purpose replacement rule.

### PS-2 — Medium — Replacement MFA does not explicitly retire existing MFA recovery codes

**Location:** EXPERIENCE.md:77, recovery-form; EXPERIENCE.md:87–89, CLI recovery completion; EXPERIENCE.md:190–193, Account recovery. Inherited behavior: `src/app/(app)/profile/security-actions.ts:72–85` replaces recovery codes during confirmed enrollment; `src/components/arrivo/mfa-code-form.tsx:30–68` allows a recovery code as an alternate factor.

CLI recovery explicitly replaces password and MFA and revokes sessions/trusted devices, but it does not name the fate of existing alternate MFA recovery codes or the delivery of replacement codes. Existing Arrivo already supports these codes; this is not a request to add the separately deferred emergency-recovery-code feature.

**Trigger and consequence:** An account already has saved MFA recovery codes when CLI recovery confirms a replacement authenticator. A downstream implementation can replace the authenticator secret while leaving older recovery codes usable, or generate replacement codes without a specified chance for the recovering admin to save them. That leaves the meaning of “replacement MFA” incomplete.

**Focused fix:** Explicitly inherit existing confirmed-enrollment behavior for alternate factors: retire previous MFA recovery codes at successful CLI recovery, issue replacement codes through the existing one-time recovery-code presentation, and define its handoff before fresh sign-in. Preserve the approved all-or-nothing boundary for abandoned recovery. This clarifies existing security-flow inheritance; do not silently introduce a new CLI recovery method.

### PS-3 — Medium — Invitation signup fixes username but does not explicitly bind email in the form contract

**Location:** EXPERIENCE.md:76, registration-form; EXPERIENCE.md:85, invitation completion; EXPERIENCE.md:153–155, Invitations. Existing signup surface: `src/components/arrivo/auth-forms.tsx:155–165` has an editable email field.

Admin supplies email and username, but only username is expressly read-only during signup. Invitation completion says to create the invited account with the supplied username without an equally explicit statement that submitted identity must retain the invitation email. Generic auth-form reuse can therefore diverge from the intended recipient binding.

**Trigger and consequence:** Alex opens an invitation for one email address and changes the inherited email input to another before submitting. The contract does not tell the builder whether to reject that change, hide the input, or allow it. Allowing it would change the identity selected by the admin and weaken the meaning of email-specific replacement and existing-account checks.

**Focused fix:** State that acceptance creates the account for the invitation's email, display that email read-only or as fixed context, and reject an attempted submitted replacement. Username remains fixed during signup and editable later in Profile as already confirmed. This clarifies binding to the approved recipient rather than adding a separate proof-of-email requirement.

## Checked without findings

- Private-trip audit ceiling applies to ordinary rows, Overview, hidden/accessibility text, and errors; no titles, changed values, collaborators, or unauthorized links.
- Admin deletion follows role priority before trip-membership duration, preserves self-service choices, and does not reveal successor details. Changed outcomes require fresh review; last-admin protection also covers self-service deletion.
- Invitations are single-use, expire after 24 hours, and are invalid after rescinding, replacement, acceptance, or expiry. Wrong-account acceptance requires explicit sign-out and revalidation.
- Ordinary reset preserves existing MFA. CLI recovery requires trusted operator authority, confirmed replacement MFA, all-or-nothing credential replacement, and no unauthenticated web bypass.
- Issuance and completion events exclude URLs/secrets; routine trip summaries do not absorb security/admin entries. Retention is bounded, configurable, confirmed before shortening, and distinct from background-cleanup completion.

## Counts

Critical: 0. High: 1. Medium: 2. Low: 0.
