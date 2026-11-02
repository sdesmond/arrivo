import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import AuthLayout from "./layout";

describe("AuthLayout", () => {
  it("shows prominent branding above auth content", () => {
    const { container } = render(
      <AuthLayout>
        <h1>Sign in or create admin account</h1>
      </AuthLayout>
    );

    expect(container.querySelector('img[aria-hidden="true"]')).toHaveAttribute("height", "80");
    expect(screen.getByRole("img", { name: "Arrivo" })).toHaveAttribute("height", "53");
    expect(screen.getByRole("heading", { name: "Sign in or create admin account" })).toBeInTheDocument();
  });
});
