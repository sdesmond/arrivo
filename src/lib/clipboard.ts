import { toast } from "sonner";

// `navigator.clipboard` only exists in a secure context (HTTPS or localhost). A self-hosted install
// reached over plain HTTP at a LAN address has none, so copy buttons would throw. Try the Clipboard API,
// then fall back to selecting a hidden field and `document.execCommand("copy")`. Resolves true when the
// text reached the clipboard, so callers can show their own success or failure message.
export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && typeof navigator.clipboard?.writeText === "function") {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied or document not focused: the selection path may still work.
    }
  }

  return copyWithSelection(text);
}

export const COPIED_MESSAGE = "Copied to clipboard";

// Copying leaves nothing visible behind, so every copy button confirms the same way: one shared success
// toast, or the caller's own failure message (usually telling the user how to copy by hand).
export async function copyToClipboard(text: string, failureMessage: string): Promise<boolean> {
  const copied = await copyText(text);
  if (copied) toast.success(COPIED_MESSAGE);
  else toast.error(failureMessage);
  return copied;
}

function copyWithSelection(text: string): boolean {
  if (typeof document === "undefined" || typeof document.execCommand !== "function") return false;

  const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  // A modal dialog traps focus and marks the rest of the page inert, so the field has to live inside it.
  const host = previouslyFocused?.closest('[role="dialog"]') ?? document.body;
  const field = document.createElement("textarea");
  field.value = text;
  field.readOnly = true;
  field.tabIndex = -1;
  field.setAttribute("aria-hidden", "true");
  Object.assign(field.style, { position: "fixed", top: "0", left: "0", opacity: "0", pointerEvents: "none" });
  host.appendChild(field);

  try {
    field.focus();
    field.select();
    field.setSelectionRange(0, text.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    field.remove();
    previouslyFocused?.focus();
  }
}
