import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_PASSWORD_POLICY, type PasswordPolicy } from "@/data/types";
import { PasswordRequirements } from "./password-requirements";

const STRICT: PasswordPolicy = {
  ...DEFAULT_PASSWORD_POLICY,
  minUppercase: 2,
  minNumbers: 1,
  minSpecial: 1,
};

function Harness({ policy = STRICT }: { policy?: PasswordPolicy }) {
  const [password, setPassword] = useState("");
  return (
    <>
      <input
        aria-label="Password"
        aria-describedby="rules"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      <PasswordRequirements id="rules" password={password} policy={policy} />
    </>
  );
}

function item(name: string) {
  return screen.getByText(name).closest("li") as HTMLElement;
}

afterEach(() => vi.restoreAllMocks());

describe("PasswordRequirements", () => {
  it("lists the active requirements before anything is typed, all with blank markers", () => {
    render(<PasswordRequirements id="rules" password="" policy={STRICT} />);
    const list = screen.getByRole("list");
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((entry) => entry.textContent)
    ).toEqual([
      "8 to 20 characters (not met)",
      "At least 2 uppercase letters (not met)",
      "At least 1 number (not met)",
      "At least 1 special character (not met)",
    ]);
    expect(list.querySelector("svg")).toBeNull();
  });

  it("omits disabled classes", () => {
    render(<PasswordRequirements id="rules" password="" policy={DEFAULT_PASSWORD_POLICY} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.queryByText(/uppercase|number|special/i)).not.toBeInTheDocument();
  });

  it("gives the list the id the field can describe itself with", () => {
    render(<Harness />);
    expect(screen.getByRole("textbox", { name: "Password" })).toHaveAccessibleDescription(/8 to 20 characters/);
    expect(screen.getByRole("list")).toHaveAttribute("id", "rules");
  });

  it("checks each requirement as it is satisfied and unchecks it when an edit breaks it", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const field = screen.getByRole("textbox", { name: "Password" });

    await user.type(field, "ABcdef1!");
    expect(item("8 to 20 characters").querySelector("svg")).not.toBeNull();
    expect(item("At least 2 uppercase letters").querySelector("svg")).not.toBeNull();
    expect(item("At least 1 number").querySelector("svg")).not.toBeNull();
    expect(item("At least 1 special character").querySelector("svg")).not.toBeNull();
    expect(screen.getAllByRole("listitem").every((entry) => entry.textContent?.endsWith("(met)"))).toBe(true);

    await user.type(field, "{Backspace}");
    expect(item("At least 1 special character").querySelector("svg")).toBeNull();
    expect(item("At least 1 special character")).toHaveTextContent("(not met)");
    expect(item("8 to 20 characters").querySelector("svg")).toBeNull();
    expect(item("At least 1 number").querySelector("svg")).not.toBeNull();

    await user.clear(field);
    expect(screen.getByRole("list").querySelector("svg")).toBeNull();
  });

  it("never shows an X marker", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    await user.type(screen.getByRole("textbox", { name: "Password" }), "a");
    expect(container.querySelector(".lucide-x, .lucide-circle-x, .lucide-x-circle")).toBeNull();
  });

  it("draws checkmarks with the 1.5 stroke weight", async () => {
    render(<PasswordRequirements id="rules" password="ABcdef1!" policy={STRICT} />);
    expect(screen.getAllByRole("listitem")[0].querySelector("svg")).toHaveAttribute("stroke-width", "1.5");
  });

  it("announces only changes of state, politely", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toBeEmptyDOMElement();

    await user.type(screen.getByRole("textbox", { name: "Password" }), "abcdefg");
    expect(status).toBeEmptyDOMElement();
    await user.type(screen.getByRole("textbox", { name: "Password" }), "h");
    expect(status).toHaveTextContent("Met: 8 to 20 characters");
    await user.type(screen.getByRole("textbox", { name: "Password" }), "{Backspace}");
    expect(status).toHaveTextContent("No longer met: 8 to 20 characters");
  });

  it("makes no requests while typing", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response());
    render(<Harness />);
    await user.type(screen.getByRole("textbox", { name: "Password" }), "ABcdef1!");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("re-evaluates against new rules when the policy changes", () => {
    const { rerender } = render(
      <PasswordRequirements id="rules" password="abcdefgh" policy={DEFAULT_PASSWORD_POLICY} />
    );
    expect(item("8 to 20 characters").querySelector("svg")).not.toBeNull();
    act(() =>
      rerender(
        <PasswordRequirements id="rules" password="abcdefgh" policy={{ ...DEFAULT_PASSWORD_POLICY, minLength: 12 }} />
      )
    );
    expect(item("12 to 20 characters").querySelector("svg")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("No longer met: 12 to 20 characters");
  });
});
