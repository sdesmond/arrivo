import { headers } from "next/headers";
import { requireUser } from "@/lib/auth-helpers";
import { getUserById } from "@/lib/queries";
import { detectPreferredCurrency } from "@/lib/utils";
import { ProfilePageClient } from "./page-client";

export default async function ProfilePage() {
  const session = await requireUser();
  const user = await getUserById(session.id!);

  if (!user) return null;

  const acceptLanguage = (await headers()).get("accept-language") ?? "";
  const currency = user.currency ?? detectPreferredCurrency(acceptLanguage);

  return <ProfilePageClient user={{ ...user, currency }} />;
}
