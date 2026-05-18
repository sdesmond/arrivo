import { requireUser } from "@/lib/auth-helpers";
import { getUserById } from "@/lib/queries";
import { ProfilePageClient } from "./page-client";

export default async function ProfilePage() {
  const session = await requireUser();
  const user = await getUserById(session.id!);

  if (!user) return null;

  return <ProfilePageClient user={user} />;
}
