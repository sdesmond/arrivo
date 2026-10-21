import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const formStatus = vi.hoisted(() => ({ pending: false }));

vi.mock("react-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-dom")>()),
  useFormStatus: () => formStatus,
}));

import { AuthSubmitButton } from "./auth-submit-button";

describe("AuthSubmitButton", () => {
  it("shows its label while idle", () => {
    formStatus.pending = false;
    render(<AuthSubmitButton label="Verify" />);
    const button = screen.getByRole("button", { name: "Verify" });
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute("type", "submit");
  });

  it("disables itself and says so while the form submits", () => {
    formStatus.pending = true;
    render(<AuthSubmitButton label="Verify" />);
    const button = screen.getByRole("button", { name: "Please wait…" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });
});
