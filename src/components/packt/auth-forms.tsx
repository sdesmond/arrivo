"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";

type ActionState = { error?: string } | undefined;
interface SignInFormProps { action: (prev: ActionState, formData: FormData) => Promise<ActionState>; }
interface SignUpFormProps { action: (prev: ActionState, formData: FormData) => Promise<ActionState>; }

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      aria-busy={pending}
      disabled={pending}
      className="h-11 w-full rounded-lg px-4 font-medium"
      style={{ background: "var(--accent-brand)", color: "var(--fg-on-accent)" }}
    >
      {pending ? "Please wait…" : label}
    </button>
  );
}

export function SignInForm({ action }: SignInFormProps) {
  const [state, formAction] = useActionState(action, undefined);
  const hasError = !!state?.error;

  useEffect(() => {
    const h1 = document.querySelector("h1");
    (h1 as HTMLElement)?.focus();
  }, []);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {hasError && (
        <p id="form-error" role="alert" aria-live="polite" style={{ color: "var(--destructive)" }}>
          {state!.error}
        </p>
      )}
      <div className="flex flex-col gap-1">
        <label htmlFor="email">Email</label>
        <input
          id="email" name="email" type="email" required autoComplete="email"
          className="h-11 rounded-lg border px-3"
          style={{ borderColor: "var(--line)", background: "var(--surface)" }}
          aria-invalid={hasError || undefined}
          aria-describedby={hasError ? "form-error" : undefined}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="password">Password</label>
        <input
          id="password" name="password" type="password" required autoComplete="current-password"
          className="h-11 rounded-lg border px-3"
          style={{ borderColor: "var(--line)", background: "var(--surface)" }}
          aria-invalid={hasError || undefined}
          aria-describedby={hasError ? "form-error" : undefined}
        />
      </div>
      <SubmitButton label="Sign in" />
      <p className="text-center text-sm">
        Need an account?{" "}
        <Link href="/sign-up" className="underline" style={{ color: "var(--accent-brand)" }}>
          Sign up
        </Link>
      </p>
    </form>
  );
}

export function SignUpForm({ action }: SignUpFormProps) {
  const [state, formAction] = useActionState(action, undefined);
  const hasError = !!state?.error;

  useEffect(() => {
    const h1 = document.querySelector("h1");
    (h1 as HTMLElement)?.focus();
  }, []);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {hasError && (
        <p id="form-error" role="alert" aria-live="polite" style={{ color: "var(--destructive)" }}>
          {state!.error}
        </p>
      )}
      <div className="flex flex-col gap-1">
        <label htmlFor="name">Name</label>
        <input
          id="name" name="name" type="text" required autoComplete="name"
          className="h-11 rounded-lg border px-3"
          style={{ borderColor: "var(--line)", background: "var(--surface)" }}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="email">Email</label>
        <input
          id="email" name="email" type="email" required autoComplete="email"
          className="h-11 rounded-lg border px-3"
          style={{ borderColor: "var(--line)", background: "var(--surface)" }}
          aria-invalid={hasError || undefined}
          aria-describedby={hasError ? "form-error" : undefined}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="password">Password</label>
        <input
          id="password" name="password" type="password" required autoComplete="new-password"
          className="h-11 rounded-lg border px-3"
          style={{ borderColor: "var(--line)", background: "var(--surface)" }}
          aria-invalid={hasError || undefined}
          aria-describedby={hasError ? "form-error" : undefined}
        />
      </div>
      <SubmitButton label="Create account" />
      <p className="text-center text-sm">
        Have an account?{" "}
        <Link href="/sign-in" className="underline" style={{ color: "var(--accent-brand)" }}>
          Sign in
        </Link>
      </p>
    </form>
  );
}
