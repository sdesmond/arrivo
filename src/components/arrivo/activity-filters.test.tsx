import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ActivityFilters, hasActivityFilters, type ActivityFiltersProps } from "./activity-filters";

const ACTOR_ID = "22222222-2222-4222-8222-222222222222";

function setup(overrides: Partial<ActivityFiltersProps> = {}) {
  const onChange = vi.fn();
  const onClear = vi.fn();
  render(
    <ActivityFilters
      query={{}}
      actors={[
        { id: ACTOR_ID, username: "alice" },
        { id: "33333333-3333-4333-8333-333333333333", username: "bob" },
      ]}
      timeZone="UTC"
      onChange={onChange}
      onClear={onClear}
      {...overrides}
    />
  );
  return { onChange, onClear };
}

describe("ActivityFilters", () => {
  it("labels every control and shows no Clear button without filters", () => {
    setup();
    expect(screen.getByRole("group", { name: "Activity filters" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Username" })).toHaveTextContent("All usernames");
    expect(screen.getByRole("combobox", { name: "Action" })).toHaveTextContent("All actions");
    expect(screen.getByLabelText("From")).toHaveAttribute("type", "date");
    expect(screen.getByLabelText("To")).toHaveAttribute("type", "date");
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
  });

  it("filters by the stable actor ID, chosen by keyboard", async () => {
    const user = userEvent.setup();
    const { onChange } = setup({ query: { cursor: "abc" } });
    screen.getByRole("combobox", { name: "Username" }).focus();
    await user.keyboard("{Enter}");
    await user.click(await screen.findByRole("option", { name: "alice" }));
    expect(onChange).toHaveBeenCalledWith({ actorId: ACTOR_ID });
  });

  it("filters by action and can return to all actions", async () => {
    const user = userEvent.setup();
    const { onChange } = setup({ query: { type: "trip_updated" } });
    const trigger = screen.getByRole("combobox", { name: "Action" });
    expect(trigger).toHaveTextContent("Updated trip");
    await user.click(trigger);
    await user.click(await screen.findByRole("option", { name: "All actions" }));
    expect(onChange).toHaveBeenCalledWith({});
  });

  it("converts the chosen days to the local day edges", async () => {
    const user = userEvent.setup();
    const { onChange } = setup({ timeZone: "America/Denver" });
    await user.type(screen.getByLabelText("From"), "2026-10-26");
    expect(onChange).toHaveBeenLastCalledWith({ from: "2026-10-26T06:00:00.000Z" });
    await user.type(screen.getByLabelText("To"), "2026-10-26");
    expect(onChange).toHaveBeenLastCalledWith({ to: "2026-10-27T05:59:59.999Z" });
  });

  it("shows stored instants as local days", () => {
    setup({ query: { from: "2026-10-26T06:00:00.000Z", to: "2026-10-27T05:59:59.999Z" }, timeZone: "America/Denver" });
    expect(screen.getByLabelText("From")).toHaveValue("2026-10-26");
    expect(screen.getByLabelText("To")).toHaveValue("2026-10-26");
  });

  it("clears a date back to no bound", async () => {
    const user = userEvent.setup();
    const { onChange } = setup({ query: { from: "2026-10-26T00:00:00.000Z" } });
    await user.clear(screen.getByLabelText("From"));
    expect(onChange).toHaveBeenLastCalledWith({});
  });

  it("offers Clear filters once any filter is set", async () => {
    const user = userEvent.setup();
    const { onClear } = setup({ query: { type: "sign_in" } });
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("keeps an unlisted actor selected without showing its ID", () => {
    setup({ query: { actorId: "99999999-9999-4999-8999-999999999999" } });
    expect(screen.getByRole("combobox", { name: "Username" })).toHaveTextContent("Unknown account");
    expect(document.body).not.toHaveTextContent("99999999");
  });

  it("describes an invalid range on the To field", () => {
    setup({ rangeError: true });
    const message = screen.getByText("Enter a start date that is on or before the end date.");
    expect(screen.getByLabelText("To")).toHaveAttribute("aria-describedby", message.id);
    expect(screen.getByLabelText("To")).toHaveAttribute("aria-invalid", "true");
  });

  it("makes every control at least 44px tall", () => {
    setup({ query: { type: "sign_in" } });
    expect(screen.getByRole("combobox", { name: "Username" }).className).toContain("data-[size=default]:h-11");
    expect(screen.getByLabelText("From").className).toContain("h-11");
    expect(screen.getByRole("button", { name: "Clear filters" }).className).toContain("h-11");
  });
});

describe("hasActivityFilters", () => {
  it("ignores the cursor", () => {
    expect(hasActivityFilters({ cursor: "x" })).toBe(false);
    expect(hasActivityFilters({ to: "2026-10-26T00:00:00.000Z" })).toBe(true);
  });
});
