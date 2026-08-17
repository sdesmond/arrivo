import type { NextRequest } from "next/server";
import { assertTripAccess, requireUser } from "@/lib/auth-helpers";
import { getStorageAdapter, StorageNotFoundError } from "@/lib/storage/storage-adapter";
import { resolveOwningTripId } from "@/lib/storage/trip-resolution";
import { getMimeTypeForExtension } from "@/lib/upload-policy";

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const key = (await params).path.join("/");

  let tripId: string;
  try {
    tripId = await resolveOwningTripId(key);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message.startsWith("Malformed upload storage name") ? 400 : 404;
    return new Response("Not found", { status });
  }

  const user = await requireUser();
  await assertTripAccess(tripId, user.id!);

  try {
    const adapter = getStorageAdapter();
    const stream = await adapter.read(key);
    const extension = key.split(".").pop() ?? "";
    const contentType = getMimeTypeForExtension(extension);

    return new Response(stream, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": "inline",
      },
    });
  } catch (error) {
    if (error instanceof StorageNotFoundError) {
      return new Response("Not found", { status: 404 });
    }
    throw error;
  }
}
