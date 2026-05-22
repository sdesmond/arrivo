# Story shadcn-6 — Replace Toggle Buttons with `ToggleGroup` + Raw Inputs

**Status:** ready-for-dev
**Epic:** shadcn Widget Audit
**Depends on:** Story 1 (shadcn `toggle-group` is already installed at `src/components/ui/toggle-group.tsx`)

---

## User Story

As a user, I want the date-format and distance-unit toggles in Preferences to look and feel like the rest of the design system, so that I get consistent theming, focus management, and keyboard navigation instead of custom-styled raw buttons.

---

## Acceptance Criteria

1. Date format toggle in `ProfilePreferencesSection` uses `ToggleGroup` + `ToggleGroupItem` — no raw `<button>` elements remain
2. Distance unit toggle uses `ToggleGroup` + `ToggleGroupItem` — same pattern
3. Currency field uses shadcn `<Input>` — no raw `<input>` remains; `id="pref-currency"` is preserved
4. `handleDateFormatChange`, `handleCurrencyChange`, and `handleDistanceUnitChange` remain correctly wired
5. `computeDirty` and `isDirty` logic unchanged — Save button still enables/disables correctly
6. `preferences-section.test.tsx` created and green (toggle interactions, currency change, dirty state)
7. `npm test` green; `build-validator` passes; `profile.feature` E2E still green

---

## File to Modify

**Single file:** `src/app/(app)/profile/preferences-section.tsx`

---

## Current File State (read before writing)

```
src/app/(app)/profile/preferences-section.tsx  (133 lines)
```

**Current date format toggle (lines 63–79):**
```tsx
<Field label="Date format">
  <div className="flex rounded-[6px] overflow-hidden" style={{ border: "1px solid var(--line)" }}>
    {DATE_FORMAT_OPTIONS.map((opt) => (
      <button
        key={opt.value}
        type="button"
        onClick={() => handleDateFormatChange(opt.value)}
        className="flex-1 px-3 py-1.5 font-medium transition-colors"
        style={{
          background: dateFormat === opt.value ? "var(--accent-brand)" : "var(--surface-2)",
          color: dateFormat === opt.value ? "var(--accent-fg)" : "var(--fg-2)",
          fontSize: "calc(13px * var(--font-scale))",
        }}
      >
        {opt.label}
      </button>
    ))}
  </div>
</Field>
```

**Current currency input (lines 82–98):**
```tsx
<Field label="Currency" htmlFor="pref-currency">
  <input
    id="pref-currency"
    type="text"
    value={currency}
    onChange={(e) => handleCurrencyChange(e.target.value.toUpperCase().slice(0, 3))}
    className="w-full rounded-[6px] px-2.5 py-1.5 outline-none transition-colors"
    style={{
      background: "var(--surface-2)",
      color: "var(--fg)",
      border: "1px solid var(--line)",
      fontSize: "calc(13px * var(--font-scale))",
    }}
    placeholder="USD"
    maxLength={3}
  />
</Field>
```

**Current distance units toggle (lines 100–118):**
```tsx
<Field label="Distance units">
  <div className="flex rounded-[6px] overflow-hidden" style={{ border: "1px solid var(--line)" }}>
    {(["imperial", "metric"] as const).map((unit) => (
      <button
        key={unit}
        type="button"
        onClick={() => handleDistanceUnitChange(unit)}
        className="flex-1 px-3 py-1.5 font-medium transition-colors capitalize"
        style={{
          background: distanceUnit === unit ? "var(--accent-brand)" : "var(--surface-2)",
          color: distanceUnit === unit ? "var(--accent-fg)" : "var(--fg-2)",
          fontSize: "calc(13px * var(--font-scale))",
        }}
      >
        {unit}
      </button>
    ))}
  </div>
</Field>
```

---

## Critical Architecture Context

### Accessibility: Add `aria-label` to each ToggleGroup

`Field` renders a `<span>` (not a `<label>`) when no `htmlFor` is given, so the ToggleGroup has no programmatic association with its visible label. Add `aria-label` directly on each group:

```tsx
<ToggleGroup aria-label="Date format" value={[dateFormat]} onValueChange={...}>
<ToggleGroup aria-label="Distance units" value={[distanceUnit]} onValueChange={...}>
```

### ToggleGroup is Base UI, NOT Radix

`src/components/ui/toggle-group.tsx` wraps `@base-ui/react/toggle-group`. **The API is different from the Radix UI ToggleGroup that standard shadcn ships.**

**Key API differences from Radix:**
- `value` is `readonly Value[]` (an **array** of strings) — NOT a single string
- `onValueChange` signature: `(groupValue: Value[], eventDetails) => void` — receives an **array**
- `multiple` prop defaults to `false` (single-select behavior) — there is **no `type="single"` prop**
- Items become selected/deselected based on whether their `value` is in the array

**The spec shows incorrect Radix-style usage. Use this Base UI pattern instead:**

```tsx
<ToggleGroup
  value={[dateFormat]}
  onValueChange={(arr) => arr[0] && handleDateFormatChange(arr[0])}
>
  {DATE_FORMAT_OPTIONS.map((opt) => (
    <ToggleGroupItem key={opt.value} value={opt.value}>
      {opt.label}
    </ToggleGroupItem>
  ))}
</ToggleGroup>
```

The `arr[0] &&` guard is essential: when `multiple={false}` (default), clicking the already-pressed item would deselect it, returning an empty array. The guard prevents that from clearing the state — preserving the current value.

### Imports to add

```tsx
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Input } from "@/components/ui/input";
```

Remove: the raw `<input>` element and the wrapping `<div className="flex rounded-[6px] overflow-hidden" ...>` containers for both toggles.

### Input component

`src/components/ui/input.tsx` wraps `@base-ui/react/input`. It accepts all standard `<input>` props including `id`, `value`, `onChange`, `placeholder`, `maxLength`, `type`. Drop-in replacement for the raw `<input>` — keep all existing props, just swap the element.

---

## What Must Be Preserved

- `id="pref-currency"` — E2E steps locate the currency field by `page.locator("#pref-currency")` and `expect(page.locator("#pref-currency")).toHaveValue("EUR")`. Changing this ID will break the E2E test.
- `onChange={(e) => handleCurrencyChange(e.target.value.toUpperCase().slice(0, 3))}` — uppercase + 3-char truncation logic
- `maxLength={3}` and `placeholder="USD"` on the currency input
- `handleDateFormatChange`, `handleCurrencyChange`, `handleDistanceUnitChange` — all three change handlers
- `computeDirty` function and `isDirty` derived value
- `onDirtyChange?.(...)` calls inside each handler
- Save button logic: `disabled={isPending || !isDirty}`
- `justSaved` status span with `role="status"` — E2E step `"I save the Preferences section"` waits for `getByRole("status")` to be visible

---

## Test File to Create

**New file:** `src/app/(app)/profile/preferences-section.test.tsx`

Test with `@testing-library/react` and Vitest. Mock `./actions` (the `updateProfile` server action):

```tsx
vi.mock("./actions", () => ({ updateProfile: vi.fn().mockResolvedValue(undefined) }));
```

**Required test cases:**

1. **Renders with initial values** — renders "Date format", "Currency", "Distance units" fields
2. **Date format toggle changes** — click "Day/Month" ToggleGroupItem, verify `handleDateFormatChange` equivalent (check that the button is now selected / aria-pressed)
3. **Distance unit toggle changes** — click "Metric", verify selection reflects
4. **Currency input change** — type into `#pref-currency`, verify value updates and is uppercased
5. **Save button disabled when not dirty** — with initial user values, Save button is disabled
6. **Save button enabled after change** — after changing date format, Save is enabled

**Render helper pattern** (provide minimal user prop):
```tsx
const mockUser: UserProfile = {
  id: "u1",
  name: "Test",
  email: "test@test.com",
  dateFormat: "MM/DD/YYYY",
  currency: "USD",
  distanceUnit: "imperial",
  // ... other required fields at their defaults
};

render(<ProfilePreferencesSection user={mockUser} />);
```

Check `src/data/types.ts` for the full `UserProfile` type before writing the mock object to ensure all required fields are covered.

For ToggleGroupItem selection, Base UI renders `<button>` elements with `aria-pressed`. You can assert:
```tsx
expect(screen.getByRole("button", { name: "Day/Month" })).toHaveAttribute("aria-pressed", "false");
await userEvent.click(screen.getByRole("button", { name: "Day/Month" }));
expect(screen.getByRole("button", { name: "Day/Month" })).toHaveAttribute("aria-pressed", "true");
```

---

## E2E Coverage

The existing `profile.feature` "Update preferences" scenario covers the currency field via `#pref-currency`. **No new E2E scenarios needed.** The existing test must still pass without modification to the step definitions.

The E2E step at `tests/e2e/steps/profile.steps.ts:44-47` does:
```ts
const currencyInput = page.locator("#pref-currency");
await currencyInput.clear();
await currencyInput.fill(currency);
```
and at line 58:
```ts
await expect(page.locator("#pref-currency")).toHaveValue("EUR");
```

---

## Previous Story Learnings (shadcn-5)

- **Always check what Base UI re-exports** — the project's UI primitives all wrap Base UI, not Radix. Check the component's import line before assuming the API.
- **`useSyncExternalStore` pattern** was used in theme/font-size selects to guard against SSR hydration. No such guard is needed here — preferences section is client-only and receives server-rendered initial values via props.
- **Remove inline style constants** when replacing with design-system components. The toggle wrapper `<div>` with `style={{ border: "1px solid var(--line)" }}` should be dropped; ToggleGroup handles its own borders via Tailwind/tokens.
- **Test update pattern from Story 5:** When a component changes from raw elements to shadcn primitives, the test interaction pattern changes from `fireEvent.change` to `userEvent.click` for trigger-based components.

---

## Workflow

1. Modify `src/app/(app)/profile/preferences-section.tsx`
   - Add `ToggleGroup`, `ToggleGroupItem` imports from `@/components/ui/toggle-group`
   - Add `Input` import from `@/components/ui/input`
   - Replace date format `<div>` + `<button>` block with `<ToggleGroup value={[dateFormat]} onValueChange={...}>`
   - Replace distance units `<div>` + `<button>` block with `<ToggleGroup value={[distanceUnit]} onValueChange={...}>`
   - Replace raw `<input>` with `<Input>` — keep all props including `id`, `onChange`, `maxLength`, `placeholder`
2. Create `src/app/(app)/profile/preferences-section.test.tsx`
3. Run `npm test` — must be green
4. Run `build-validator` — must pass
5. Run `npm run test:e2e` — `profile.feature` must still pass

---

## Acceptance Checklist

- [ ] No raw `<button>` toggle elements remain in preferences-section.tsx
- [ ] No raw `<input>` remains in preferences-section.tsx
- [ ] `ToggleGroup` uses `value={[...]}` (array) not a bare string
- [ ] `onValueChange` guard `arr[0] &&` prevents deselect-to-empty
- [ ] `id="pref-currency"` preserved on the `<Input>`
- [ ] `maxLength={3}`, `placeholder="USD"`, uppercase transform preserved
- [ ] `computeDirty` and Save button disabled/enabled behavior unchanged
- [ ] `preferences-section.test.tsx` created with ≥5 test cases
- [ ] `npm test` green
- [ ] `build-validator` passes
- [ ] `npm run test:e2e` green (profile.feature)
