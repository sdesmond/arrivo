---
name: feedback-field-error-aria-live
description: Field component uses role="status" + aria-live="polite" for validation errors intentionally — do not flag as a11y issue
metadata:
  type: feedback
---

`form-section.tsx` `Field` renders error messages with `role="status"` and `aria-live="polite"` — this is **intentional**. The "polite" setting prevents the screen reader from announcing on every keystroke while the user is still typing.

**Why:** Announcing on `assertive` (or `role="alert"`) fires on every state change, which would interrupt the user mid-input. Polite waits for an idle moment.

**How to apply:** Do not flag `role="status"` / `aria-live="polite"` on `Field` error elements as an accessibility issue. The behavior is correct by design. Only flag if the live region role itself is absent.
