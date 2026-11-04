import type { NextRequest } from "next/server";
import { assertTripAccess, requireUser } from "@/lib/auth-helpers";
import { getStorageAdapter, StorageNotFoundError } from "@/lib/storage/storage-adapter";
import { resolveOwningTripId } from "@/lib/storage/trip-resolution";
import { EXTENSION_MIME_TYPES, MalformedKeyError, parseUploadStorageName } from "@/lib/upload-policy";

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const user = await requireUser();

  const key = (await params).path.join("/");

  let tripId: string | undefined;
  let isAvatar = false;
  try {
    // Avatars belong to a user, not a trip: any signed-in user may read them.
    isAvatar = parseUploadStorageName(key).scope === "user-avatar";
    if (!isAvatar) {
      tripId = await resolveOwningTripId(key);
    }
  } catch (error) {
    if (error instanceof MalformedKeyError) {
      return new Response("Not found", { status: 400 });
    }
    throw error;
  }

  if (tripId !== undefined) {
    await assertTripAccess(tripId, user.id!);
  }

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
        // Avatar files are UUID-named and never rewritten, so browsers can keep them across navigations.
        ...(isAvatar ? { "Cache-Control": "private, max-age=31536000, immutable" } : {}),
      },
    });
  } catch (error) {
    if (error instanceof StorageNotFoundError) {
      return new Response("Not found", { status: 404 });
    }
    throw error;
  }
}
