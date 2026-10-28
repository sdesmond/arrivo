import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { AccountSetupDialog } from "@/components/arrivo/account-setup-dialog";
import { completeAccountSetupAction } from "./actions";
import { ACCOUNT_SETUP_COOKIE, resolveAccountSetupContext } from "@/lib/account-setup-session";

export const dynamic = "force-dynamic";

// Revalidates the cookie against the database on every request, so a replaced link, expiry or a deleted account
// shows the unavailable state on the next load. A page render cannot clear a cookie, so a stale one hops through
// the exchange route (no token = clear only) and lands back here without it.
export default async function AccountSetupPage() {
  const token = (await cookies()).get(ACCOUNT_SETUP_COOKIE)?.value;
  const context = await resolveAccountSetupContext(token, { headers: await headers() });

  if (context.status === "ready")
    return <AccountSetupDialog username={context.account.username} action={completeAccountSetupAction} />;
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
