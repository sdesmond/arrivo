import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COPIED_MESSAGE, copyText, copyToClipboard } from "./clipboard";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

type ExecCommand = (command: string) => boolean;

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, "clipboard", { value, configurable: true });
}

function setExecCommand(value: ExecCommand | undefined) {
  Object.defineProperty(document, "execCommand", { value, configurable: true, writable: true });
}

describe("copyText", () => {
  const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");

  beforeEach(() => {
    setExecCommand(undefined);
  });

  afterEach(() => {
    if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
    else delete (navigator as unknown as Record<string, unknown>).clipboard;
    setExecCommand(undefined);
    document.body.innerHTML = "";
  });

  it("uses the Clipboard API when it is available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const execCommand = vi.fn<ExecCommand>();
    setClipboard({ writeText });
    setExecCommand(execCommand);

    await expect(copyText("AB123456")).resolves.toBe(true);

    expect(writeText).toHaveBeenCalledWith("AB123456");
    expect(execCommand).not.toHaveBeenCalled();
  });

  it("selects a hidden field and runs execCommand when the Clipboard API is missing (plain HTTP)", async () => {
    setClipboard(undefined);
    let copiedValue = "";
    const execCommand = vi.fn<ExecCommand>(() => {
      const field = document.querySelector("textarea");
      copiedValue = field?.value ?? "";
      expect(field).toHaveFocus();
      return true;
    });
    setExecCommand(execCommand);

    await expect(copyText("AB123456")).resolves.toBe(true);

    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(copiedValue).toBe("AB123456");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("falls back to execCommand when writeText rejects", async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error("denied")) });
    setExecCommand(vi.fn<ExecCommand>(() => true));

    await expect(copyText("secret")).resolves.toBe(true);
  });

  it("returns false when the Clipboard API is missing and execCommand is unsupported", async () => {
    setClipboard(undefined);

    await expect(copyText("secret")).resolves.toBe(false);
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("returns false and cleans up when execCommand reports failure", async () => {
    setClipboard(undefined);
    setExecCommand(vi.fn<ExecCommand>(() => false));

    await expect(copyText("secret")).resolves.toBe(false);
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("returns false and cleans up when execCommand throws", async () => {
    setClipboard(undefined);
    setExecCommand(
      vi.fn<ExecCommand>(() => {
        throw new Error("blocked");
      })
    );

    await expect(copyText("secret")).resolves.toBe(false);
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("restores focus to the element that had it", async () => {
    setClipboard(undefined);
    setExecCommand(vi.fn<ExecCommand>(() => true));
    const button = document.createElement("button");
    document.body.appendChild(button);
    button.focus();

    await copyText("secret");

    expect(button).toHaveFocus();
  });

  it("mounts the field inside an open dialog so a modal focus trap cannot steal it", async () => {
    setClipboard(undefined);
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const button = document.createElement("button");
    dialog.appendChild(button);
    document.body.appendChild(dialog);
    button.focus();
    let parent: Element | null | undefined;
    setExecCommand(
      vi.fn<ExecCommand>(() => {
        parent = document.querySelector("textarea")?.parentElement;
        return true;
      })
    );

    await copyText("secret");

    expect(parent).toBe(dialog);
  });
});

describe("copyToClipboard", () => {
  const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");

  beforeEach(() => {
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
    setExecCommand(undefined);
  });

  afterEach(() => {
    if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
    else delete (navigator as unknown as Record<string, unknown>).clipboard;
    setExecCommand(undefined);
    document.body.innerHTML = "";
  });

  it("uses one shared success message", () => {
    expect(COPIED_MESSAGE).toBe("Copied to clipboard");
  });

  it("copies the text and shows the shared success toast", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });

    await expect(copyToClipboard("AB123456", "Could not copy.")).resolves.toBe(true);

    expect(writeText).toHaveBeenCalledWith("AB123456");
    expect(toast.success).toHaveBeenCalledWith("Copied to clipboard");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("shows the caller's failure message when nothing reached the clipboard", async () => {
    setClipboard(undefined);

    await expect(copyToClipboard("secret", "Couldn't copy. Select it and copy it yourself.")).resolves.toBe(false);

    expect(toast.error).toHaveBeenCalledWith("Couldn't copy. Select it and copy it yourself.");
    expect(toast.success).not.toHaveBeenCalled();
  });
});
