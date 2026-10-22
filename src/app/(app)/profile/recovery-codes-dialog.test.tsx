import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { toast } = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const dialogProps = vi.hoisted(() => ({ disablePointerDismissal: undefined as boolean | undefined }));
vi.mock("sonner", () => ({ toast }));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({
    children,
    open,
    onOpenChange,
    disablePointerDismissal,
  }: {
    children: React.ReactNode;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    disablePointerDismissal?: boolean;
  }) => {
    dialogProps.disablePointerDismissal = disablePointerDismissal;
    return open ? (
      <div>
        {children}
        <button onClick={() => onOpenChange(false)}>Escape</button>
      </div>
    ) : null;
  },
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { RecoveryCodesDialog } from "./recovery-codes-dialog";

const CODES = ["aaaaa-bbbbb", "ccccc-ddddd"];

describe("RecoveryCodesDialog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders nothing without codes", () => {
    render(<RecoveryCodesDialog codes={null} onDone={vi.fn()} />);
    expect(screen.queryByText("Save your recovery codes")).not.toBeInTheDocument();
  });

  it("lists every code", () => {
    render(<RecoveryCodesDialog codes={CODES} onDone={vi.fn()} />);
    const list = screen.getByRole("list", { name: "Recovery codes" });
    expect(list).toHaveTextContent("aaaaa-bbbbb");
    expect(list).toHaveTextContent("ccccc-ddddd");
  });

  it("copies the codes to the clipboard", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    render(<RecoveryCodesDialog codes={CODES} onDone={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Copy codes" }));
    expect(writeText).toHaveBeenCalledWith("aaaaa-bbbbb\nccccc-ddddd");
    expect(toast.success).toHaveBeenCalled();
  });

  it("tells the user when copying fails", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
    render(<RecoveryCodesDialog codes={CODES} onDone={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Copy codes" }));
    expect(toast.error).toHaveBeenCalled();
  });

  it("downloads the codes as a text file", async () => {
    const createObjectURL = vi.fn(() => "blob:codes");
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(<RecoveryCodesDialog codes={CODES} onDone={vi.fn()} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Download .txt" }));

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:codes");
  });

  it("closes only from the I saved these button, never from Escape or an outside click", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(<RecoveryCodesDialog codes={CODES} onDone={onDone} />);

    await user.click(screen.getByRole("button", { name: "Escape" }));
    expect(onDone).not.toHaveBeenCalled();
    expect(dialogProps.disablePointerDismissal).toBe(true);

    await user.click(screen.getByRole("button", { name: "I saved these" }));
    expect(onDone).toHaveBeenCalledOnce();
  });
});
