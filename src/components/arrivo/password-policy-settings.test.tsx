import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_PASSWORD_POLICY, type PasswordPolicy } from "@/data/types";

const { savePasswordPolicySettings, refreshPasswordPolicy } = vi.hoisted(() => ({
  savePasswordPolicySettings: vi.fn(),
  refreshPasswordPolicy: vi.fn(),
}));
vi.mock("@/app/(app)/admin/security/actions", () => ({ savePasswordPolicySettings, refreshPasswordPolicy }));

import { PasswordPolicySettings } from "./password-policy-settings";

const initial = { status: "ok" as const, policy: DEFAULT_PASSWORD_POLICY };
const STRICT: PasswordPolicy = {
  minLength: 8,
  maxLength: 15,
  minUppercase: 2,
  minNumbers: 2,
  minSpecial: 2,
};

async function setCount(user: ReturnType<typeof userEvent.setup>, label: string, value: string) {
  const input = screen.getByLabelText(label);
  await user.clear(input);
  if (value) await user.type(input, value);
}

describe("PasswordPolicySettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refreshPasswordPolicy.mockResolvedValue(initial);
  });

  it("shows the saved rules and every control with its label", () => {
    render(<PasswordPolicySettings initial={initial} />);
    expect(screen.getByRole("heading", { name: "Password rules", level: 3 })).toBeInTheDocument();
    expect(screen.queryByText(/Saved rules/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Minimum length")).toHaveValue(8);
    expect(screen.getByLabelText("Maximum length")).toHaveValue(20);
    for (const label of ["Minimum uppercase letters", "Minimum numbers", "Minimum special characters"]) {
      expect(screen.getByLabelText(label)).toHaveValue(0);
    }
    // Only the length fields carry a range hint; the class minimums have no extra helper text.
    expect(screen.getByLabelText("Minimum length")).toHaveAccessibleDescription("8 to 16");
    expect(screen.getByLabelText("Maximum length")).toHaveAccessibleDescription("15 to 30");
    expect(screen.getByLabelText("Minimum numbers")).not.toHaveAttribute("aria-describedby");
    expect(screen.queryByText(/not required/)).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save password rules" })).toBeInTheDocument();
  });

  it("shows every saved value in its field", () => {
    render(<PasswordPolicySettings initial={{ status: "ok", policy: { ...STRICT, minLength: 9 } }} />);
    expect(screen.getByLabelText("Minimum length")).toHaveValue(9);
    expect(screen.getByLabelText("Maximum length")).toHaveValue(15);
    expect(screen.getByLabelText("Minimum uppercase letters")).toHaveValue(2);
    expect(screen.getByLabelText("Minimum numbers")).toHaveValue(2);
    expect(screen.getByLabelText("Minimum special characters")).toHaveValue(2);
    expect(screen.queryByText(/Saved rules/)).not.toBeInTheDocument();
  });

  it("shows a saved 0 as 0, not as an empty field", () => {
    render(<PasswordPolicySettings initial={{ status: "ok", policy: { ...STRICT, minNumbers: 0 } }} />);
    expect(screen.getByLabelText("Minimum numbers")).toHaveValue(0);
    expect(screen.getByLabelText("Minimum uppercase letters")).toHaveValue(2);
  });

  it("keeps every interactive target at least 44px tall", () => {
    render(<PasswordPolicySettings initial={initial} />);
    expect(screen.getByLabelText("Minimum length")).toHaveClass("h-11");
    expect(screen.getByRole("button", { name: "Save password rules" })).toHaveClass("h-11");
    for (const label of ["Minimum uppercase letters", "Minimum numbers", "Minimum special characters"]) {
      expect(screen.getByLabelText(label)).toHaveClass("h-11");
    }
  });

  it("does not save on edit, only on the explicit button", async () => {
    const user = userEvent.setup();
    render(<PasswordPolicySettings initial={initial} />);
    await setCount(user, "Minimum length", "12");
    await setCount(user, "Minimum numbers", "3");
    expect(savePasswordPolicySettings).not.toHaveBeenCalled();
  });

  it("saves the draft against the saved baseline without inline success text", async () => {
    const user = userEvent.setup();
    savePasswordPolicySettings.mockResolvedValue({ status: "ok", policy: STRICT });
    render(<PasswordPolicySettings initial={initial} />);
    await setCount(user, "Maximum length", "15");
    await setCount(user, "Minimum uppercase letters", "2");
    await setCount(user, "Minimum numbers", "2");
    await setCount(user, "Minimum special characters", "2");
    await user.click(screen.getByRole("button", { name: "Save password rules" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save password rules" })).toBeEnabled());
    expect(screen.queryByText("Password rules saved.")).not.toBeInTheDocument();
    expect(savePasswordPolicySettings).toHaveBeenCalledWith(STRICT, DEFAULT_PASSWORD_POLICY);
    // The saved values are what the form now shows.
    expect(screen.getByLabelText("Maximum length")).toHaveValue(15);
    expect(screen.getByLabelText("Minimum uppercase letters")).toHaveValue(2);
    expect(screen.getByLabelText("Minimum numbers")).toHaveValue(2);
    expect(screen.getByLabelText("Minimum special characters")).toHaveValue(2);
  });

  it("uses the newly saved rules as the baseline for the next save", async () => {
    const user = userEvent.setup();
    savePasswordPolicySettings.mockResolvedValue({
      status: "ok",
      policy: { ...DEFAULT_PASSWORD_POLICY, minLength: 10 },
    });
    render(<PasswordPolicySettings initial={initial} />);
    await setCount(user, "Minimum length", "10");
    await user.click(screen.getByRole("button", { name: "Save password rules" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save password rules" })).toBeEnabled());
    await setCount(user, "Minimum length", "11");
    await user.click(screen.getByRole("button", { name: "Save password rules" }));
    await waitFor(() => expect(savePasswordPolicySettings).toHaveBeenCalledTimes(2));
    expect(savePasswordPolicySettings.mock.calls[1][1]).toEqual({ ...DEFAULT_PASSWORD_POLICY, minLength: 10 });
  });

  it("disables the controls and keeps the label while saving", async () => {
    const user = userEvent.setup();
    let release: (value: unknown) => void = () => {};
    savePasswordPolicySettings.mockReturnValue(new Promise((resolve) => (release = resolve)));
    render(<PasswordPolicySettings initial={initial} />);
    await user.click(screen.getByRole("button", { name: "Save password rules" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save password rules" })).toBeDisabled());
    expect(screen.getByRole("button", { name: "Save password rules" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByLabelText("Minimum length")).toBeDisabled();
    release({ status: "ok", policy: DEFAULT_PASSWORD_POLICY });
    await waitFor(() => expect(screen.getByRole("button", { name: "Save password rules" })).toBeEnabled());
  });

  describe("invalid rules never reach the server", () => {
    it.each([
      [
        "minimum above maximum",
        { "Minimum length": "16", "Maximum length": "15" },
        "Minimum length",
        /can't be greater/,
      ],
      [
        "requirements that cannot fit",
        {
          "Maximum length": "15",
          "Minimum uppercase letters": "6",
          "Minimum numbers": "5",
          "Minimum special characters": "5",
        },
        "Maximum length",
        /add up to 16/,
      ],
      ["fraction", { "Minimum length": "8.5" }, "Minimum length", /whole number from 8 to 16/],
      ["blank", { "Maximum length": "" }, "Maximum length", /whole number from 15 to 30/],
      [
        "out of range minimum",
        { "Minimum uppercase letters": "21" },
        "Minimum uppercase letters",
        /whole number from 0 to 20/,
      ],
      ["negative minimum", { "Minimum numbers": "-1" }, "Minimum numbers", /whole number from 0 to 20/],
      [
        "blank minimum",
        { "Minimum special characters": "" },
        "Minimum special characters",
        /whole number from 0 to 20/,
      ],
    ])("%s: explains the problem and focuses the first invalid field", async (_name, edits, focused, text) => {
      const user = userEvent.setup();
      render(<PasswordPolicySettings initial={{ status: "ok", policy: DEFAULT_PASSWORD_POLICY }} />);
      for (const [label, value] of Object.entries(edits)) await setCount(user, label, value);
      await user.click(screen.getByRole("button", { name: "Save password rules" }));
      expect(await screen.findByRole("alert")).toHaveTextContent(text);
      expect(savePasswordPolicySettings).not.toHaveBeenCalled();
      await waitFor(() => expect(screen.getByLabelText(focused)).toHaveFocus());
      expect(screen.getByLabelText(focused)).toHaveAttribute("aria-invalid", "true");
      expect(screen.getByLabelText(focused)).toHaveAccessibleDescription(expect.stringMatching(text));
    });

    it("keeps the typed values for correction and leaves the saved baseline unchanged after a refused save", async () => {
      const user = userEvent.setup();
      render(<PasswordPolicySettings initial={initial} />);
      await setCount(user, "Minimum length", "16");
      await setCount(user, "Maximum length", "15");
      await user.click(screen.getByRole("button", { name: "Save password rules" }));
      await screen.findByRole("alert");
      expect(screen.getByLabelText("Minimum length")).toHaveValue(16);
      expect(screen.getByLabelText("Maximum length")).toHaveValue(15);
      // The next valid save is still compared against the original saved rules.
      savePasswordPolicySettings.mockResolvedValue({
        status: "ok",
        policy: { ...DEFAULT_PASSWORD_POLICY, minLength: 10 },
      });
      await setCount(user, "Minimum length", "10");
      await setCount(user, "Maximum length", "20");
      await user.click(screen.getByRole("button", { name: "Save password rules" }));
      await waitFor(() => expect(screen.getByRole("button", { name: "Save password rules" })).toBeEnabled());
      expect(savePasswordPolicySettings).toHaveBeenCalledWith(
        { ...DEFAULT_PASSWORD_POLICY, minLength: 10 },
        DEFAULT_PASSWORD_POLICY
      );
    });
  });

  it("shows a server validation error and focuses its field", async () => {
    const user = userEvent.setup();
    savePasswordPolicySettings.mockResolvedValue({ status: "invalid", error: "Server says no.", field: "maxLength" });
    render(<PasswordPolicySettings initial={initial} />);
    await user.click(screen.getByRole("button", { name: "Save password rules" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Server says no.");
    await waitFor(() => expect(screen.getByLabelText("Maximum length")).toHaveFocus());
  });

  it("shows a server validation error that names no field without moving focus", async () => {
    const user = userEvent.setup();
    savePasswordPolicySettings.mockResolvedValue({ status: "invalid", error: "Server says no." });
    render(<PasswordPolicySettings initial={initial} />);
    await user.click(screen.getByRole("button", { name: "Save password rules" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Server says no.");
  });

  it("on a stale save fills the form with the saved values, saves nothing and needs another deliberate save", async () => {
    const user = userEvent.setup();
    savePasswordPolicySettings.mockResolvedValue({ status: "stale" });
    refreshPasswordPolicy.mockResolvedValue({ status: "ok", policy: { ...DEFAULT_PASSWORD_POLICY, minLength: 12 } });
    render(<PasswordPolicySettings initial={initial} />);
    await setCount(user, "Maximum length", "18");
    await user.click(screen.getByRole("button", { name: "Save password rules" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Password rules changed elsewhere. Review the updated values"
    );
    // The form now shows the saved values, not the admin's unsaved edit.
    expect(screen.getByLabelText("Minimum length")).toHaveValue(12);
    expect(screen.getByLabelText("Maximum length")).toHaveValue(20);
    expect(savePasswordPolicySettings).toHaveBeenCalledTimes(1);
    // The next deliberate save is against the refreshed baseline.
    savePasswordPolicySettings.mockResolvedValue({
      status: "ok",
      policy: { ...DEFAULT_PASSWORD_POLICY, minLength: 12 },
    });
    await user.click(screen.getByRole("button", { name: "Save password rules" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save password rules" })).toBeEnabled());
    expect(savePasswordPolicySettings.mock.calls[1][1]).toEqual({ ...DEFAULT_PASSWORD_POLICY, minLength: 12 });
  });

  it("asks for a reload when a stale save cannot refresh the saved rules", async () => {
    const user = userEvent.setup();
    savePasswordPolicySettings.mockResolvedValue({ status: "stale" });
    refreshPasswordPolicy.mockRejectedValue(new Error("down"));
    render(<PasswordPolicySettings initial={initial} />);
    await user.click(screen.getByRole("button", { name: "Save password rules" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Reload this page");
    expect(screen.getByLabelText("Minimum length")).toHaveValue(8);
    expect(screen.getByLabelText("Maximum length")).toHaveValue(20);
  });

  it("asks for a reload when the refresh reports a lost authority", async () => {
    const user = userEvent.setup();
    savePasswordPolicySettings.mockResolvedValue({ status: "stale" });
    refreshPasswordPolicy.mockResolvedValue({ status: "forbidden" });
    render(<PasswordPolicySettings initial={initial} />);
    await user.click(screen.getByRole("button", { name: "Save password rules" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Reload this page");
  });

  it("explains lost authority", async () => {
    const user = userEvent.setup();
    savePasswordPolicySettings.mockResolvedValue({ status: "forbidden" });
    render(<PasswordPolicySettings initial={initial} />);
    await user.click(screen.getByRole("button", { name: "Save password rules" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Admin access is required to save password rules.");
    expect(screen.getByLabelText("Minimum length")).toHaveValue(8);
    expect(screen.getByLabelText("Maximum length")).toHaveValue(20);
  });

  it.each([
    ["an unavailable status", () => savePasswordPolicySettings.mockResolvedValue({ status: "unavailable" })],
    ["a thrown request", () => savePasswordPolicySettings.mockRejectedValue(new Error("network"))],
  ])("tells the admin the rules are unchanged after %s", async (_name, arrange) => {
    const user = userEvent.setup();
    arrange();
    render(<PasswordPolicySettings initial={initial} />);
    await setCount(user, "Minimum length", "12");
    await user.click(screen.getByRole("button", { name: "Save password rules" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The saved rules are unchanged");
    // The draft is kept so the admin can retry.
    expect(screen.getByLabelText("Minimum length")).toHaveValue(12);
    expect(screen.getByRole("button", { name: "Save password rules" })).toBeEnabled();
  });

  it("offers a retry, and no editable rules, when the saved rules could not be read", async () => {
    const user = userEvent.setup();
    refreshPasswordPolicy.mockResolvedValueOnce({ status: "unavailable" }).mockResolvedValueOnce(initial);
    render(<PasswordPolicySettings initial={{ status: "unavailable" }} />);
    expect(screen.getByText("Saved password rules unavailable.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Minimum length")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled());
    expect(screen.queryByLabelText("Minimum length")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByLabelText("Minimum length")).toHaveValue(8);
    expect(screen.getByLabelText("Maximum length")).toHaveValue(20);
    expect(screen.getByLabelText("Minimum numbers")).toHaveValue(0);
  });

  it("survives a failing retry", async () => {
    const user = userEvent.setup();
    refreshPasswordPolicy.mockRejectedValue(new Error("down"));
    render(<PasswordPolicySettings initial={{ status: "forbidden" }} />);
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled());
    expect(screen.getByText("Saved password rules unavailable.")).toBeInTheDocument();
  });

  it("saves 0 for every class as a valid policy", async () => {
    const user = userEvent.setup();
    const strictInitial = { status: "ok" as const, policy: STRICT };
    const cleared = { ...STRICT, minUppercase: 0, minNumbers: 0, minSpecial: 0 };
    savePasswordPolicySettings.mockResolvedValue({ status: "ok", policy: cleared });
    render(<PasswordPolicySettings initial={strictInitial} />);
    for (const label of ["Minimum uppercase letters", "Minimum numbers", "Minimum special characters"]) {
      await setCount(user, label, "0");
    }
    await user.click(screen.getByRole("button", { name: "Save password rules" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save password rules" })).toBeEnabled());
    expect(screen.queryByText("Password rules saved.")).not.toBeInTheDocument();
    expect(savePasswordPolicySettings).toHaveBeenCalledWith(cleared, STRICT);
    for (const label of ["Minimum uppercase letters", "Minimum numbers", "Minimum special characters"]) {
      expect(screen.getByLabelText(label)).toHaveValue(0);
    }
    expect(screen.getByLabelText("Maximum length")).toHaveValue(15);
  });
});
