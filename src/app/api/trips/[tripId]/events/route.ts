import "server-only";
import type { NextRequest } from "next/server";
import { assertTripAccess, requireUser } from "@/lib/auth-helpers";
import { SSE_HEARTBEAT_INTERVAL_MS, formatSseEvent, formatSseHeartbeat, subscribeTripForUser } from "@/lib/trip-events";

const SSE_RESPONSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-store, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  const user = await requireUser();
  const { tripId } = await params;
  await assertTripAccess(tripId, user.id!, "viewer");

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const unsubscribe = subscribeTripForUser(tripId, user.id!, (event) => {
        controller.enqueue(encoder.encode(formatSseEvent(event)));
      });

      const emitHeartbeat = () => controller.enqueue(encoder.encode(formatSseHeartbeat()));
      // Fired once synchronously so the response flushes immediately — without an
      // initial byte the client's connection can sit unopened for a full heartbeat
      // interval, racing any "Connected" assertion tied to the same interval length.
      emitHeartbeat();
      const heartbeat = setInterval(emitHeartbeat, SSE_HEARTBEAT_INTERVAL_MS);

      let cleanedUp = false;
      const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed — nothing to do.
        }
      };

      if (request.signal.aborted) {
        cleanup();
      } else {
        request.signal.addEventListener("abort", cleanup, { once: true });
      }
    },
  });

  return new Response(stream, { headers: SSE_RESPONSE_HEADERS });
}
