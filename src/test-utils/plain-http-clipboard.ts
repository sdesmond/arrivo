import { vi } from "vitest";

// A plain-HTTP origin (a self-hosted install on a LAN address) has no `navigator.clipboard`, so copying
// goes through a hidden field and `document.execCommand("copy")`. Returns the execCommand spy and a
// restore function; call restore in a finally block so the stub never leaks into the next test.
export function stubPlainHttpClipboard(): { execCommand: ReturnType<typeof vi.fn>; restore: () => void } {
  const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  const execCommand = vi.fn(() => true);
  Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
  Object.defineProperty(document, "execCommand", { value: execCommand, configurable: true, writable: true });

  return {
    execCommand,
    restore() {
      if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
      else delete (navigator as unknown as Record<string, unknown>).clipboard;
      Object.defineProperty(document, "execCommand", { value: undefined, configurable: true, writable: true });
    },
  };
}
