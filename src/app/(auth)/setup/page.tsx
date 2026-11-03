import { redirect } from "next/navigation";
import { AdminSetupForm } from "@/components/arrivo/auth-forms";
import { db } from "@/db";
import { isAppSetupOpen } from "@/lib/app-setup";
import { PASSWORD_POLICY_UNAVAILABLE_ERROR } from "@/lib/password-policy";
import { loadPasswordPolicy } from "@/lib/password-policy-store";
import { setupAdminAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (!(await isAppSetupOpen())) return redirect("/sign-in");
  const policy = await loadPasswordPolicy(db);
  return (
    <>
      <h1 className="mb-2 text-xl font-semibold" tabIndex={-1}>
        Welcome to Arrivo!
      </h1>
      <p className="mb-6" style={{ color: "var(--fg-2)" }}>
        Let&apos;s get your admin account set up.
      </p>
      {policy ? (
        <AdminSetupForm action={setupAdminAction} policy={policy} />
      ) : (
        <p role="alert" style={{ color: "var(--destructive)" }}>
          {PASSWORD_POLICY_UNAVAILABLE_ERROR}
        </p>
      )}
    </>
  );
}
