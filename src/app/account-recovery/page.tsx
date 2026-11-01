import QRCode from "qrcode";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { startAdminRecoveryEnrollment } from "@/lib/admin-recovery-completion";
import { ADMIN_RECOVERY_COOKIE, resolveAdminRecoveryContext } from "@/lib/admin-recovery-session";
import { totpUri } from "@/lib/mfa";
import { completeAdminRecoveryAction } from "./actions";
import { AdminRecoveryForm } from "./form";

export const dynamic = "force-dynamic";

interface AdminRecoveryPageProps {
  searchParams: Promise<{ token?: string | string[] }>;
}

function Unavailable() {
  return (
    <>
      <h1 className="mb-2 text-xl font-semibold">Recovery link unavailable</h1>
      <p style={{ color: "var(--fg-2)" }}>
        This recovery link can&apos;t be used. Ask the server operator for a new one.
      </p>
    </>
  );
}

export default async function AdminRecoveryPage({ searchParams }: AdminRecoveryPageProps) {
  // The operator's link is `/account-recovery?token=...`: hand it to the exchange route, which swaps it for a cookie.
  const { token: linkToken } = await searchParams;
  if (typeof linkToken === "string") return redirect(`/account-recovery/open?token=${encodeURIComponent(linkToken)}`);

  const token = (await cookies()).get(ADMIN_RECOVERY_COOKIE)?.value;
  const context = await resolveAdminRecoveryContext(token, { headers: await headers() });
  if (context.status !== "ready" || !token) return token ? redirect("/account-recovery/open") : <Unavailable />;

  const enrollment = await startAdminRecoveryEnrollment(db, token);
  if (!enrollment.ok) {
    if (enrollment.reason === "unavailable") return redirect("/account-recovery/open");
    return (
      <>
        <h1 className="mb-2 text-xl font-semibold">Recover account</h1>
        <p role="alert" style={{ color: "var(--destructive)" }}>
          {enrollment.reason === "needs-key"
            ? "Two-factor authentication needs DATA_ENCRYPTION_KEY set on the server. Ask whoever runs this Arrivo install."
            : "Something went wrong. Reload this page."}
        </p>
      </>
    );
  }
  const qrDataUrl = await QRCode.toDataURL(totpUri(enrollment.username, enrollment.secret), { margin: 1, width: 200 });
  return <AdminRecoveryForm action={completeAdminRecoveryAction} secret={enrollment.secret} qrDataUrl={qrDataUrl} />;
}
