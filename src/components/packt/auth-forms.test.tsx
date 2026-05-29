import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    className,
    style,
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
    style?: React.CSSProperties;
  }) => (
    <a href={href} className={className} style={style}>
      {children}
    </a>
  ),
}));

const mockState = vi.hoisted(() => ({ value: undefined as { error?: string } | undefined }));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useActionState: (_action: unknown, init: unknown) => [mockState.value ?? init, _action, false],
  };
});

import { SignInForm, SignUpForm } from "./auth-forms";

const noopAction = vi.fn(async () => undefined);

afterEach(() => {
  mockState.value = undefined;
});

describe("SignInForm", () => {
  it("renders email and password fields", () => {
    render(<SignInForm action={noopAction} />);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("renders submit button", () => {
    render(<SignInForm action={noopAction} />);
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("shows error alert when state has error", () => {
    mockState.value = { error: "Invalid credentials" };
    render(<SignInForm action={noopAction} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Invalid credentials")).toBeInTheDocument();
  });

  it("sets aria-invalid on inputs when there is an error", () => {
    mockState.value = { error: "Wrong password" };
    render(<SignInForm action={noopAction} />);
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Password")).toHaveAttribute("aria-invalid", "true");
  });
});

describe("SignUpForm", () => {
  it("renders name, email and password fields", () => {
    render(<SignUpForm action={noopAction} />);
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("renders submit button", () => {
    render(<SignUpForm action={noopAction} />);
    expect(screen.getByRole("button", { name: /create account/i })).toBeInTheDocument();
  });

  it("shows error alert when state has error", () => {
    mockState.value = { error: "Email already taken" };
    render(<SignUpForm action={noopAction} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Email already taken")).toBeInTheDocument();
  });

  it("sets aria-invalid on inputs when there is an error", () => {
    mockState.value = { error: "Signup failed" };
    render(<SignUpForm action={noopAction} />);
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Password")).toHaveAttribute("aria-invalid", "true");
  });
});
