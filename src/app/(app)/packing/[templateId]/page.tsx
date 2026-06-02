import { notFound } from "next/navigation";
import { TemplateEditorClient } from "./page-client";
import { requireUser } from "@/lib/auth-helpers";
import { getTemplateWithItems } from "@/lib/queries";

export default async function TemplateEditorPage({ params }: { params: Promise<{ templateId: string }> }) {
  const session = await requireUser();
  const { templateId } = await params;
  const detail = await getTemplateWithItems(templateId, session.id!);

  if (!detail) {
    notFound();
  }

  return <TemplateEditorClient template={detail.template} items={detail.items} />;
}
