import { TemplatesPageClient } from "./page-client";
import { requireUser } from "@/lib/auth-helpers";
import { listTemplatesForUser } from "@/lib/queries";

export default async function TemplatesPage() {
  const session = await requireUser();
  const templates = await listTemplatesForUser(session.id!);

  return <TemplatesPageClient templates={templates} />;
}
