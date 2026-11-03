import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { AccountSetupDialog } from "@/components/arrivo/account-setup-dialog";
import { auth } from "@/auth";
import { db } from "@/db";
import { PASSWORD_POLICY_UNAVAILABLE_ERROR } from "@/lib/password-policy";
import { loadPasswordPolicy } from "@/lib/password-policy-store";
import { AccountSetupSignOut } from "@/components/arrivo/account-setup-sign-out";
import { completeAccountSetupAction, signOutAndContinueSetupAction } from "./actions";
import { ACCOUNT_SETUP_COOKIE, resolveAccountSetupContext } from "@/lib/account-setup-session";

export const dynamic = "force-dynamic";

// Revalidates the cookie against the database on every request, so a replaced link, expiry or a deleted account
// shows the unavailable state on the next load. A page render cannot clear a cookie, so a stale one hops through
// the exchange route (no token = clear only) and lands back here without it.
export default async function AccountSetupPage() {
  const token = (await cookies()).get(ACCOUNT_SETUP_COOKIE)?.value;
  const context = await resolveAccountSetupContext(token, { headers: await headers() });

  if (context.status === "ready") {
    const userId = (await auth())?.user?.id;
    if (userId && userId !== context.account.userId)
      return <AccountSetupSignOut action={signOutAndContinueSetupAction} />;
    const policy = await loadPasswordPolicy(db);
    if (!policy) {
      return (
        <>
          <h1 className="mb-2 text-xl font-semibold" tabIndex={-1}>
            Set up your account
          </h1>
          <p role="alert" style={{ color: "var(--destructive)" }}>
            {PASSWORD_POLICY_UNAVAILABLE_ERROR}
          </p>
        </>
      );
    }
    return (
      <AccountSetupDialog username={context.account.username} action={completeAccountSetupAction} policy={policy} />
    );
  }
  if (token) return redirect("/account-setup/open");

  return (
    <>
      <h1 className="mb-2 text-xl font-semibold" tabIndex={-1}>
        Setup link unavailable
      </h1>
      <p style={{ color: "var(--fg-2)" }}>This setup link can&apos;t be used. Ask an administrator for a new one.</p>
    </>
  );
}
