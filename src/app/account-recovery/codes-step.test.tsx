import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
const { push } = vi.hoisted(() => ({ push: vi.fn() }));
// The shared mock hands out a fresh router per call; this test needs to see the push.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { RecoveryCodesStep } from "./codes-step";

const CODES = ["aaaaa-bbbbb", "ccccc-ddddd"];

describe("RecoveryCodesStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("focuses its heading and lists the codes", async () => {
    render(<RecoveryCodesStep codes={CODES} />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Save your recovery codes" })).toHaveFocus());
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(CODES);
  });

  it("continues to a fresh sign-in only after the acknowledge button is used", async () => {
    render(<RecoveryCodesStep codes={CODES} />);
    await userEvent.keyboard("{Escape}");
    expect(push).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "I saved these" }));
    expect(push).toHaveBeenCalledWith("/sign-in");
  });

  it("copies the codes", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<RecoveryCodesStep codes={CODES} />);
    await userEvent.click(screen.getByRole("button", { name: "Copy codes" }));
    expect(writeText).toHaveBeenCalledWith(CODES.join("\n"));
  });

  it("survives a refused clipboard", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });
    render(<RecoveryCodesStep codes={CODES} />);
    await userEvent.click(screen.getByRole("button", { name: "Copy codes" }));
    expect(screen.getByRole("button", { name: "I saved these" })).toBeVisible();
  });

  it("downloads the codes as a text file", async () => {
    const createObjectURL = vi.fn().mockReturnValue("blob:codes");
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    render(<RecoveryCodesStep codes={CODES} />);
    await userEvent.click(screen.getByRole("button", { name: "Download .txt" }));
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:codes");
    click.mockRestore();
  });
});
