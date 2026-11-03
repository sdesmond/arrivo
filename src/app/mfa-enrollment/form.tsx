"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOutAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { ArrivoBrand } from "@/components/arrivo/arrivo-brand";
import { SignInNotice } from "@/data/types";
import { MfaEnrollment } from "@/app/(app)/profile/mfa-enrollment";
import { RecoveryCodesDialog } from "@/app/(app)/profile/recovery-codes-dialog";

interface MfaEnrollmentFormProps {
  title?: string;
}

export function MfaEnrollmentForm({ title = "Set up two-factor authentication" }: MfaEnrollmentFormProps) {
  const router = useRouter();
  const [codes, setCodes] = useState<string[] | null>(null);
  return (
    <main
      className="flex min-h-screen items-center justify-center px-4 py-12"
      style={{ background: "var(--bg)", color: "var(--fg)" }}
    >
      <div className="flex w-full max-w-sm flex-col gap-12">
        <div className="flex justify-center">
          <ArrivoBrand size={80} />
        </div>
        <section
          aria-labelledby="mfa-enrollment-heading"
          className="flex flex-col gap-6 rounded-2xl p-8"
          style={{ background: "var(--surface)", border: "1px solid var(--line)" }}
        >
          <header className="flex flex-col gap-3">
            <h1 id="mfa-enrollment-heading" className="text-xl font-semibold" tabIndex={-1}>
              {title}
            </h1>
            <p className="text-sm" style={{ color: "var(--fg-2)" }}>
              Two-factor authentication is required for your account. Set it up before continuing to Arrivo.
            </p>
          </header>
          <MfaEnrollment onEnrolled={setCodes} />
          <Button variant="outline" className="h-11" disabled={codes !== null} onClick={() => signOutAction()}>
            Sign out
          </Button>
        </section>
      </div>
      <RecoveryCodesDialog codes={codes} onDone={() => router.push(`/sign-in?notice=${SignInNotice.MfaEnabled}`)} />
    </main>
  );
}
