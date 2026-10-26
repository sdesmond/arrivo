import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { db } from "@/db";
import { ActivityEventType, type ActivityQuery } from "@/data/types";
import { readActivityPage } from "@/lib/activity-queries";
import { InstanceActivityViewer } from "@/components/arrivo/instance-activity-viewer";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  const text = Array.isArray(value) ? value[0] : value;
  return text ? text : undefined;
}

// URL input is untrusted: unknown actions are dropped here, and the read service validates the rest.
function parseQuery(params: SearchParams): ActivityQuery {
  const type = first(params.type);
  const known = type && (Object.values(ActivityEventType) as string[]).includes(type);
  return {
    ...(first(params.actor) ? { actorId: first(params.actor) } : {}),
    ...(known ? { type: type as ActivityEventType } : {}),
    ...(first(params.from) ? { from: first(params.from) } : {}),
    ...(first(params.to) ? { to: first(params.to) } : {}),
    ...(first(params.cursor) ? { cursor: first(params.cursor) } : {}),
  };
}

export default async function AdminActivityPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  // The layout can be reused by client navigation; guard every page request too.
  const user = await requireAdmin();
  const query = parseQuery(await searchParams);
  const result = await readActivityPage(db, user.id!, query);
  if (result.status === "forbidden") notFound();
  return (
    <section
      aria-labelledby="admin-activity-heading"
      className="rounded-lg border p-4"
      style={{ borderColor: "var(--line)", background: "var(--surface)" }}
    >
      <h2 id="admin-activity-heading" className="font-semibold text-fg">
        Activity
      </h2>
      <InstanceActivityViewer initialQuery={query} initialPage={result} />
    </section>
  );
}
