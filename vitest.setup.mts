import "@testing-library/jest-dom";
import { vi } from "vitest";

if (typeof window !== "undefined") {
  // Node 22+ defines a global `localStorage`/`sessionStorage` accessor (Web Storage API gated behind
  // --localstorage-file) that shadows jsdom's real implementation: Vitest's jsdom environment only
  // copies window properties it doesn't recognize as already present on `global`, so it skips these
  // two and Node's broken (undefined-returning) accessor wins. Restore the real jsdom-backed storage.
  const jsdomWindow = (globalThis as { jsdom?: { window: Window } }).jsdom?.window;
  if (jsdomWindow) {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get: () => jsdomWindow.localStorage,
    });
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      get: () => jsdomWindow.sessionStorage,
    });
  }

  if (!window.PointerEvent) {
    class PointerEvent extends MouseEvent {
      constructor(type: string, params: PointerEventInit = {}) {
        super(type, params);
      }
    }
    Object.defineProperty(window, "PointerEvent", { value: PointerEvent });
  }

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
  unstable_rethrow: vi.fn(),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  })),
  headers: vi.fn(() => new Headers()),
}));

vi.mock("next/server", () => ({
  NextResponse: class NextResponse extends Response {
    static next() {
      return new Response(null);
    }

    static redirect(url: string | URL) {
      return Response.redirect(url.toString());
    }
  },
}));
