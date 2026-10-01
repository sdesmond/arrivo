import { act } from "@testing-library/react";
import { vi } from "vitest";

export class MockEventSource {
  static instances: MockEventSource[] = [];

  readonly close = vi.fn();
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;

  constructor(readonly url: string) {
    MockEventSource.instances.push(this);
  }

  emitError(): void {
    this.onerror?.(new Event("error"));
  }

  emitMessage(data = '{"type":"heartbeat"}'): void {
    this.onmessage?.(new MessageEvent("message", { data }));
  }

  emitOpen(): void {
    this.onopen?.(new Event("open"));
  }
}

export function currentSource(): MockEventSource {
  const source = MockEventSource.instances.at(-1);
  if (!source) throw new Error("No MockEventSource instance was created.");
  return source;
}

export function tripSource(): MockEventSource {
  const source = MockEventSource.instances.filter((instance) => instance.url.startsWith("/api/trips/")).at(-1);
  if (!source) throw new Error("No trip-channel MockEventSource instance was created.");
  return source;
}

export function personalSource(): MockEventSource {
  const source = MockEventSource.instances.filter((instance) => instance.url === "/api/users/me/events").at(-1);
  if (!source) throw new Error("No personal-channel MockEventSource instance was created.");
  return source;
}

export async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}
