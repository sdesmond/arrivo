"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { SignInNotice, type MfaActionState, type SignInActionState } from "@/data/types";
import { AuthSubmitButton } from "./auth-submit-button";
import { MfaCodeForm } from "./mfa-code-form";

type ActionState = { error?: string } | undefined;
interface SignInFormProps {
  action: (prev: SignInActionState, formData: FormData) => Promise<SignInActionState>;
  mfaAction: (prev: MfaActionState, formData: FormData) => Promise<MfaActionState>;
  notice?: string;
}
interface SignUpFormProps {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
}

const NOTICE_TEXT: Record<SignInNotice, string> = {
  [SignInNotice.PasswordChanged]: "Password changed. Sign in with your new password.",
  [SignInNotice.MfaEnabled]: "Two-factor authentication is on. Sign in again with a code from your app.",
  [SignInNotice.MfaDisabled]: "Two-factor authentication is off. Sign in again.",
  [SignInNotice.SignedOutEverywhere]: "Signed out on all devices. Sign in again.",
};

function noticeText(notice: string | undefined): string | undefined {
  return notice && notice in NOTICE_TEXT ? NOTICE_TEXT[notice as SignInNotice] : undefined;
}

// "Back to sign in" from the code step remounts the password step, which resets its action state.
export function SignInForm({ action, mfaAction, notice }: SignInFormProps) {
  const [attempt, setAttempt] = useState(0);
  return (
    <SignInSteps
      key={attempt}
      action={action}
      mfaAction={mfaAction}
      notice={attempt === 0 ? notice : undefined}
      onRestart={() => setAttempt((current) => current + 1)}
    />
  );
}

interface SignInStepsProps extends SignInFormProps {
  onRestart: () => void;
}

function SignInSteps({ action, mfaAction, notice, onRestart }: SignInStepsProps) {
  const [state, formAction] = useActionState(action, undefined);
  const hasError = !!state?.error;
  const noticeMessage = noticeText(notice);

  useEffect(() => {
    const h1 = document.querySelector("h1");
    (h1 as HTMLElement)?.focus();
  }, []);

  if (state?.mfaRequired) return <MfaCodeForm action={mfaAction} onBack={onRestart} />;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {noticeMessage && !hasError && (
        <p role="status" style={{ color: "var(--fg-2)" }}>
          {noticeMessage}
        </p>
      )}
      {hasError && (
        <p id="form-error" role="alert" aria-live="polite" style={{ color: "var(--destructive)" }}>
          {state!.error}
        </p>
      )}
      <div className="flex flex-col gap-1">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="h-11 rounded-lg border px-3"
          style={{ borderColor: "var(--line)", background: "var(--surface)" }}
          aria-invalid={hasError || undefined}
          aria-describedby={hasError ? "form-error" : undefined}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="h-11 rounded-lg border px-3"
          style={{ borderColor: "var(--line)", background: "var(--surface)" }}
          aria-invalid={hasError || undefined}
          aria-describedby={hasError ? "form-error" : undefined}
        />
      </div>
      <div className="flex flex-col">
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            name="keepSignedIn"
            aria-describedby="keep-signed-in-hint"
            className="size-5"
            style={{ accentColor: "var(--accent-brand)" }}
          />
          Keep me signed in
        </label>
        <span id="keep-signed-in-hint" className="text-sm" style={{ color: "var(--fg-3)" }}>
          Otherwise you&apos;re signed out after 12 hours.
        </span>
      </div>
      <AuthSubmitButton label="Sign in" />
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
          id="name"
          name="name"
          type="text"
          required
          autoComplete="name"
          className="h-11 rounded-lg border px-3"
          style={{ borderColor: "var(--line)", background: "var(--surface)" }}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="h-11 rounded-lg border px-3"
          style={{ borderColor: "var(--line)", background: "var(--surface)" }}
          aria-invalid={hasError || undefined}
          aria-describedby={hasError ? "form-error" : undefined}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          className="h-11 rounded-lg border px-3"
          style={{ borderColor: "var(--line)", background: "var(--surface)" }}
          aria-invalid={hasError || undefined}
          aria-describedby={hasError ? "form-error" : undefined}
        />
      </div>
      <AuthSubmitButton label="Create account" />
      <p className="text-center text-sm">
        Have an account?{" "}
        <Link href="/sign-in" className="underline" style={{ color: "var(--accent-brand)" }}>
          Sign in
        </Link>
      </p>
    </form>
  );
}
