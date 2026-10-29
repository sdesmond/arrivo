import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { PasswordResetForm } from "./form";
it("labels password fields and allows password manager filling", () => {
  render(<PasswordResetForm action={vi.fn()} />);
  expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "new-password");
  expect(screen.getByLabelText("Confirm password")).toHaveAttribute("autocomplete", "new-password");
  expect(screen.getByRole("button", { name: "Reset password" })).toBeVisible();
});
