import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

const mockState = vi.hoisted(() => ({ value: undefined as { error?: string; mfaRequired?: boolean } | undefined }));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useActionState: (_action: unknown, init: unknown) => [mockState.value ?? init, _action, false],
  };
});

import { SignInForm, AdminSetupForm } from "./auth-forms";
import { SignInNotice } from "@/data/types";
import { PASSWORD_MIN_LENGTH } from "@/lib/password-policy";

const noopAction = vi.fn(async () => undefined);

afterEach(() => {
  mockState.value = undefined;
});

describe("SignInForm", () => {
  it("renders username and password fields", () => {
    render(<SignInForm action={noopAction} mfaAction={noopAction} />);
    const username = screen.getByLabelText("Username");
    expect(username).toHaveAttribute("name", "username");
    expect(username).toHaveAttribute("autocomplete", "username");
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("renders submit button", () => {
    render(<SignInForm action={noopAction} mfaAction={noopAction} />);
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("shows error alert when state has error", () => {
    mockState.value = { error: "Invalid credentials" };
    render(<SignInForm action={noopAction} mfaAction={noopAction} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Invalid credentials")).toBeInTheDocument();
  });

  it("sets aria-invalid on inputs when there is an error", () => {
    mockState.value = { error: "Wrong password" };
    render(<SignInForm action={noopAction} mfaAction={noopAction} />);
    expect(screen.getByLabelText("Username")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Password")).toHaveAttribute("aria-invalid", "true");
  });
});

describe("SignInForm — security flows", () => {
  it("offers an unticked Keep me signed in box that explains the shorter session", () => {
    render(<SignInForm action={noopAction} mfaAction={noopAction} />);
    const keep = screen.getByRole("checkbox", { name: "Keep me signed in" });
    expect(keep).not.toBeChecked();
    expect(keep).toHaveAttribute("name", "keepSignedIn");
    expect(keep).toHaveAccessibleDescription("Otherwise you're signed out after 12 hours.");
  });

  it("switches to the code step when the password step asks for a second factor", () => {
    mockState.value = { mfaRequired: true };
    render(<SignInForm action={noopAction} mfaAction={noopAction} />);
    expect(screen.getByLabelText("Authentication code")).toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
  });

  it("explains why the user was sent back to sign in", () => {
    render(<SignInForm action={noopAction} mfaAction={noopAction} notice={SignInNotice.PasswordChanged} />);
    expect(screen.getByRole("status")).toHaveTextContent("Password changed. Sign in with your new password.");
  });

  it.each([
    [SignInNotice.MfaEnabled, "Two-factor authentication is on."],
    [SignInNotice.MfaDisabled, "Two-factor authentication is off."],
    [SignInNotice.SignedOutEverywhere, "Signed out on all devices."],
  ])("shows the %s notice", (notice, text) => {
    render(<SignInForm action={noopAction} mfaAction={noopAction} notice={notice} />);
    expect(screen.getByRole("status")).toHaveTextContent(text);
  });

  it("ignores unknown notices", () => {
    render(<SignInForm action={noopAction} mfaAction={noopAction} notice="<script>" />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("AdminSetupForm", () => {
  it("focuses username when setup opens instead of the page heading", () => {
    render(
      <>
        <h1 tabIndex={-1}>Welcome to Arrivo!</h1>
        <AdminSetupForm action={noopAction} />
      </>
    );
    expect(screen.getByLabelText("Username")).toHaveFocus();
  });

  it("renders name, username and password fields", () => {
    render(<AdminSetupForm action={noopAction} />);
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    const username = screen.getByLabelText("Username");
    expect(username).toHaveAttribute("name", "username");
    expect(username).toHaveAttribute("minlength", "3");
    expect(username).toHaveAttribute("maxlength", "30");
    expect(screen.getByLabelText("Password")).toHaveAttribute("minlength", String(PASSWORD_MIN_LENGTH));
  });

  it("renders submit button", () => {
    render(<AdminSetupForm action={noopAction} />);
    expect(screen.getByRole("button", { name: /create admin account/i })).toBeInTheDocument();
  });

  it("shows error alert when state has error", () => {
    mockState.value = { error: "That username is taken." };
    render(<AdminSetupForm action={noopAction} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("That username is taken.")).toBeInTheDocument();
  });

  it("sets aria-invalid on inputs when there is an error", () => {
    mockState.value = { error: "Signup failed" };
    render(<AdminSetupForm action={noopAction} />);
    expect(screen.getByLabelText("Username")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Password")).toHaveAttribute("aria-invalid", "true");
  });
});

describe("admin setup contract", () => {
  it("renders required fields in order with password-manager support", () => {
    const { container } = render(<AdminSetupForm action={noopAction} />);
    expect(Array.from(container.querySelectorAll("input")).map((input) => input.name)).toEqual([
      "username",
      "name",
      "password",
      "confirmPassword",
    ]);
    for (const label of ["Username", "Name", "Password", "Confirm password"]) {
      expect(screen.getByLabelText(label)).toBeRequired();
    }
    expect(screen.getByLabelText("Name")).toHaveAttribute("autocomplete", "name");
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "new-password");
    expect(screen.getByLabelText("Confirm password")).toHaveAttribute("autocomplete", "new-password");
    expect(screen.getByLabelText("Password")).toHaveAttribute("minlength", "8");
  });
  it("associates every setup field with errors", () => {
    mockState.value = { error: "Setup is already complete. Sign in to continue." };
    render(<AdminSetupForm action={noopAction} />);
    for (const label of ["Username", "Name", "Password", "Confirm password"]) {
      expect(screen.getByLabelText(label)).toHaveAttribute("aria-invalid", "true");
      expect(screen.getByLabelText(label)).toHaveAccessibleDescription(mockState.value.error);
    }
  });
});
