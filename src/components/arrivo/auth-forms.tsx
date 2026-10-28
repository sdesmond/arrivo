"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { SignInNotice, type MfaActionState, type SignInActionState } from "@/data/types";
import { USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH } from "@/lib/username";
import { AuthSubmitButton } from "./auth-submit-button";
import { MfaCodeForm } from "./mfa-code-form";

type ActionState = { error?: string } | undefined;
interface SignInFormProps {
  action: (prev: SignInActionState, formData: FormData) => Promise<SignInActionState>;
  mfaAction: (prev: MfaActionState, formData: FormData) => Promise<MfaActionState>;
  notice?: string;
}
interface AdminSetupFormProps {
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
        <label htmlFor="username">Username</label>
        <input
          id="username"
          name="username"
          type="text"
          required
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
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
        <label className="flex min-h-11 items-center gap-2 self-start">
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
    </form>
  );
}

export function AdminSetupForm({ action }: AdminSetupFormProps) {
  const [state, formAction] = useActionState(action, undefined);
  const hasError = !!state?.error;
  const usernameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    usernameRef.current?.focus();
  }, []);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {hasError && (
        <p id="form-error" role="alert" aria-live="polite" style={{ color: "var(--destructive)" }}>
          {state!.error}
        </p>
      )}
      {[
        { name: "username", label: "Username", type: "text", autoComplete: "username" },
        { name: "name", label: "Name", type: "text", autoComplete: "name" },
        { name: "password", label: "Password", type: "password", autoComplete: "new-password" },
        { name: "confirmPassword", label: "Confirm password", type: "password", autoComplete: "new-password" },
      ].map((field) => (
        <div key={field.name} className="flex flex-col gap-1">
          <label htmlFor={field.name}>{field.label}</label>
          <input
            ref={field.name === "username" ? usernameRef : undefined}
            id={field.name}
            name={field.name}
            type={field.type}
            required
            minLength={field.name === "username" ? USERNAME_MIN_LENGTH : field.type === "password" ? 8 : undefined}
            maxLength={field.name === "username" ? USERNAME_MAX_LENGTH : undefined}
            autoComplete={field.autoComplete}
            autoCapitalize={field.name === "username" ? "none" : undefined}
            spellCheck={field.name === "username" ? false : undefined}
            className="h-11 rounded-lg border px-3"
            style={{ borderColor: "var(--line)", background: "var(--surface)" }}
            aria-invalid={hasError || undefined}
            aria-describedby={hasError ? "form-error" : undefined}
          />
        </div>
      ))}
      <AuthSubmitButton label="Create admin account" />
    </form>
  );
}
