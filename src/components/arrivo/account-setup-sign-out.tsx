"use client";

import { useActionState } from "react";
import type { SignInActionState } from "@/data/types";
import { AuthSubmitButton } from "./auth-submit-button";

interface AccountSetupSignOutProps {
  action: (prev: SignInActionState, formData: FormData) => Promise<SignInActionState>;
}

export function AccountSetupSignOut({ action }: AccountSetupSignOutProps) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <>
      <h1 className="mb-2 text-xl font-semibold">Sign out to continue setup.</h1>
      <p className="mb-4" style={{ color: "var(--fg-2)" }}>
        This setup link is for another account. Sign out of your current account to continue.
      </p>
      <form action={formAction} className="flex flex-col gap-4">
        {state?.error && (
          <p role="alert" style={{ color: "var(--destructive)" }}>
            {state.error}
          </p>
        )}
        <AuthSubmitButton label="Sign out and continue" />
      </form>
    </>
  );
}
