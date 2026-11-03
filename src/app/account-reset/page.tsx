import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { PASSWORD_POLICY_UNAVAILABLE_ERROR } from "@/lib/password-policy";
import { loadPasswordPolicy } from "@/lib/password-policy-store";
import { PASSWORD_RESET_COOKIE, resolvePasswordResetContext } from "@/lib/password-reset-session";
import { completePasswordResetAction } from "./actions";
import { PasswordResetForm } from "./form";

export const dynamic = "force-dynamic";
export default async function PasswordResetPage() {
  const token = (await cookies()).get(PASSWORD_RESET_COOKIE)?.value;
  const context = await resolvePasswordResetContext(token, { headers: await headers() });
  if (context.status === "ready") {
    const policy = await loadPasswordPolicy(db);
    return (
      <>
        <h1 className="mb-2 text-xl font-semibold">Reset password</h1>
        <p className="mb-4" style={{ color: "var(--fg-2)" }}>
          Choose a new password. You will sign in again after saving it.
        </p>
        {policy ? (
          <PasswordResetForm action={completePasswordResetAction} policy={policy} />
        ) : (
          <p role="alert" style={{ color: "var(--destructive)" }}>
            {PASSWORD_POLICY_UNAVAILABLE_ERROR}
          </p>
        )}
      </>
    );
  }
  if (token) return redirect("/account-reset/open");
  return (
    <>
      <h1 className="mb-2 text-xl font-semibold">Reset link unavailable</h1>
      <p style={{ color: "var(--fg-2)" }}>This reset link can&apos;t be used. Ask an administrator for a new one.</p>
    </>
  );
}
