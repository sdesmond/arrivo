import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockState = vi.hoisted(() => ({
  value: undefined as { error?: string; mfaRequired?: boolean; policy?: PasswordPolicy } | undefined,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useActionState: (_action: unknown, init: unknown) => [mockState.value ?? init, _action, false],
  };
});

import { SignInForm, AdminSetupForm } from "./auth-forms";
import { DEFAULT_PASSWORD_POLICY, SignInNotice, type PasswordPolicy } from "@/data/types";
import { SIGN_IN_PASSWORD_MAX_LENGTH, SIGN_IN_USERNAME_MAX_LENGTH } from "@/lib/validation-limits";

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

  it("caps username and password at the sign-in limits the server enforces", () => {
    render(<SignInForm action={noopAction} mfaAction={noopAction} />);
    expect(screen.getByLabelText("Username")).toHaveAttribute("maxlength", String(SIGN_IN_USERNAME_MAX_LENGTH));
    expect(screen.getByLabelText("Password")).toHaveAttribute("maxlength", String(SIGN_IN_PASSWORD_MAX_LENGTH));
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
        <AdminSetupForm action={noopAction} policy={DEFAULT_PASSWORD_POLICY} />
      </>
    );
    expect(screen.getByLabelText("Username")).toHaveFocus();
  });

  it("renders name, username and password fields", () => {
    render(<AdminSetupForm action={noopAction} policy={DEFAULT_PASSWORD_POLICY} />);
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    const username = screen.getByLabelText("Username");
    expect(username).toHaveAttribute("name", "username");
    expect(username).toHaveAttribute("minlength", "3");
    expect(username).toHaveAttribute("maxlength", "30");
    // Native constraints count UTF-16 units; the live rules count code points, so the browser must not enforce them.
    expect(screen.getByLabelText("Password")).not.toHaveAttribute("minlength");
    expect(screen.getByLabelText("Password")).not.toHaveAttribute("maxlength");
  });

  it("renders submit button", () => {
    render(<AdminSetupForm action={noopAction} policy={DEFAULT_PASSWORD_POLICY} />);
    expect(screen.getByRole("button", { name: /create admin account/i })).toBeInTheDocument();
  });

  it("shows error alert when state has error", () => {
    mockState.value = { error: "That username is taken." };
    render(<AdminSetupForm action={noopAction} policy={DEFAULT_PASSWORD_POLICY} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("That username is taken.")).toBeInTheDocument();
  });

  it("sets aria-invalid on inputs when there is an error", () => {
    mockState.value = { error: "Signup failed" };
    render(<AdminSetupForm action={noopAction} policy={DEFAULT_PASSWORD_POLICY} />);
    expect(screen.getByLabelText("Username")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Password")).toHaveAttribute("aria-invalid", "true");
  });
});

describe("admin setup contract", () => {
  it("renders required fields in order with password-manager support", () => {
    const { container } = render(<AdminSetupForm action={noopAction} policy={DEFAULT_PASSWORD_POLICY} />);
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
  });
  it("associates every setup field with errors", () => {
    mockState.value = { error: "Setup is already complete. Sign in to continue." };
    render(<AdminSetupForm action={noopAction} policy={DEFAULT_PASSWORD_POLICY} />);
    for (const label of ["Username", "Name", "Password", "Confirm password"]) {
      expect(screen.getByLabelText(label)).toHaveAttribute("aria-invalid", "true");
      expect(screen.getByLabelText(label)).toHaveAccessibleDescription(
        expect.stringContaining("Setup is already complete. Sign in to continue.")
      );
    }
  });
});

describe("AdminSetupForm password checklist", () => {
  const strict: PasswordPolicy = { ...DEFAULT_PASSWORD_POLICY, minUppercase: 1, minNumbers: 1 };

  it("shows the active requirements before typing, linked to the password field", () => {
    render(<AdminSetupForm action={noopAction} policy={strict} />);
    const list = screen.getByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(list.querySelector("svg")).toBeNull();
    expect(screen.getByLabelText("Password")).toHaveAttribute("aria-describedby", expect.stringContaining(list.id));
    expect(screen.getByLabelText("Confirm password")).not.toHaveAttribute(
      "aria-describedby",
      expect.stringContaining(list.id)
    );
  });

  it("checks and unchecks requirements as the password is edited, with no failure mark", async () => {
    const user = userEvent.setup();
    const { container } = render(<AdminSetupForm action={noopAction} policy={strict} />);
    const field = screen.getByLabelText("Password");
    await user.type(field, "Abcdefg1");
    expect(screen.getByRole("list").querySelectorAll("svg")).toHaveLength(3);
    await user.type(field, "{Backspace}");
    expect(screen.getByRole("list").querySelectorAll("svg")).toHaveLength(1);
    expect(container.querySelector(".lucide-x, .lucide-circle-x")).toBeNull();
  });

  it("refreshes the checklist from the rules a failed submission returns", () => {
    mockState.value = {
      error: "Password must be 8 to 20 characters.",
      policy: { ...DEFAULT_PASSWORD_POLICY, minLength: 12 },
    };
    render(<AdminSetupForm action={noopAction} policy={DEFAULT_PASSWORD_POLICY} />);
    expect(screen.getByRole("list")).toHaveTextContent("12 to 20 characters");
  });

  it("omits disabled classes", () => {
    render(<AdminSetupForm action={noopAction} policy={DEFAULT_PASSWORD_POLICY} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });
});
