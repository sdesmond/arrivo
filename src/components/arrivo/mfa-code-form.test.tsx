import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MfaActionState } from "@/data/types";

const mockState = vi.hoisted(() => ({ value: undefined as MfaActionState }));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useActionState: (_action: unknown, init: unknown) => [mockState.value ?? init, _action, false],
  };
});

import { MfaCodeForm } from "./mfa-code-form";

const noopAction = vi.fn(async () => undefined);

afterEach(() => {
  mockState.value = undefined;
});

describe("MfaCodeForm", () => {
  it("asks for an authenticator code with a labeled one-time-code input, focused on mount", () => {
    render(<MfaCodeForm action={noopAction} onBack={vi.fn()} />);
    const input = screen.getByLabelText("Authentication code");
    expect(input).toHaveAttribute("name", "code");
    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(input).toHaveAttribute("autocomplete", "one-time-code");
    expect(input).toHaveFocus();
    expect(screen.getByRole("button", { name: "Verify" })).toBeInTheDocument();
  });

  it("offers an unticked, labeled remember-this-computer box", () => {
    render(<MfaCodeForm action={noopAction} onBack={vi.fn()} />);
    const remember = screen.getByRole("checkbox", { name: "Remember this computer for 30 days" });
    expect(remember).not.toBeChecked();
    expect(remember).toHaveAttribute("name", "remember");
  });

  it("accepts a pasted code with a space without truncating it", async () => {
    render(<MfaCodeForm action={noopAction} onBack={vi.fn()} />);
    const input = screen.getByLabelText("Authentication code");
    await userEvent.setup().type(input, "123 456");
    expect(input).toHaveValue("123 456");
  });

  it("switches to a recovery code and back", async () => {
    const user = userEvent.setup();
    render(<MfaCodeForm action={noopAction} onBack={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Use a recovery code" }));
    const recoveryInput = screen.getByLabelText("Recovery code");
    expect(recoveryInput).toHaveAttribute("inputmode", "text");
    expect(recoveryInput).toHaveFocus();
    expect(screen.getByText(/recovery codes you saved/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Use your authenticator app instead" }));
    expect(screen.getByLabelText("Authentication code")).toBeInTheDocument();
  });

  it("shows errors in an alert linked to the input", () => {
    mockState.value = { error: "That code didn't work. Try again." };
    render(<MfaCodeForm action={noopAction} onBack={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("That code didn't work. Try again.");
    const input = screen.getByLabelText("Authentication code");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")).toContain("mfa-error");
  });

  it("only offers the way back once the sign-in has expired", () => {
    mockState.value = { error: "Your sign-in timed out.", expired: true };
    render(<MfaCodeForm action={noopAction} onBack={vi.fn()} />);
    expect(screen.queryByLabelText("Authentication code")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Verify" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to sign in" })).toHaveFocus();
  });

  it("calls onBack from the back button", async () => {
    const onBack = vi.fn();
    render(<MfaCodeForm action={noopAction} onBack={onBack} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Back to sign in" }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
