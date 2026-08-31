import type { NextRequest } from "next/server";
import { assertTripAccess, requireUser } from "@/lib/auth-helpers";
import { getStorageAdapter, StorageNotFoundError } from "@/lib/storage/storage-adapter";
import { resolveOwningTripId } from "@/lib/storage/trip-resolution";
import { EXTENSION_MIME_TYPES, MalformedKeyError } from "@/lib/upload-policy";

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const user = await requireUser();

  const key = (await params).path.join("/");

  let tripId: string;
  try {
    tripId = await resolveOwningTripId(key);
  } catch (error) {
    if (error instanceof MalformedKeyError) {
      return new Response("Not found", { status: 400 });
    }
    throw error;
  }

  await assertTripAccess(tripId, user.id!);

  try {
    const adapter = getStorageAdapter();
    const stream = await adapter.read(key);
    const extension = key.split(".").pop()!;
    const mimeType = EXTENSION_MIME_TYPES[extension];

    if (!mimeType) {
      return new Response(`Unsupported storage file extension: ${extension}`, { status: 400 });
    }

    return new Response(stream, {
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof StorageNotFoundError) {
      return new Response("Not found", { status: 404 });
    }
    throw error;
  }
}
