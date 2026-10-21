import { cookies, headers } from "next/headers";
import { requireUser } from "@/lib/auth-helpers";
import { getUserById } from "@/lib/queries";
import { getMfaStatus } from "@/lib/mfa-store";
import { DEVICE_COOKIE, listTrustedDevices } from "@/lib/trusted-devices";
import { detectPreferredCurrency } from "@/lib/utils";
import { ProfilePageClient } from "./page-client";

export default async function ProfilePage() {
  const session = await requireUser();
  const deviceToken = (await cookies()).get(DEVICE_COOKIE)?.value;
  const [user, mfaStatus, trustedDevices] = await Promise.all([
    getUserById(session.id!),
    getMfaStatus(session.id!),
    listTrustedDevices(session.id!, deviceToken),
  ]);

  if (!user) return null;

  const acceptLanguage = (await headers()).get("accept-language") ?? "";
  const currency = user.currency ?? detectPreferredCurrency(acceptLanguage);

  return <ProfilePageClient user={{ ...user, currency }} mfaStatus={mfaStatus} trustedDevices={trustedDevices} />;
}
