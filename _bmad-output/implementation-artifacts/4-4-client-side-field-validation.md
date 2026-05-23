---
story_id: "4.4"
story_key: "4-4-client-side-field-validation"
epic: 4
story: 4
title: "Profile Field Validation — Client-Side Inline Errors and Server-Side Guards"
status: "done"
created: "2026-05-22"
---

# Story 4.4 — Profile Field Validation: Client-Side Inline Errors and Server-Side Guards

## Story

As a **user editing my profile**,
I want invalid input caught inline before I hit Save and rejected server-side if it slips through,
so that I get immediate feedback and the database never receives out-of-range values.

## Acceptance Criteria

**AC1 — `Field` supports an inline error description:**
Given `Field` receives a non-empty `error` string and an `htmlFor` prop,
When the field is rendered,
Then a `<p role="alert">` with the error text appears below the input, styled in `var(--destructive)`, with `id="${htmlFor}-error"` so inputs can reference it via `aria-describedby`.
If `htmlFor` is absent, the error is not rendered.

**AC2 — `companion-row.tsx` validates name length (client-side):**
Given the user types a name longer than 50 characters in the companion Name field,
When the length exceeds 50,
Then `Field error="Companion name must be 50 characters or fewer."` appears inline, the Input receives `aria-invalid="true"`, and Save is disabled.

**AC3 — `companion-row.tsx` validates age range (client-side):**
Given the user types a non-empty age value that is non-numeric, negative, or greater than 120,
When the value is invalid,
Then `Field error="Age must be between 0 and 120."` appears inline and the Input receives `aria-invalid="true"`.
The error clears when the field is cleared or corrected.

**AC4 — `companion-row.tsx` validates passport/nationality/KTN length (client-side):**
Given the user types a value exceeding the field limit,
When any of these limits is exceeded,
Then an inline error appears under the offending field and Save is disabled:
- Passport number: max 20 chars → `"Passport number must be 20 characters or fewer."`
- Nationality: max 50 chars → `"Nationality must be 50 characters or fewer."`
- Known traveler number: max 20 chars → `"Known traveler number must be 20 characters or fewer."`

**AC5 — `companions-section.tsx` validates add-name length (client-side):**
Given the user types more than 50 characters in the inline add-companion input,
When the length exceeds 50,
Then an error `"Companion name must be 50 characters or fewer."` appears below the input and Add is disabled.
The existing guard (Add disabled when name is empty) is preserved.

**AC6 — `account-section.tsx` shows inline password errors (client-side):**
Given the user types a new password fewer than 8 characters (non-empty),
Then an inline error `"Password must be at least 8 characters."` appears under the "New password" field.

Given the confirm-password value doesn't match new password (non-empty),
Then an inline error `"Passwords do not match."` appears under the "Confirm new password" field.

The existing floating `<p role="alert">` for these two cases is removed; errors live inside their `Field` instances.
`aria-invalid` is set on the affected inputs. The three password `<input>` elements are migrated to the shadcn `Input` component for consistent invalid-state ring styling.

**AC7 — `identity-section.tsx` validates name length (client-side):**
Given the user types a display name longer than 100 characters,
When the length exceeds 100,
Then `Field error="Name must be 100 characters or fewer."` appears inline, the Input receives `aria-invalid="true"`, and Save is disabled.

**AC8 — `passport-section.tsx` validates field lengths (client-side):**
Same limits as AC4 (passport number 20, nationality 50, KTN 20), applied to the user's own profile passport fields.
Save is disabled while any of the three limits is exceeded.

**AC9 — `preferences-section.tsx` validates currency code (client-side):**
Given the user types a non-empty currency value that does not match `/^[A-Z]{3}$/`,
When the value is non-empty and invalid,
Then `Field error="Currency must be a 3-letter ISO code (e.g. USD)."` appears inline, the Input receives `aria-invalid="true"`, and Save is disabled.
Clearing the field (empty string) removes the error — currency is optional.

**AC10 — `updateProfile` validates server-side:**
Given `updateProfile` is called with any out-of-range value,
When the action runs,
Then it returns `{ error: "<message>" }` without writing to the DB.
Server-enforced limits (same as client-side limits):
- `name`: max 100 chars → `"Name must be 100 characters or fewer."`
- `passportNumber`: max 20 chars → `"Passport number must be 20 characters or fewer."`
- `passportNationality`: max 50 chars → `"Nationality must be 50 characters or fewer."`
- `knownTravelerNumber`: max 20 chars → `"Known traveler number must be 20 characters or fewer."`
- `currency`: non-empty and not `/^[A-Z]{3}$/` → `"Currency must be a 3-letter ISO code."`
- `dateFormat`: not `"MM/DD/YYYY"` or `"DD/MM/YYYY"` (when set) → `"Invalid date format."`
- `distanceUnit`: not `"imperial"` or `"metric"` (when set) → `"Invalid distance unit."`
Return type changes from `Promise<void>` to `Promise<{ error?: string }>`.

**AC11 — All `updateProfile` callers handle server errors:**
Given `updateProfile` returns `{ error }`,
When any of the three profile sections calls the action,
Then the section shows `toast.error(result.error)` and the save/dirty state is unchanged.

**AC12 — Happy paths are unaffected:**
Given all fields are within constraints,
When forms are rendered or actions are called,
Then no error messages appear, `aria-invalid` is absent, and `updateProfile` returns `{}` as before.

**AC13 — Tests cover error-state render paths and server validation:**
- `form-section.test.tsx`: `Field` renders `<p role="alert">` when `error` + `htmlFor` are set; renders nothing extra when absent.
- `companion-row.test.tsx`: 51-char name shows error; age "999" shows error; 21-char passport number shows error; correcting clears it.
- `account-section.test.tsx` (new): 7-char new password shows length error; mismatched confirm shows mismatch error.
- `identity-section.test.tsx` (new or existing): 101-char name shows error and disables Save.
- `passport-section.test.tsx` (new): 21-char passport number shows error and disables Save.
- `actions.test.ts` or inline: `updateProfile` with `name: "x".repeat(101)` returns `{ error: "..." }`.

---

## Dev Notes

### Architecture

Client-side: purely presentational — derive error strings from existing state, pass to `Field.error`, set `aria-invalid`. No new state variables.
Server-side: `updateProfile` gets validation guards and a `Promise<{ error?: string }>` return type (same pattern as `addCompanion` / `updateCompanion` from story 4.3).

### 1. `Field` — add `error` prop

```tsx
export interface FieldProps {
  label: string;
  htmlFor?: string;
  error?: string;
  children: React.ReactNode;
}

export function Field({ label, htmlFor, error, children }: FieldProps) {
  const errorId = htmlFor ? `${htmlFor}-error` : undefined;
  return (
    <div>
      {htmlFor ? (
        <label htmlFor={htmlFor} style={LABEL_STYLE}>{label}</label>
      ) : (
        <span style={LABEL_STYLE}>{label}</span>
      )}
      {children}
      {error && errorId && (
        <p
          id={errorId}
          role="alert"
          style={{ fontSize: "calc(11px * var(--font-scale))", color: "var(--destructive)", marginTop: 4 }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
```

### 2. `companion-row.tsx` — derive all errors from state

```ts
const nameError = name.trim().length > 50
  ? "Companion name must be 50 characters or fewer."
  : null;

const parsedAge = age ? parseInt(age, 10) : null;
const ageError = age !== "" && (parsedAge === null || isNaN(parsedAge) || parsedAge < 0 || parsedAge > 120)
  ? "Age must be between 0 and 120."
  : null;

const passportNumberError = passportNumber.length > 20
  ? "Passport number must be 20 characters or fewer."
  : null;
const passportNationalityError = passportNationality.length > 50
  ? "Nationality must be 50 characters or fewer."
  : null;
const ktnError = knownTravelerNumber.length > 20
  ? "Known traveler number must be 20 characters or fewer."
  : null;

const hasError = !!(nameError || ageError || passportNumberError || passportNationalityError || ktnError);
```

Save button disable condition:
```tsx
disabled={isPending || !name.trim() || hasError}
```

Pass each error to its `Field` and set `aria-invalid` + `aria-describedby` accordingly.

### 3. `companions-section.tsx` — add-input error

```ts
const nameError = name.trim().length > 50
  ? "Companion name must be 50 characters or fewer."
  : null;
```

Render error below the input wrapper as a sibling `<p role="alert">`.
Update Add button: `disabled={isAdding || !name.trim() || !!nameError}`.

### 4. `account-section.tsx` — inline password errors

```ts
const newPasswordError = newPassword.length > 0 && newPassword.length < 8
  ? "Password must be at least 8 characters."
  : null;
const confirmPasswordError = confirmPassword.length > 0 && confirmPassword !== newPassword
  ? "Passwords do not match."
  : null;
```

Migrate the three password `<input>` elements to the shadcn `Input` component for `aria-invalid` ring styling.
Remove the client-side guards from `handlePasswordSave` (caught inline now); keep `passwordError` state only for server-returned errors.
Remove the floating `{passwordError && <p ...>}` block for the two client-side cases; keep it only for server errors.

### 5. `identity-section.tsx` — name length

```ts
const nameError = name.length > 100 ? "Name must be 100 characters or fewer." : null;
```

Migrate the `<input>` to `Input` component while in the file. Disable Save when error is active.

### 6. `passport-section.tsx` — field length constraints

```ts
const passportNumberError = passportNumber.length > 20
  ? "Passport number must be 20 characters or fewer."
  : null;
const nationalityError = passportNationality.length > 50
  ? "Nationality must be 50 characters or fewer."
  : null;
const ktnError = knownTravelerNumber.length > 20
  ? "Known traveler number must be 20 characters or fewer."
  : null;

const hasError = !!(passportNumberError || nationalityError || ktnError);
```

Add `import { toast } from "sonner"` and handle the server error in `handleSave` (AC11). Disable Save when `hasError`.

### 7. `preferences-section.tsx` — currency format

```ts
const currencyError = currency.length > 0 && !/^[A-Z]{3}$/.test(currency)
  ? "Currency must be a 3-letter ISO code (e.g. USD)."
  : null;
```

The existing `onChange` forces uppercase + 3-char slice, so this error is rarely reached through normal typing — it guards against paste. Add `import { toast } from "sonner"` and handle server error in `handleSave`. Disable Save when `!!currencyError`.

### 8. `updateProfile` server-side validation

Change return type from `Promise<void>` to `Promise<{ error?: string }>`.

```ts
export async function updateProfile(patch: UpdateUserProfilePatch): Promise<{ error?: string }> {
  const session = await requireUser();

  if (patch.name !== undefined && patch.name !== null) {
    if (patch.name.length > 100) return { error: "Name must be 100 characters or fewer." };
  }
  if (patch.passportNumber !== undefined) {
    if (patch.passportNumber.length > 20) return { error: "Passport number must be 20 characters or fewer." };
  }
  if (patch.passportNationality !== undefined) {
    if (patch.passportNationality.length > 50) return { error: "Nationality must be 50 characters or fewer." };
  }
  if (patch.knownTravelerNumber !== undefined) {
    if (patch.knownTravelerNumber.length > 20) return { error: "Known traveler number must be 20 characters or fewer." };
  }
  if (patch.currency !== undefined && patch.currency !== "") {
    if (!/^[A-Z]{3}$/.test(patch.currency)) return { error: "Currency must be a 3-letter ISO code." };
  }
  if (patch.dateFormat !== undefined) {
    if (!["MM/DD/YYYY", "DD/MM/YYYY"].includes(patch.dateFormat)) return { error: "Invalid date format." };
  }
  if (patch.distanceUnit !== undefined) {
    if (!["imperial", "metric"].includes(patch.distanceUnit)) return { error: "Invalid distance unit." };
  }

  await db.update(users).set(patch).where(eq(users.id, session.id!));
  revalidatePath("/profile");
  revalidatePath("/trips");
  return {};
}
```

### 9. Caller error handling (AC11)

Each section already calls `updateProfile` inside a `startTransition`. Pattern:
```ts
const result = await updateProfile(patch);
if (result.error) {
  toast.error(result.error);
  return;
}
setJustSaved(true);
// ...
```

Add `import { toast } from "sonner"` to `identity-section.tsx`, `passport-section.tsx`, and `preferences-section.tsx`.

`revalidatePath` stays on success paths only (it's after the guard in the updated function).

### Key invariants

- Companion name server-side limit is **50** chars (changed from 100 in story 4.3 implementation).
- `updateProfile` callers that succeed continue to receive `{}` and proceed exactly as before.
- `dateFormat` and `distanceUnit` are set by `ToggleGroup` with fixed option values — the server guard is a backstop against malformed direct calls, not a normal user path.
- `updateProfile` does not validate `passportExpiry` — the DatePicker produces ISO strings or `undefined`; no length or format check is needed.
- `companion-row.tsx`: Save disabled when `name.trim()` is empty (original guard) OR `hasError` is true.
- Auth forms (`auth-forms.tsx`) remain out of scope.

### References

- `src/components/packt/form-section.tsx`
- `src/app/(app)/profile/actions.ts` — `updateProfile` return type change + validation
- `src/app/(app)/profile/companion-row.tsx`
- `src/app/(app)/profile/companions-section.tsx`
- `src/app/(app)/profile/account-section.tsx`
- `src/app/(app)/profile/identity-section.tsx`
- `src/app/(app)/profile/passport-section.tsx`
- `src/app/(app)/profile/preferences-section.tsx`
- `src/components/ui/input.tsx` — `aria-invalid` styles already wired
- `_bmad-output/implementation-artifacts/4-3-companion-data-integrity.md` — server-side pattern to follow

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

_none — no blocking issues encountered_

### Completion Notes List

- AC1: `Field` gains `error?: string` prop; renders `<p role="alert" id="${htmlFor}-error">` only when both `error` and `htmlFor` are set
- AC2–AC4: `companion-row.tsx` derives `nameError`, `ageError`, `passportNumberError`, `passportNationalityError`, `ktnError` from state; wired to `Field.error` and `aria-invalid`; Save disabled when `hasError`
- AC5: `companions-section.tsx` derives `nameError` from the add-input; renders inline `<p role="alert">` and disables Add button
- AC6: `account-section.tsx` derives `newPasswordError` / `confirmPasswordError` inline; migrated all three password inputs to shadcn `Input`; removed client-side mismatch guard from `handlePasswordSave`; server errors still surface via `passwordError` state
- AC7: `identity-section.tsx` derives `nameError`; migrated `<input>` to `Input`; added `toast` + server error handling; Save disabled when error active
- AC8: `passport-section.tsx` derives `passportNumberError`, `nationalityError`, `ktnError`; Save disabled when `hasError`; server error handling added
- AC9: `preferences-section.tsx` derives `currencyError` from regex; Save disabled when `!!currencyError`; server error handling added
- AC10: `updateProfile` return type changed to `Promise<{ error?: string }>`; seven validation guards added before DB write
- AC11: All three callers (`identity-section`, `passport-section`, `preferences-section`) handle `result.error` with `toast.error`
- AC13: 848 unit tests pass; new/updated tests cover all error paths per AC13 spec

### File List

- `src/components/packt/form-section.tsx`
- `src/components/packt/form-section.test.tsx`
- `src/app/(app)/profile/actions.ts`
- `src/app/(app)/profile/companion-row.tsx`
- `src/app/(app)/profile/companion-row.test.tsx`
- `src/app/(app)/profile/companions-section.tsx`
- `src/app/(app)/profile/account-section.tsx`
- `src/app/(app)/profile/account-section.test.tsx` _(new if absent)_
- `src/app/(app)/profile/identity-section.tsx`
- `src/app/(app)/profile/identity-section.test.tsx` _(new if absent)_
- `src/app/(app)/profile/passport-section.tsx`
- `src/app/(app)/profile/passport-section.test.tsx` _(new)_
- `src/app/(app)/profile/preferences-section.tsx`
- `_bmad-output/implementation-artifacts/4-4-client-side-field-validation.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

---

### Review Findings

- [x] [Review][Patch] Change `role="alert"` to `role="status"` + `aria-live="polite"` on inline error paragraphs — per-keystroke `role="alert"` interrupts screen readers on every re-render; `role="status"` with polite live region is the correct WCAG pattern for inline validation [form-section.tsx, companions-section.tsx]
- [x] [Review][Patch] Passport/nationality/KTN fields cannot be cleared — `passportNumber || undefined` converts empty string to `undefined`, which Drizzle's `.set()` skips; old value persists after "Save" [passport-section.tsx:41–46, companion-row.tsx:handleSave]
- [x] [Review][Patch] Password Save button not guarded by error states — removing the `handlePasswordSave` mismatch check without adding `!!confirmPasswordError || !!newPasswordError` to the disabled prop allows a mismatched confirm to submit to the server [account-section.tsx]
- [x] [Review][Defer] `Field` silently drops `error` when `htmlFor` is absent — spec-compliant per AC1 ("If htmlFor is absent, the error is not rendered") but a future footgun for developers who omit `htmlFor` accidentally [form-section.tsx:61]
- [x] [Review][Defer] `name` field writes untrimmed value and `""` to DB instead of normalized null — identity-section validates `name.length > 100` (not trimmed) and sends raw value; server also stores untrimmed including trailing spaces [identity-section.tsx]
- [x] [Review][Defer] Age `parseInt` accepts decimals and trailing garbage — `"25.7"` parses to `25` silently; mostly prevented by `<input type="number">` in most browsers but edge case for paste/programmatic input [companion-row.tsx]
- [x] [Review][Defer] `passportExpiry` unvalidated server-side — a malformed date string hits Postgres directly and throws, bypassing the `Promise<{error?}>` contract [actions.ts:updateProfile]
- [x] [Review][Defer] Server action DB exceptions uncaught — any Postgres error (constraint, connection) in `db.update(...)` propagates as an unhandled rejection rather than `{ error: "..." }`, breaking the `Promise<{error?}>` return contract [actions.ts]
